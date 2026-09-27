import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { BREAK_REASONS, activeRewards, currentTasks, customTypes, familyName, pendingRedemptions, recentAudit } from "@/lib/data";
import { eventResults, finalizeEvents, standings } from "@/lib/stats";
import { currentRules, eventPrizes, eventThemes } from "@/lib/rules";
import { formatDate, formatMonth, formatStamp, today } from "@/lib/dates";
import {
  addStarterRewards,
  markPrizeDelivered,
  removeReward,
  resolveRedemption,
  saveFamilyName,
  saveMember,
  saveReward,
  saveTask,
} from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import AddTaskForm from "@/components/AddTaskForm";
import Avatar from "@/components/Avatar";
import PhotoPicker from "@/components/PhotoPicker";
import Coin, { CoinAmount } from "@/components/Coin";
import RulesForm from "@/components/RulesForm";
import PrizeForm from "@/components/PrizeForm";
import Section, { SubSection } from "@/components/Section";
import { THEME_EMOJI, type ThemeSetting } from "@/lib/themes";
import { translator } from "@/lib/i18n";

const en = translator("en");
const themeName = (t: ThemeSetting) => (t === "rotate" ? "🔄 rotating" : `${THEME_EMOJI[t]} ${en(`theme.${t}`)}`);


function RewardFields({ reward }: { reward?: { id: number; emoji: string; title: string; cost: number; hidden: number } }) {
  return (
    <>
      {reward && <input type="hidden" name="id" value={reward.id} />}
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <input name="emoji" className="field text-center text-xl" placeholder="🎁" defaultValue={reward?.emoji} maxLength={8} aria-label="Emoji" />
        <input name="title" className="field" placeholder="Reward, e.g. Pizza night" defaultValue={reward?.title} required maxLength={60} aria-label="Reward" />
      </div>
      <div className="mt-2 grid grid-cols-[8rem_1fr] items-center gap-2">
        <span className="relative block">
          <input
            name="cost"
            type="number"
            min={1}
            max={10000}
            className="field pl-9 text-right font-black"
            placeholder="150"
            defaultValue={reward?.cost}
            required
            aria-label="Cost in coins"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Coin size={18} />
          </span>
        </span>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="hidden" defaultChecked={!!reward?.hidden} className="h-5 w-5 accent-brand" />
          ❓ Mystery (hidden until bought)
        </label>
      </div>
    </>
  );
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  await finalizeEvents();
  const date = today();
  const [board, audit, requests, results, rewards, rules, prizes, family, themes, ownTypes] = await Promise.all([
    standings(date, date),
    recentAudit(),
    pendingRedemptions(),
    eventResults(),
    activeRewards(),
    currentRules(),
    eventPrizes(),
    familyName(),
    eventThemes(),
    customTypes(),
  ]);
  board.sort((a, b) => a.member.id - b.member.id);
  const taskCounts = await Promise.all(board.map((s) => currentTasks(s.member.id).then((t) => t.length)));
  const names = new Map(board.map((s) => [s.member.id, s.member]));
  // Real-world prizes still to hand over, plus the most recent ones already given.
  const toDeliver = results.filter((r) => r.prize_text && !r.delivered_at && names.has(r.member_id));
  const delivered = results.filter((r) => r.prize_text && r.delivered_at && names.has(r.member_id)).slice(0, 5);
  // Your own reward requests go to another admin, when there is one.
  const otherAdmins = board.some((s) => s.member.is_admin && s.member.id !== admin.id);
  const defaultPins = board.filter((s) => s.member.default_pin);
  const periodLabel = (r: { event: "week" | "month"; period: string }) =>
    r.event === "month" ? formatMonth(r.period) : `Week of ${formatDate(r.period, { day: "numeric", month: "short" })}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Admin</h1>
        <p className="text-sm font-bold text-muted">You decide the routines, rules, rewards and prizes. Events run by themselves.</p>
      </div>


      {(requests.length > 0 || toDeliver.length > 0) && (
        <Section
          id="attention"
          variant="alert"
          icon="🛎️"
          title="Needs your attention"
          hint={[
            requests.length && `${requests.length} reward request${requests.length === 1 ? "" : "s"}`,
            toDeliver.length && `${toDeliver.length} prize${toDeliver.length === 1 ? "" : "s"} to hand over`,
          ]
            .filter(Boolean)
            .join(" · ")}
          badge={
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-black text-white">
              {requests.length + toDeliver.length}
            </span>
          }
        >
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={`r${r.id}`} className="rounded-2xl bg-amber-50/60 p-3">
                <p className="font-bold">
                  {r.emoji} <b>{r.member_name}</b> wants “{r.title}” <span className="text-sm">· <CoinAmount value={r.cost} size={14} /></span>
                </p>
                {r.member_id === admin.id && otherAdmins ? (
                  <p className="mt-1 text-xs text-muted">Your own request: another admin will approve it.</p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <ActionForm action={resolveRedemption} className="flex-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="given" />
                      <SubmitButton className="btn w-full py-2 text-sm">✓ Given</SubmitButton>
                    </ActionForm>
                    <ActionForm action={resolveRedemption} confirm="Decline and return the coins?" className="flex-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="declined" />
                      <SubmitButton className="btn-ghost w-full py-2 text-sm">Decline</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </li>
            ))}
            {toDeliver.map((g) => (
              <li key={`p${g.event}${g.period}${g.member_id}`} className="rounded-2xl bg-amber-50/60 p-3">
                <div className="flex items-center gap-3">
                  <Avatar member={names.get(g.member_id)!} size={36} />
                  <p className="min-w-0 flex-1 text-sm">
                    <b>
                      {["🥇", "🥈", "🥉"][g.place - 1]} {names.get(g.member_id)!.name}
                    </b>{" "}
                    won <b>{g.prize_text}</b>
                    <span className="block text-xs text-muted">{periodLabel(g)}</span>
                  </p>
                </div>
                <ActionForm action={markPrizeDelivered} className="mt-2 flex gap-2">
                  <input type="hidden" name="event" value={g.event} />
                  <input type="hidden" name="period" value={g.period} />
                  <input type="hidden" name="member_id" value={g.member_id} />
                  <input name="note" className="field py-2 text-sm" placeholder="Note (optional)" maxLength={120} />
                  <SubmitButton className="btn shrink-0 px-3 py-2 text-sm">Delivered</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <section id="members" className="scroll-mt-20 space-y-2.5">
        <h2 className="px-1 text-sm font-extrabold uppercase tracking-wider text-muted">Family members</h2>
        {defaultPins.length > 0 && (
          <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm text-orange-900">
            🔑 <b>{defaultPins.map((s) => s.member.name).join(", ")}</b> {defaultPins.length === 1 ? "is" : "are"} still on the starting PIN{" "}
            <b>0000</b>. That&apos;s fine to begin with, but once the app is online anyone with the link could log in as them. Tap a
            person to give them their own PIN.
          </p>
        )}
        {board.map((s, i) => {
          const count = taskCounts[i];
          return (
            <Link key={s.member.id} href={`/admin/member/${s.member.id}`} className="card flex items-center gap-3 py-3 transition active:scale-[0.99]">
              <Avatar member={s.member} size={52} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-extrabold">
                  {s.member.name}
                  {!!s.member.is_admin && <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 align-middle text-[11px] text-brand-dark">ADMIN</span>}
                  {!!s.member.default_pin && <span className="ml-1.5 rounded-full bg-orange-100 px-2 py-0.5 align-middle text-[11px] text-orange-800">PIN 0000</span>}
                </p>
                <p className="text-sm text-muted">
                  {count === 0 ? "⚠️ No routine yet, tap to add" : `${count} routine item${count === 1 ? "" : "s"}`}
                  {s.away ? ` · ${BREAK_REASONS[s.away.reason].emoji} on a break` : s.scheduled > 0 && ` · today ${s.done}/${s.scheduled}`}
                  {s.streak > 1 && ` · 🔥${s.streak}`}
                </p>
              </div>
              <span className="text-sm font-bold text-muted">Edit ›</span>
            </Link>
          );
        })}
        <p className="px-1 text-xs text-muted">Tap someone to change their name, photo, PIN, routine or breaks.</p>
      </section>

      {board.length > 1 && (
        <Section id="add-many" variant="add" icon="👨‍👩‍👧" title="Add one item for several people" hint="e.g. protein every day for everyone">
          <AddTaskForm
            members={board.map(({ member: { id, name, color, has_photo, photo_version } }) => ({ id, name, color, has_photo, photo_version }))}
            action={saveTask}
            customTypes={ownTypes}
          />
        </Section>
      )}

      <Section variant="add" icon="➕" title="Add a family member" hint="Name, photo, PIN (0000 if empty), language">
        <ActionForm action={saveMember} resetOnSuccess className="space-y-4">
          <div>
            <label className="label" htmlFor="new-name">Name</label>
            <input id="new-name" name="name" className="field" placeholder="e.g. Mom, Grandpa, Riya" required maxLength={40} />
          </div>
          <div>
            <span className="label">Photo</span>
            <PhotoPicker />
          </div>
          <div>
            <label className="label" htmlFor="new-pin">Their PIN (optional)</label>
            <input id="new-pin" name="pin" className="field tracking-[0.4em]" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="off" placeholder="0000" />
            <p className="mt-1 text-xs text-muted">Leave empty to start with 0000. You can set a proper PIN for them any time.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="new-lang">Language</label>
              <select id="new-lang" name="lang" className="field" defaultValue="en">
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-size">Text size</label>
              <select id="new-size" name="text_size" className="field" defaultValue="normal">
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" name="is_admin" className="h-5 w-5 accent-brand" />
            Also make them an admin
          </label>
          <SubmitButton className="btn w-full" pendingText="Adding…">
            Add member
          </SubmitButton>
        </ActionForm>
      </Section>

      <Section
        id="setup"
        icon="⚙️"
        title="Setup"
        hint="Rules & coins, events & prizes, coin shop, family name, recent changes"
      >
        <SubSection
          id="rules"
          icon="⚖️"
          title="Rules & coins"
          hint={`Weights ${rules.weight_exercise}/${rules.weight_supplement}/${rules.weight_medicine} · on time ${rules.exercise_on_time}/${rules.supplement_on_time}/${rules.medicine_on_time} coins`}
        >
          <p className="mb-4 text-sm text-muted">How much each activity counts towards the score, and how many coins everything earns.</p>
          <RulesForm rules={rules} />
        </SubSection>

        <SubSection id="events" icon="🏆" title="Events & prizes" hint={`Weekly: ${themeName(themes.week)} · Monthly: ${themeName(themes.month)}`}>
          <div className="space-y-5">
            <p className="text-sm text-muted">
              A weekly challenge (Monday to Sunday) and a monthly championship run automatically with a live countdown. At 10 AM
              the day after one ends (once last-minute ticks are in), the top places are locked in, prize coins are added and winners
              get a notification. You choose what each event is judged on and the prizes.
            </p>
            <PrizeForm kind="week" prizes={prizes.week} theme={themes.week} />
            <PrizeForm kind="month" prizes={prizes.month} theme={themes.month} />
            {delivered.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">Recently handed over</p>
                <ul className="space-y-1 text-sm">
                  {delivered.map((g) => (
                    <li key={`${g.event}${g.period}${g.member_id}`}>
                      ✓ {names.get(g.member_id)!.name}: {g.prize_text} <span className="text-muted">({periodLabel(g)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SubSection>

        <SubSection
          id="shop"
          icon={<Coin size={22} />}
          title="Coin shop"
          hint={rewards.length ? `${rewards.length} reward${rewards.length === 1 ? "" : "s"}${rewards.some((r) => r.hidden) ? ", incl. a mystery one" : ""}` : "Empty: add some rewards"}
        >
          <p className="mb-4 text-sm text-muted">
            Rewards anyone can buy with coins. Tap one to change it. A ❓ mystery reward shows as “Mystery reward” until someone buys it.
          </p>
          {rewards.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {rewards.map((r) => (
                <li key={r.id}>
                  <details className="group/reward rounded-2xl bg-stone-50">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2">
                      <span className="text-2xl">{r.emoji}</span>
                      <span className="flex-1 text-sm font-bold">
                        {r.title}
                        {!!r.hidden && <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 text-[11px] font-black text-violet-700">❓ mystery</span>}
                      </span>
                      <CoinAmount value={r.cost} className="text-sm" />
                      <span className="text-xs font-bold text-muted group-open/reward:hidden">Edit</span>
                    </summary>
                    <div className="border-t border-line px-3 pb-3 pt-3">
                      <ActionForm action={saveReward}>
                        <RewardFields reward={r} />
                        <SubmitButton className="btn-ghost mt-2 w-full">Save</SubmitButton>
                      </ActionForm>
                      <ActionForm action={removeReward} confirm={`Remove "${r.title}" from the shop?`} className="mt-1 text-center">
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton className="btn-danger" pendingText="…">
                          Remove from shop
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <ActionForm action={addStarterRewards} className="mb-4">
              <SubmitButton className="btn-ghost w-full" pendingText="Adding…">
                ✨ Add 7 starter rewards (movie pick, skip dishes, a mystery gift…)
              </SubmitButton>
            </ActionForm>
          )}
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">Add a reward</p>
          <ActionForm action={saveReward} resetOnSuccess>
            <RewardFields />
            <SubmitButton className="btn mt-2 w-full">Add reward</SubmitButton>
          </ActionForm>
        </SubSection>

        <SubSection icon="🏡" title="Family name" hint={family}>
          <ActionForm action={saveFamilyName} className="flex gap-2">
            <input name="family" className="field" defaultValue={family} required maxLength={60} aria-label="Family name" />
            <SubmitButton className="btn-ghost shrink-0">Save</SubmitButton>
          </ActionForm>
        </SubSection>

        {audit.length > 0 && (
          <SubSection id="log" icon="📜" title="Recent changes" hint={`${audit[0].actor ?? "Someone"}: ${audit[0].action}`}>
            <ul className="space-y-2 text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span>
                    <b>{a.actor ?? "Someone"}:</b> {a.action}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatStamp(a.at)}</span>
                </li>
              ))}
            </ul>
          </SubSection>
        )}
      </Section>
    </div>
  );
}
