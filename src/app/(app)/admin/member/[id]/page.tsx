import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { BREAK_REASONS, activeMembers, currentTasks, customTypes, getMember, recentBreaks, tasksForDay } from "@/lib/data";
import { kindEmoji } from "@/lib/kinds";
import { formatDate, today } from "@/lib/dates";
import { copyTask, endBreak, removeMember, removeTask, saveMember, saveTask, startBreak } from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import Avatar, { photoUrl } from "@/components/Avatar";
import PhotoPicker from "@/components/PhotoPicker";
import BreakFields from "@/components/BreakFields";
import TaskFields, { IMPORTANCE, scheduleLabel } from "@/components/TaskFields";
import Section, { SubSection } from "@/components/Section";
import AddTaskForm from "@/components/AddTaskForm";
import MemberPicker from "@/components/MemberPicker";
import RemoveManyForm from "@/components/RemoveManyForm";
import EmptyState from "@/components/EmptyState";

const short = (d: string) => formatDate(d, { day: "numeric", month: "short" });

export default async function MemberAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const member = await getMember(Number(id));
  if (!member?.active) notFound();

  const date = today();
  const [tasks, todayItems, breaks, ownTypes, everyone] = await Promise.all([
    currentTasks(member.id),
    tasksForDay(member.id, date),
    recentBreaks(member.id),
    customTypes(),
    activeMembers(),
  ]);
  const family = everyone.map(({ id, name, color, has_photo, photo_version }) => ({ id, name, color, has_photo, photo_version }));
  const others = family.filter((m) => m.id !== member.id);
  const doneToday = new Set(todayItems.filter((t) => t.checkin).map((t) => t.id));
  const self = member.id === admin.id;

  const current = breaks.find((b) => b.start_date <= date && date <= b.end_date);
  const upcoming = breaks.find((b) => b.start_date > date);
  const doneCount = todayItems.filter((t) => t.checkin).length;

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm font-bold text-muted">
        ‹ All members
      </Link>

      <div className="flex items-center gap-4">
        <Avatar member={member} size={72} />
        <div className="min-w-0">
          <h1 className="text-2xl font-black">
            {member.name}
            {!!member.default_pin && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 align-middle text-xs text-orange-800">PIN 0000</span>}
          </h1>
          <p className="text-sm font-bold text-muted">
            {tasks.length ? `${tasks.length} routine items` : "No routine yet"}
            {todayItems.length > 0 && ` · today ${doneCount}/${todayItems.length} done`}
            {current && ` · ${BREAK_REASONS[current.reason].emoji} on a break`}
          </p>
        </div>
      </div>

      <section className="space-y-2.5">
        <h2 className="px-1 text-sm font-extrabold uppercase tracking-wider text-muted">Routine</h2>
        {tasks.length === 0 && (
          <EmptyState
            title="No routine yet"
            text={`Add ${member.name}'s first exercise, supplement or medicine. Quick-add templates make it one tap.`}
            action={{ href: "#add", label: "Add the first item" }}
          />
        )}
        {tasks.map((t) => {
          return (
            <details key={t.id} className="card group/item py-3">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <span className="text-2xl">{kindEmoji(t.kind, t.custom_emoji)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">{t.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {scheduleLabel(t)}
                    {t.weight > 1 && ` · ${IMPORTANCE.find((w) => w.v === t.weight)?.l} ×${t.weight}`}
                    {t.details && ` · ${t.details}`}
                  </span>
                </span>
                {t.coins != null && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-black text-amber-800">+{t.coins}</span>}
                {t.penalty > 0 && <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-black text-red-600">−{t.penalty}</span>}
                {doneToday.has(t.id) && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">✓ today</span>}
                <span className="text-sm font-bold text-muted group-open/item:hidden">Edit</span>
              </summary>
              <div className="mt-4 border-t border-line pt-4">
                <ActionForm action={saveTask}>
                  <TaskFields memberId={member.id} id={t.id} values={t} customTypes={ownTypes} />
                  <SubmitButton className="btn mt-4 w-full">Save changes</SubmitButton>
                </ActionForm>
                {others.length > 0 && (
                  <details className="group/copy mt-3 rounded-2xl border border-line">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                      <span>👥</span>
                      <span className="flex-1">
                        Give this to others too
                        <span className="block text-xs font-semibold text-muted">Same settings, added to their routines</span>
                      </span>
                      <span className="text-muted transition-transform group-open/copy:rotate-180">⌄</span>
                    </summary>
                    <ActionForm action={copyTask} resetOnSuccess className="border-t border-line p-3">
                      <input type="hidden" name="id" value={t.id} />
                      <MemberPicker members={others} />
                      <SubmitButton className="btn-ghost mt-3 w-full" pendingText="Adding…">
                        Add to their routines
                      </SubmitButton>
                    </ActionForm>
                  </details>
                )}
                <ActionForm action={removeTask} confirm={`Remove "${t.title}" from ${member.name}'s routine?`} className="mt-2 text-center">
                  <input type="hidden" name="id" value={t.id} />
                  <SubmitButton className="btn-danger" pendingText="Removing…">
                    Remove from routine
                  </SubmitButton>
                </ActionForm>
              </div>
            </details>
          );
        })}
      </section>


      <Section id="add" variant="add" icon="➕" title={`Add to ${member.name}'s routine`} hint="One-tap templates, or your own">
        <AddTaskForm memberId={member.id} members={family} action={saveTask} customTypes={ownTypes} />
      </Section>

      {tasks.length > 1 && (
        <Section id="remove-many" icon="🗑️" title="Remove several items" hint="Tick the ones to go and remove them in one tap">
          <RemoveManyForm
            memberName={member.name}
            items={tasks.map((t) => ({ id: t.id, emoji: kindEmoji(t.kind, t.custom_emoji), title: t.title, note: scheduleLabel(t) }))}
          />
        </Section>
      )}

      <Section
        id="more"
        icon="⚙️"
        title="Breaks & profile"
        hint={
          current
            ? `${BREAK_REASONS[current.reason].emoji} ${BREAK_REASONS[current.reason].label} until ${short(current.end_date)}`
            : `${member.default_pin ? "PIN 0000" : "Own PIN"} · ${member.lang === "hi" ? "हिन्दी" : "English"} · breaks, photo, admin`
        }
        badge={current ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-black text-brand-dark">BREAK</span> : undefined}
      >
        <SubSection
          id="breaks"
          icon="🤒"
          title="Breaks"
          hint={
            current
              ? `${BREAK_REASONS[current.reason].label} until ${short(current.end_date)}`
              : upcoming
                ? `Planned from ${short(upcoming.start_date)}`
                : "Sick or travel days don't count for scores or streaks"
          }
          badge={current ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-black text-brand-dark">NOW</span> : undefined}
        >
          {breaks.length > 0 && (
            <ul className="mb-4 space-y-2">
              {breaks.map((b) => {
                const current = b.start_date <= date && date <= b.end_date;
                return (
                  <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2 text-sm">
                    <span className="text-xl">{BREAK_REASONS[b.reason].emoji}</span>
                    <span className="flex-1">
                      <b>{BREAK_REASONS[b.reason].label}</b> · {b.start_date === b.end_date ? short(b.start_date) : `${short(b.start_date)} – ${short(b.end_date)}`}
                      {current && <span className="ml-1 rounded-full bg-orange-100 px-1.5 text-[11px] font-bold text-brand-dark">now</span>}
                    </span>
                    {current && b.start_date < date && (
                      <ActionForm action={endBreak}>
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton className="btn-ghost px-2 py-1 text-xs" pendingText="…">
                          End today
                        </SubmitButton>
                      </ActionForm>
                    )}
                    {(!self || b.start_date >= date) && (
                      <ActionForm action={endBreak} confirm="Remove this break completely? Those days will count again.">
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="delete" value="1" />
                        <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">
                          Remove
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mb-3 text-xs text-muted">
            {self ? "Your own breaks can only start from today." : "You can also add a past break, e.g. a hospital stay."}
          </p>
          <ActionForm action={startBreak} resetOnSuccess>
            <BreakFields today={date} memberId={member.id} backdate={!self} />
            <SubmitButton className="btn-ghost mt-4 w-full">Add break</SubmitButton>
          </ActionForm>
        </SubSection>

        <SubSection
          id="profile"
          icon="✏️"
          title="Profile"
          hint={`${member.default_pin ? "PIN 0000" : "Own PIN"} · ${member.lang === "hi" ? "हिन्दी" : "English"} · ${member.text_size === "large" ? "Large" : "Normal"} text${member.is_admin ? " · Admin" : ""}`}
        >
          <ActionForm action={saveMember} className="space-y-4">
            <input type="hidden" name="id" value={member.id} />
            <div>
              <label className="label" htmlFor="m-name">Name</label>
              <input id="m-name" name="name" className="field" defaultValue={member.name} required maxLength={40} />
            </div>
            <div>
              <span className="label">Photo</span>
              <PhotoPicker current={photoUrl(member)} />
              {!!member.has_photo && (
                <label className="mt-2 flex items-center gap-2 text-sm font-bold text-muted">
                  <input type="checkbox" name="remove_photo" className="h-4 w-4 accent-brand" />
                  Remove the current photo
                </label>
              )}
            </div>
            <div>
              <label className="label" htmlFor="m-pin">
                New PIN {member.default_pin ? <span className="text-amber-700">(now: 0000)</span> : "(leave empty to keep)"}
              </label>
              <input id="m-pin" name="pin" className="field tracking-[0.4em]" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="off" />
              {!member.default_pin && (
                <label className="mt-2 flex items-center gap-2 text-sm font-bold text-muted">
                  <input type="checkbox" name="reset_pin" className="h-4 w-4 accent-brand" />
                  Reset their PIN to 0000 (e.g. they forgot it)
                </label>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="m-lang">Language</label>
                <select id="m-lang" name="lang" className="field" defaultValue={member.lang}>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="m-size">Text size</label>
                <select id="m-size" name="text_size" className="field" defaultValue={member.text_size}>
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-3 font-bold">
              <input type="checkbox" name="is_admin" defaultChecked={!!member.is_admin} className="h-5 w-5 accent-brand" />
              Admin (can manage members and routines)
            </label>
            <SubmitButton className="btn w-full">Save profile</SubmitButton>
          </ActionForm>

          {member.id !== admin.id && (
            <ActionForm
              action={removeMember}
              confirm={`Remove ${member.name} from the family? Their history is kept but they won't be able to log in.`}
              className="mt-3 text-center"
            >
              <input type="hidden" name="id" value={member.id} />
              <SubmitButton className="btn-danger" pendingText="Removing…">
                Remove {member.name} from the family
              </SubmitButton>
            </ActionForm>
          )}
        </SubSection>
      </Section>
    </div>
  );
}
