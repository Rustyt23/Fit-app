import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { BREAK_REASONS, activeMembers, currentTasks, customTypes, getMember, recentBreaks, tasksForDay } from "@/lib/data";
import { kindEmoji } from "@/lib/kinds";
import { addDays, formatDate, today } from "@/lib/dates";
import { copyTask, endBreak, removeMember, removeTask, saveMember, saveTask, startBreak } from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import Avatar, { photoUrl } from "@/components/Avatar";
import Coin from "@/components/Coin";
import PhotoPicker from "@/components/PhotoPicker";
import BreakFields from "@/components/BreakFields";
import TaskFields, { importanceLabel, scheduleLabel } from "@/components/TaskFields";
import Section, { SubSection } from "@/components/Section";
import AddTaskForm from "@/components/AddTaskForm";
import MemberPicker from "@/components/MemberPicker";
import RemoveManyForm from "@/components/RemoveManyForm";
import EmptyState from "@/components/EmptyState";
import { adminText } from "@/lib/i18n-admin";

export default async function MemberAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const t = adminText(admin.lang);
  const lang = admin.lang;
  const short = (d: string) => formatDate(d, { day: "numeric", month: "short" }, lang);
  const reason = (r: "sick" | "travel") => t(r === "sick" ? "m.sick" : "m.travel");
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
        {t("m.all")}
      </Link>

      <div className="flex items-center gap-4">
        <Avatar member={member} size={72} />
        <div className="min-w-0">
          <h1 className="text-2xl font-black">
            {member.name}
            {!!member.default_pin && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 align-middle text-xs text-orange-800">PIN 0000</span>}
          </h1>
          <p className="text-sm font-bold text-muted">
            {tasks.length ? t("m.items", { n: tasks.length }) : t("m.noRoutine")}
            {todayItems.length > 0 && ` · ${t("m.todayDone", { done: doneCount, total: todayItems.length })}`}
            {current && ` · ${BREAK_REASONS[current.reason].emoji} ${t("admin.onBreak")}`}
          </p>
        </div>
      </div>

      <section className="space-y-2.5">
        <h2 className="px-1 text-sm font-extrabold uppercase tracking-wider text-muted">{t("m.routine")}</h2>
        {tasks.length === 0 && (
          <EmptyState
            title={t("m.noRoutine")}
            text={t("m.emptyText", { name: member.name })}
            action={{ href: "#add", label: t("m.addFirst") }}
          />
        )}
        {tasks.map((task) => {
          return (
            <details key={task.id} className="card group/item py-3">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <span className="text-2xl">{kindEmoji(task.kind, task.custom_emoji)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">{task.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {scheduleLabel(task, lang)}
                    {task.start_date > date && ` · ${t("m.from", { date: short(task.start_date) })}`}
                    {task.end_date && ` · ${t("m.until", { date: short(addDays(task.end_date, -1)) })}`}
                    {task.weight > 1 && ` · ${importanceLabel(task.weight, lang)} ×${task.weight}`}
                    {task.details && ` · ${task.details}`}
                  </span>
                </span>
                {task.coins != null && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-black text-amber-800">
                    +{task.coins} <Coin size={11} />
                  </span>
                )}
                {task.penalty > 0 && <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-black text-red-600">−{task.penalty}</span>}
                {doneToday.has(task.id) && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">{t("m.todayTick")}</span>}
                <span className="text-sm font-bold text-muted group-open/item:hidden">{t("admin.edit")}</span>
              </summary>
              <div className="mt-4 border-t border-line pt-4">
                <ActionForm action={saveTask}>
                  <TaskFields memberId={member.id} id={task.id} values={task} customTypes={ownTypes} today={date} lang={lang} />
                  <SubmitButton className="btn mt-4 w-full" pendingText={t("admin.saving")}>
                    {t("m.saveChanges")}
                  </SubmitButton>
                </ActionForm>
                {others.length > 0 && (
                  <details className="group/copy mt-3 rounded-2xl border border-line">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                      <span>👥</span>
                      <span className="flex-1">
                        {t("m.giveOthers")}
                        <span className="block text-xs font-semibold text-muted">{t("m.giveOthersHint")}</span>
                      </span>
                      <span className="text-muted transition-transform group-open/copy:rotate-180">⌄</span>
                    </summary>
                    <ActionForm action={copyTask} resetOnSuccess className="border-t border-line p-3">
                      <input type="hidden" name="id" value={task.id} />
                      <MemberPicker members={others} lang={lang} />
                      <SubmitButton className="btn-ghost mt-3 w-full" pendingText={t("admin.adding")}>
                        {t("m.addToTheirs")}
                      </SubmitButton>
                    </ActionForm>
                  </details>
                )}
                <ActionForm action={removeTask} confirm={t("m.removeQ", { title: task.title, name: member.name })} className="mt-2 text-center">
                  <input type="hidden" name="id" value={task.id} />
                  <SubmitButton className="btn-danger" pendingText={t("m.removing")}>
                    {t("m.removeFromRoutine")}
                  </SubmitButton>
                </ActionForm>
              </div>
            </details>
          );
        })}
      </section>


      <Section id="add" variant="add" icon="➕" title={t("m.addTo", { name: member.name })} hint={t("m.addHint")}>
        <AddTaskForm memberId={member.id} members={family} action={saveTask} customTypes={ownTypes} today={date} lang={lang} />
      </Section>

      {tasks.length > 1 && (
        <Section id="remove-many" icon="🗑️" title={t("m.removeSeveral")} hint={t("m.removeSeveralHint")}>
          <RemoveManyForm
            memberName={member.name}
            lang={lang}
            items={tasks.map((x) => ({ id: x.id, emoji: kindEmoji(x.kind, x.custom_emoji), title: x.title, note: scheduleLabel(x, lang) }))}
          />
        </Section>
      )}

      <Section
        id="more"
        icon="⚙️"
        title={t("m.more")}
        hint={
          current
            ? `${BREAK_REASONS[current.reason].emoji} ${t("m.breakUntil", { reason: reason(current.reason), date: short(current.end_date) })}`
            : t("m.moreHint", { pin: member.default_pin ? "PIN 0000" : t("m.ownPin"), lang: member.lang === "hi" ? "हिन्दी" : "English" })
        }
        badge={current ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-black text-brand-dark">{t("m.breakBadge")}</span> : undefined}
      >
        <SubSection
          id="breaks"
          icon="🤒"
          title={t("m.breaks")}
          hint={
            current
              ? t("m.breakUntil", { reason: reason(current.reason), date: short(current.end_date) })
              : upcoming
                ? t("m.plannedFrom", { date: short(upcoming.start_date) })
                : t("m.breaksHint")
          }
          badge={current ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-black text-brand-dark">{t("m.now")}</span> : undefined}
        >
          {breaks.length > 0 && (
            <ul className="mb-4 space-y-2">
              {breaks.map((b) => {
                const current = b.start_date <= date && date <= b.end_date;
                return (
                  <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2 text-sm">
                    <span className="text-xl">{BREAK_REASONS[b.reason].emoji}</span>
                    <span className="flex-1">
                      <b>{reason(b.reason)}</b> · {b.start_date === b.end_date ? short(b.start_date) : `${short(b.start_date)} – ${short(b.end_date)}`}
                      {current && <span className="ml-1 rounded-full bg-orange-100 px-1.5 text-[11px] font-bold text-brand-dark">{t("m.nowSmall")}</span>}
                    </span>
                    {current && b.start_date < date && (
                      <ActionForm action={endBreak}>
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton className="btn-ghost px-2 py-1 text-xs" pendingText="…">
                          {t("m.endToday")}
                        </SubmitButton>
                      </ActionForm>
                    )}
                    {(!self || b.start_date >= date) && (
                      <ActionForm action={endBreak} confirm={t("m.removeBreakQ")}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="delete" value="1" />
                        <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">
                          {t("m.remove")}
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mb-3 text-xs text-muted">
            {self ? t("m.ownBreaks") : t("m.pastBreak")}
          </p>
          <ActionForm action={startBreak} resetOnSuccess>
            <BreakFields today={date} memberId={member.id} backdate={!self} lang={lang} />
            <SubmitButton className="btn-ghost mt-4 w-full" pendingText={t("admin.adding")}>
              {t("m.addBreak")}
            </SubmitButton>
          </ActionForm>
        </SubSection>

        <SubSection
          id="profile"
          icon="✏️"
          title={t("m.profile")}
          hint={[
            member.default_pin ? "PIN 0000" : t("m.ownPin"),
            member.lang === "hi" ? "हिन्दी" : "English",
            t(member.text_size === "large" ? "m.textLarge" : "m.textNormal"),
            member.is_admin ? t("admin.adminBadge") : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          <ActionForm action={saveMember} className="space-y-4">
            <input type="hidden" name="id" value={member.id} />
            <div>
              <label className="label" htmlFor="m-name">
                {t("admin.name")}
              </label>
              <input id="m-name" name="name" className="field" defaultValue={member.name} required maxLength={40} />
            </div>
            <div>
              <span className="label">{t("admin.photo")}</span>
              <PhotoPicker current={photoUrl(member)} lang={lang} />
              {!!member.has_photo && (
                <label className="mt-2 flex items-center gap-2 text-sm font-bold text-muted">
                  <input type="checkbox" name="remove_photo" className="h-4 w-4 accent-brand" />
                  {t("m.removePhoto")}
                </label>
              )}
            </div>
            <div>
              <label className="label" htmlFor="m-pin">
                {t("m.newPin")} {member.default_pin ? <span className="text-amber-700">{t("m.nowDefault")}</span> : t("m.keepEmpty")}
              </label>
              <input id="m-pin" name="pin" className="field tracking-[0.4em]" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="off" />
              {!member.default_pin && (
                <label className="mt-2 flex items-center gap-2 text-sm font-bold text-muted">
                  <input type="checkbox" name="reset_pin" className="h-4 w-4 accent-brand" />
                  {t("m.resetPin")}
                </label>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="m-lang">
                  {t("admin.language")}
                </label>
                <select id="m-lang" name="lang" className="field" defaultValue={member.lang}>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="m-size">
                  {t("admin.textSize")}
                </label>
                <select id="m-size" name="text_size" className="field" defaultValue={member.text_size}>
                  <option value="normal">{t("admin.normal")}</option>
                  <option value="large">{t("admin.large")}</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-3 font-bold">
              <input type="checkbox" name="is_admin" defaultChecked={!!member.is_admin} className="h-5 w-5 accent-brand" />
              {t("m.isAdmin")}
            </label>
            <SubmitButton className="btn w-full" pendingText={t("admin.saving")}>
              {t("m.saveProfile")}
            </SubmitButton>
          </ActionForm>

          {member.id !== admin.id && (
            <ActionForm
              action={removeMember}
              confirm={t("m.removeMemberQ", { name: member.name })}
              className="mt-3 text-center"
            >
              <input type="hidden" name="id" value={member.id} />
              <SubmitButton className="btn-danger" pendingText={t("m.removing")}>
                {t("m.removeMember", { name: member.name })}
              </SubmitButton>
            </ActionForm>
          )}
        </SubSection>
      </Section>
    </div>
  );
}
