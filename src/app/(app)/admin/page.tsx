import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  BREAK_REASONS,
  activeRewards,
  allCurrentTasks,
  currentTasks,
  customTypes,
  familyName,
  openHelpRequests,
  openReports,
  pendingRedemptions,
  recentAudit,
  trackingStart,
} from "@/lib/data";
import { achievements, eventResults, finalizeEvents, standings } from "@/lib/stats";
import { currentRules, eventPrizes, eventThemes } from "@/lib/rules";
import { formatDate, formatMonth, formatStamp, startOfMonth, today } from "@/lib/dates";
import {
  addStarterRewards,
  markPrizeDelivered,
  removeReward,
  factoryReset,
  resetMember,
  resetProgress,
  resolveHelp,
  resolveRedemption,
  resolveReport,
  saveFamilyName,
  saveMember,
  saveReward,
  setTrackingStart,
} from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import BulkChanges from "@/components/BulkChanges";
import GiftCoinsForm from "@/components/GiftCoinsForm";
import Avatar from "@/components/Avatar";
import PhotoPicker from "@/components/PhotoPicker";
import Coin, { CoinAmount } from "@/components/Coin";
import RulesForm from "@/components/RulesForm";
import PrizeForm from "@/components/PrizeForm";
import Section, { SubSection } from "@/components/Section";
import { THEME_EMOJI, type ThemeSetting } from "@/lib/themes";
import { translator, type Lang } from "@/lib/i18n";
import { adminText, type AT } from "@/lib/i18n-admin";


/** A small coin amount box for the admin's decisions. */
function CoinInput({ name, defaultValue, label }: { name: string; defaultValue: number; label: string }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block truncate text-xs font-bold text-muted">{label}</span>
      <span className="relative block">
        <input name={name} type="number" min={0} max={1000} defaultValue={defaultValue} className="field py-2 pl-9 text-right font-black" />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <Coin size={16} />
        </span>
      </span>
    </label>
  );
}

const dangerBtn = "w-full rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50";

const themeName = (th: ThemeSetting, t: AT, lang: Lang) =>
  th === "rotate" ? t("admin.rotating") : `${THEME_EMOJI[th]} ${translator(lang)(`theme.${th}`)}`;


function RewardFields({ reward, t }: { reward?: { id: number; emoji: string; title: string; cost: number; hidden: number }; t: AT }) {
  return (
    <>
      {reward && <input type="hidden" name="id" value={reward.id} />}
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <input name="emoji" className="field text-center text-xl" placeholder="🎁" defaultValue={reward?.emoji} maxLength={8} aria-label={t("admin.emoji")} />
        <input name="title" className="field" placeholder={t("admin.rewardPlaceholder")} defaultValue={reward?.title} required maxLength={60} aria-label={t("admin.rewardLabel")} />
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
            aria-label={t("admin.cost")}
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Coin size={18} />
          </span>
        </span>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="hidden" defaultChecked={!!reward?.hidden} className="h-5 w-5 accent-brand" />
          {t("admin.mysteryLabel")}
        </label>
      </div>
    </>
  );
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const t = adminText(admin.lang);
  const lang = admin.lang;
  const short = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" }, lang);
  await finalizeEvents();
  const date = today();
  const [board, audit, requests, results, rewards, rules, prizes, family, themes, ownTypes, reports, helps, everyTask, trackStart, month, ach] = await Promise.all([
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
    openReports(),
    openHelpRequests(),
    allCurrentTasks(),
    trackingStart(),
    standings(startOfMonth(date), date),
    achievements(),
  ]);
  // A rank only means something once someone has actually scored.
  const monthRank = new Map(month.filter((s) => (s.score ?? 0) > 0).map((s) => [s.member.id, s.rank]));
  board.sort((a, b) => a.member.id - b.member.id);
  const taskCounts = await Promise.all(board.map((s) => currentTasks(s.member.id).then((t) => t.length)));
  const names = new Map(board.map((s) => [s.member.id, s.member]));
  // Real-world prizes still to hand over, plus the most recent ones already given.
  const toDeliver = results.filter((r) => r.prize_text && !r.delivered_at && names.has(r.member_id));
  const delivered = results.filter((r) => r.prize_text && r.delivered_at && names.has(r.member_id)).slice(0, 5);
  // Your own reward requests go to another admin, when there is one.
  const otherAdmins = board.some((s) => s.member.is_admin && s.member.id !== admin.id);
  const defaultPins = board.filter((s) => s.member.default_pin);
  const pickable = board.map(({ member: { id, name, color, has_photo, photo_version } }) => ({ id, name, color, has_photo, photo_version }));
  const attention = requests.length + toDeliver.length + reports.length + helps.length;
  const periodLabel = (r: { event: "week" | "month"; period: string }) =>
    r.event === "month" ? formatMonth(r.period, lang) : t("admin.weekOf", { date: formatDate(r.period, { day: "numeric", month: "short" }, lang) });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">{t("admin.title")}</h1>
        <p className="text-sm font-bold text-muted">{t("admin.sub")}</p>
      </div>


      <section id="members" className="scroll-mt-20 space-y-2.5">
        <h2 className="px-1 text-sm font-extrabold uppercase tracking-wider text-muted">{t("admin.members")}</h2>
        {defaultPins.length > 0 && (
          <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm text-orange-900">
            🔑 <b>{defaultPins.map((s) => s.member.name).join(", ")}</b> {t(defaultPins.length === 1 ? "admin.pinStillOne" : "admin.pinStillMany")}
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
                  {!!s.member.is_admin && <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 align-middle text-[11px] text-brand-dark">{t("admin.adminBadge")}</span>}
                  {!!s.member.default_pin && <span className="ml-1.5 rounded-full bg-orange-100 px-2 py-0.5 align-middle text-[11px] text-orange-800">PIN 0000</span>}
                </p>
                <p className="text-sm text-muted">
                  {count === 0 ? t("admin.noRoutine") : count === 1 ? t("admin.itemsOne") : t("admin.itemsMany", { n: count })}
                  {s.away
                    ? ` · ${BREAK_REASONS[s.away.reason].emoji} ${t("admin.onBreak")}`
                    : s.scheduled > 0 && ` · ${t("admin.todayCount", { done: s.done, total: s.scheduled })}`}
                  {s.streak > 1 && ` · 🔥${s.streak}`}
                </p>
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <CoinAmount value={ach.get(s.member.id)?.coins ?? 0} size={15} className="text-sm" />
                {(monthRank.get(s.member.id) ?? 0) > 0 && (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-black">
                    {["🥇", "🥈", "🥉"][monthRank.get(s.member.id)! - 1] ?? "#" + monthRank.get(s.member.id)} {t("admin.thisMonth")}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
        <p className="px-1 text-xs text-muted">{t("admin.tapHint")}</p>
      </section>

      <Section id="bulk" icon="🧰" title={t("admin.bulk")} hint={t("admin.bulkHint")}>
        <BulkChanges members={pickable} tasks={everyTask} customTypes={ownTypes} today={date} lang={lang} />
      </Section>

      <Section id="gift" icon="🎁" title={t("admin.gift")} hint={t("admin.giftHint")}>
        <GiftCoinsForm members={pickable} lang={lang} />
      </Section>

      <Section variant="add" icon="➕" title={t("admin.addMember")} hint={t("admin.addMemberHint")}>
        <ActionForm action={saveMember} resetOnSuccess className="space-y-4">
          <div>
            <label className="label" htmlFor="new-name">{t("admin.name")}</label>
            <input id="new-name" name="name" className="field" placeholder={t("admin.namePlaceholder")} required maxLength={40} />
          </div>
          <div>
            <span className="label">{t("admin.photo")}</span>
            <PhotoPicker lang={lang} />
          </div>
          <div>
            <label className="label" htmlFor="new-pin">{t("admin.theirPin")}</label>
            <input id="new-pin" name="pin" className="field tracking-[0.4em]" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="off" placeholder="0000" />
            <p className="mt-1 text-xs text-muted">{t("admin.pinHint")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="new-lang">{t("admin.language")}</label>
              <select id="new-lang" name="lang" className="field" defaultValue="en">
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-size">{t("admin.textSize")}</label>
              <select id="new-size" name="text_size" className="field" defaultValue="normal">
                <option value="normal">{t("admin.normal")}</option>
                <option value="large">{t("admin.large")}</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" name="is_admin" className="h-5 w-5 accent-brand" />
            {t("admin.alsoAdmin")}
          </label>
          <SubmitButton className="btn w-full" pendingText={t("admin.adding")}>
            {t("admin.addMemberBtn")}
          </SubmitButton>
        </ActionForm>
      </Section>

      <Section
        id="setup"
        icon="⚙️"
        title={t("admin.setup")}
        hint={t("admin.setupHint")}
      >
        <SubSection
          id="rules"
          icon="⚖️"
          title={t("admin.rules")}
          hint={t("admin.rulesHint", {
            w: `${rules.weight_exercise}/${rules.weight_supplement}/${rules.weight_medicine}`,
            c: `${rules.exercise_on_time}/${rules.supplement_on_time}/${rules.medicine_on_time}`,
          })}
        >
          <p className="mb-4 text-sm text-muted">{t("admin.rulesIntro")}</p>
          <RulesForm rules={rules} lang={lang} />
        </SubSection>

        <SubSection
          id="events"
          icon="🏆"
          title={t("admin.events")}
          hint={t("admin.eventsHint", { week: themeName(themes.week, t, lang), month: themeName(themes.month, t, lang) })}
        >
          <div className="space-y-5">
            <p className="text-sm text-muted">{t("admin.eventsIntro")}</p>
            <PrizeForm kind="week" prizes={prizes.week} theme={themes.week} lang={lang} />
            <PrizeForm kind="month" prizes={prizes.month} theme={themes.month} lang={lang} />
            {delivered.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">{t("admin.handedOver")}</p>
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
          title={t("admin.shop")}
          hint={
            rewards.length
              ? `${t("admin.shopCount", { n: rewards.length })}${rewards.some((r) => r.hidden) ? t("admin.shopMystery") : ""}`
              : t("admin.shopEmpty")
          }
        >
          <p className="mb-4 text-sm text-muted">{t("admin.shopIntro")}</p>
          {rewards.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {rewards.map((r) => (
                <li key={r.id}>
                  <details className="group/reward rounded-2xl bg-stone-50">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2">
                      <span className="text-2xl">{r.emoji}</span>
                      <span className="flex-1 text-sm font-bold">
                        {r.title}
                        {!!r.hidden && <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 text-[11px] font-black text-violet-700">{t("admin.mystery")}</span>}
                      </span>
                      <CoinAmount value={r.cost} className="text-sm" />
                      <span className="text-xs font-bold text-muted group-open/reward:hidden">{t("admin.edit")}</span>
                    </summary>
                    <div className="border-t border-line px-3 pb-3 pt-3">
                      <ActionForm action={saveReward}>
                        <RewardFields reward={r} t={t} />
                        <SubmitButton className="btn-ghost mt-2 w-full" pendingText={t("admin.saving")}>
                          {t("admin.save")}
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={removeReward} confirm={t("admin.removeRewardQ", { title: r.title })} className="mt-1 text-center">
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton className="btn-danger" pendingText="…">
                          {t("admin.removeFromShop")}
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <ActionForm action={addStarterRewards} className="mb-4">
              <SubmitButton className="btn-ghost w-full" pendingText={t("admin.adding")}>
                {t("admin.starter")}
              </SubmitButton>
            </ActionForm>
          )}
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">{t("admin.addReward")}</p>
          <ActionForm action={saveReward} resetOnSuccess>
            <RewardFields t={t} />
            <SubmitButton className="btn mt-2 w-full" pendingText={t("admin.adding")}>
              {t("admin.addRewardBtn")}
            </SubmitButton>
          </ActionForm>
        </SubSection>

        <SubSection icon="🏡" title={t("admin.familyName")} hint={family}>
          <ActionForm action={saveFamilyName} className="flex gap-2">
            <input name="family" className="field" defaultValue={family} required maxLength={60} aria-label={t("admin.familyName")} />
            <SubmitButton className="btn-ghost shrink-0" pendingText={t("admin.saving")}>
              {t("admin.save")}
            </SubmitButton>
          </ActionForm>
        </SubSection>

        <SubSection
          id="reset"
          icon="🔄"
          title={t("admin.tracking")}
          hint={trackStart ? t("admin.countingFrom", { date: short(trackStart) }) : t("admin.countingAll")}
        >
          <div className="space-y-5">
            <div>
              <p className="text-sm font-extrabold">{t("admin.startFrom")}</p>
              <p className="mb-2 text-xs text-muted">{t("admin.startFromHint")}</p>
              <ActionForm action={setTrackingStart} className="flex gap-2">
                <input type="date" name="date" className="field" defaultValue={trackStart ?? date} required aria-label={t("admin.trackingLabel")} />
                <SubmitButton className="btn-ghost shrink-0" pendingText={t("admin.saving")}>
                  {t("admin.save")}
                </SubmitButton>
              </ActionForm>
              {trackStart && (
                <ActionForm action={setTrackingStart} className="mt-1">
                  <input type="hidden" name="clear" value="1" />
                  <SubmitButton className="text-xs font-bold text-muted underline" pendingText="…">
                    {t("admin.countAll")}
                  </SubmitButton>
                </ActionForm>
              )}
            </div>

            <div className="space-y-2 rounded-2xl border border-red-200 p-3">
              <p className="text-sm font-extrabold text-red-700">{t("admin.danger")}</p>
              <p className="text-xs text-muted">{t("admin.dangerHint")}</p>

              <details className="rounded-xl bg-stone-50">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                  {t("admin.resetOne")} <span className="block text-xs font-semibold text-muted">{t("admin.resetOneHint")}</span>
                </summary>
                <ActionForm action={resetMember} resetOnSuccess className="space-y-2 px-3 pb-3">
                  <select name="id" className="field" required defaultValue="" aria-label={t("admin.personToReset")}>
                    <option value="" disabled>
                      {t("admin.choosePerson")}
                    </option>
                    {board.map((s) => (
                      <option key={s.member.id} value={s.member.id}>
                        {s.member.name}
                      </option>
                    ))}
                  </select>
                  <input name="confirm" className="field" placeholder={t("admin.typeName")} autoComplete="off" required />
                  <SubmitButton className={dangerBtn} pendingText={t("admin.resetting")}>
                    {t("admin.resetOneBtn")}
                  </SubmitButton>
                </ActionForm>
              </details>

              <details className="rounded-xl bg-stone-50">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                  {t("admin.resetAll")} <span className="block text-xs font-semibold text-muted">{t("admin.resetAllHint")}</span>
                </summary>
                <ActionForm action={resetProgress} resetOnSuccess className="space-y-2 px-3 pb-3">
                  <input name="confirm" className="field" placeholder={t("admin.typeReset")} autoComplete="off" required />
                  <SubmitButton className={dangerBtn} pendingText={t("admin.resetting")}>
                    {t("admin.resetAllBtn")}
                  </SubmitButton>
                </ActionForm>
              </details>

              <details className="rounded-xl bg-stone-50">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                  {t("admin.factory")} <span className="block text-xs font-semibold text-muted">{t("admin.factoryHint")}</span>
                </summary>
                <ActionForm action={factoryReset} confirm={t("admin.factoryConfirm")} className="space-y-2 px-3 pb-3">
                  <input name="confirm" className="field" placeholder={t("admin.typeFamily", { family })} autoComplete="off" required />
                  <SubmitButton className={dangerBtn} pendingText={t("admin.deleting")}>
                    {t("admin.factoryBtn")}
                  </SubmitButton>
                </ActionForm>
              </details>
            </div>
          </div>
        </SubSection>

        {audit.length > 0 && (
          <SubSection id="log" icon="📜" title={t("admin.log")} hint={`${audit[0].actor ?? t("admin.someone")}: ${audit[0].action}`}>
            <ul className="space-y-2 text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span>
                    <b>{a.actor ?? t("admin.someone")}:</b> {a.action}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatStamp(a.at)}</span>
                </li>
              ))}
            </ul>
          </SubSection>
        )}
      </Section>

      {attention > 0 && (
        <Section
          id="attention"
          variant="alert"
          icon="🛎️"
          title={t("admin.attention")}
          hint={[
            reports.length && t("admin.cReports", { n: reports.length }),
            helps.length && t("admin.cHelp", { n: helps.length }),
            requests.length && t("admin.cRequests", { n: requests.length }),
            toDeliver.length && t("admin.cPrizes", { n: toDeliver.length }),
          ]
            .filter(Boolean)
            .join(" · ")}
          badge={
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-black text-white">
              {attention}
            </span>
          }
        >
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={`rep${r.id}`} className="rounded-2xl bg-red-50/70 p-3">
                <p className="text-sm">
                  🚩 <b>{t("admin.reportLine", { reporter: r.reporter_name, member: r.member_name, title: r.title })}</b>{" "}
                  <span className="text-muted">({short(r.date)})</span>
                </p>
                {r.reason && <p className="mt-1.5 rounded-xl bg-white px-3 py-2 text-sm italic">“{r.reason}”</p>}
                {(r.member_id === admin.id || r.reporter_id === admin.id) && otherAdmins ? (
                  <p className="mt-1 text-xs text-muted">{t("admin.partOf")}</p>
                ) : (
                  <>
                    <ActionForm action={resolveReport} className="mt-2 space-y-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="uphold" />
                      <div className="flex gap-2">
                        <CoinInput name="penalty" defaultValue={5} label={t("admin.takeFrom", { name: r.member_name })} />
                        <CoinInput name="reward" defaultValue={2} label={t("admin.giveTo", { name: r.reporter_name })} />
                      </div>
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input type="checkbox" name="untick" defaultChecked className="h-4 w-4 accent-brand" />
                        {t("admin.untick")}
                      </label>
                      <SubmitButton className="btn w-full py-2 text-sm">{t("admin.uphold")}</SubmitButton>
                    </ActionForm>
                    <ActionForm action={resolveReport} confirm={t("admin.dismissQ")} className="mt-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="dismiss" />
                      <SubmitButton className="btn-ghost w-full py-2 text-sm" pendingText="…">
                        {t("admin.dismiss")}
                      </SubmitButton>
                    </ActionForm>
                  </>
                )}
              </li>
            ))}
            {helps.map((h) => (
              <li key={`help${h.id}`} className="rounded-2xl bg-emerald-50/70 p-3">
                <p className="text-sm">
                  🤝 <b>{t("admin.helped", { helper: h.member_name, helped: h.helped_name })}</b>
                </p>
                <p className="mt-1.5 rounded-xl bg-white px-3 py-2 text-sm italic">“{h.note}”</p>
                {h.member_id === admin.id && otherAdmins ? (
                  <p className="mt-1 text-xs text-muted">{t("admin.ownRequest")}</p>
                ) : (
                  <div className="mt-2 flex items-end gap-2">
                    <ActionForm action={resolveHelp} className="flex flex-1 items-end gap-2">
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <CoinInput name="coins" defaultValue={5} label={t("admin.coinsToGive")} />
                      <SubmitButton className="btn shrink-0 px-3 py-2 text-sm">{t("admin.give")}</SubmitButton>
                    </ActionForm>
                    <ActionForm action={resolveHelp} confirm={t("admin.declineQ")}>
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="decision" value="decline" />
                      <SubmitButton className="btn-ghost px-3 py-2 text-sm" pendingText="…">
                        {t("admin.decline")}
                      </SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </li>
            ))}
            {requests.map((r) => (
              <li key={`r${r.id}`} className="rounded-2xl bg-amber-50/60 p-3">
                <p className="font-bold">
                  {r.emoji} {t("admin.wants", { name: r.member_name, title: r.title })} <span className="text-sm">· <CoinAmount value={r.cost} size={14} /></span>
                </p>
                {r.member_id === admin.id && otherAdmins ? (
                  <p className="mt-1 text-xs text-muted">{t("admin.ownApprove")}</p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <ActionForm action={resolveRedemption} className="flex-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="given" />
                      <SubmitButton className="btn w-full py-2 text-sm">{t("admin.given")}</SubmitButton>
                    </ActionForm>
                    <ActionForm action={resolveRedemption} confirm={t("admin.declineReturn")} className="flex-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="declined" />
                      <SubmitButton className="btn-ghost w-full py-2 text-sm">{t("admin.decline")}</SubmitButton>
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
                      {["🥇", "🥈", "🥉"][g.place - 1]} {t("admin.won", { name: names.get(g.member_id)!.name, prize: g.prize_text })}
                    </b>
                    <span className="block text-xs text-muted">{periodLabel(g)}</span>
                  </p>
                </div>
                <ActionForm action={markPrizeDelivered} className="mt-2 flex gap-2">
                  <input type="hidden" name="event" value={g.event} />
                  <input type="hidden" name="period" value={g.period} />
                  <input type="hidden" name="member_id" value={g.member_id} />
                  <input name="note" className="field py-2 text-sm" placeholder={t("admin.note")} maxLength={120} />
                  <SubmitButton className="btn shrink-0 px-3 py-2 text-sm">{t("admin.delivered")}</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
