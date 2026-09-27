import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import {
  REPORT_DAYS,
  breakOn,
  currentTasks,
  getMember,
  myHelpRequests,
  quotaOf,
  recentActivity,
  recentReportsAbout,
  redemptionsOf,
  tasksForDay,
  type TodayItem,
} from "@/lib/data";
import { achievementsFor, standings } from "@/lib/stats";
import { addDays, formatDate, formatTime, startOfWeek, today } from "@/lib/dates";
import { kindEmoji } from "@/lib/kinds";
import { translator, type T } from "@/lib/i18n";
import { askHelpAward, reportTick } from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import ActivityStrip from "@/components/ActivityStrip";
import CoinLedger from "@/components/CoinLedger";
import Avatar from "@/components/Avatar";
import { CoinAmount } from "@/components/Coin";
import ProgressRing from "@/components/ProgressRing";
import Section from "@/components/Section";
import { scheduleLabel } from "@/components/TaskFields";

/**
 * Anyone in the family can see anyone's day: today's progress, what's done and what isn't,
 * and their full routine. From here you can report a tick that wasn't really done, or ask
 * for an award for helping them.
 */
export default async function MemberDayPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const t = translator(me.lang);
  const { id } = await params;
  const member = await getMember(Number(id));
  if (!member?.active) notFound();
  const self = member.id === me.id;

  const date = today();
  const yesterday = addDays(date, -1);
  const [items, yItems, routine, dayBoard, weekBoard, ach, away, reports, myHelp, days, chosen] = await Promise.all([
    tasksForDay(member.id, date),
    tasksForDay(member.id, yesterday),
    currentTasks(member.id),
    standings(date, date),
    standings(startOfWeek(date), date),
    achievementsFor(member.id),
    breakOn(member.id, date),
    recentReportsAbout(member.id),
    self ? myHelpRequests(me.id) : Promise.resolve([]),
    recentActivity(member, 7),
    redemptionsOf(member.id, 10),
  ]);
  const missedDays = days.slice(1).filter((d) => d.missed.length);
  const REDEMPTION_KEY = { requested: "shop.requested", given: "shop.given", declined: "shop.declined" } as const;
  const todayScore = dayBoard.find((s) => s.member.id === member.id)?.score ?? null;
  const weekScore = weekBoard.find((s) => s.member.id === member.id)?.score ?? null;
  const done = items.filter((i) => i.checkin).length;
  const myReports = new Set(reports.filter((r) => r.reporter_id === me.id).map((r) => `${r.task_id}|${r.date}`));
  const yDone = yItems.filter((i) => i.checkin);
  const short = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" }, me.lang);

  const row = (it: TodayItem, day: string) => {
    const reportable = !self && !!it.checkin && day >= addDays(date, -REPORT_DAYS);
    const reported = myReports.has(`${it.id}|${day}`);
    return (
      <li key={`${it.id}|${day}`} className={`rounded-2xl border px-3 py-2.5 ${it.checkin ? "border-emerald-100 bg-emerald-50/50" : "border-line bg-white"}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{kindEmoji(it.kind, it.custom_emoji)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-extrabold">{it.title}</span>
            <span className="block truncate text-xs text-muted">
              {it.any_time ? t("task.anyTime") : formatTime(it.time)}
              {quotaOf(it) &&
                ` · ${t(it.per_week ? "task.weekProgress" : "task.monthProgress", { done: it.quotaDone, target: it.quotaTarget })}`}
            </span>
          </span>
          {it.checkin ? (
            <span className={`shrink-0 text-right text-xs font-bold ${it.checkin.on_time ? "text-emerald-700" : "text-muted"}`}>
              ✓ {t(it.checkin.on_time ? "status.doneAt" : "status.doneLate", { time: formatTime(it.checkin.done_at) })}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-bold text-muted">{t("fam.notYet")}</span>
          )}
        </div>
        {reported ? (
          <p className="mt-1.5 text-xs font-bold text-red-700">{t("report.pending")}</p>
        ) : (
          reportable && <ReportForm it={it} day={day} name={member.name} t={t} />
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <Link href="/family" className="text-sm font-bold text-muted">
        {t("fam.back")}
      </Link>

      <section className="flex items-center gap-4">
        <ProgressRing percent={todayScore ?? 0} size={84} stroke={6} color={member.color}>
          <Avatar member={member} size={68} />
        </ProgressRing>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black">
            {t("fam.title", { name: member.name })}
            {self && <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 align-middle text-xs">{t("fam.you")}</span>}
          </h1>
          <div className="mt-1 flex flex-wrap gap-2 text-xs font-extrabold">
            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
              {t("fam.today")} {todayScore === null ? "–" : `${Math.round(todayScore)}%`}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
              {t("fam.week")} {weekScore === null ? "–" : `${Math.round(weekScore)}%`}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">🔥 {ach.streak.current}</span>
            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
              <CoinAmount value={ach.coins} size={13} />
            </span>
          </div>
        </div>
      </section>

      <div className="flex gap-2 text-sm font-extrabold">
        <Link href={`/history?m=${member.id}`} className="flex-1 rounded-2xl bg-white py-2 text-center shadow-sm">
          📅 {t("hist.calendar")}
        </Link>
        <Link href={`/history?view=chart&m=${member.id}`} className="flex-1 rounded-2xl bg-white py-2 text-center shadow-sm">
          📊 {t("hist.chart")}
        </Link>
      </div>

      {away && (
        <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900">
          {away.reason === "sick" ? "🤒" : "✈️"} {t("fam.onBreak", { date: short(away.end_date) })}
        </p>
      )}

      <section className="card space-y-2.5">
        <h2 className="flex items-baseline justify-between text-lg font-black">
          {t("fam.today")}
          {items.length > 0 && <span className="text-sm font-bold text-muted">{t("today.progress", { done, total: items.length })}</span>}
        </h2>
        {items.length ? <ul className="space-y-2">{items.map((it) => row(it, date))}</ul> : <p className="text-sm text-muted">{t("fam.nothing")}</p>}
      </section>

      {yDone.length > 0 && (
        <Section icon="🕙" title={t("fam.yesterday")} hint={t("today.progress", { done: yDone.length, total: yItems.length })}>
          <ul className="space-y-2">{yItems.map((it) => row(it, yesterday))}</ul>
        </Section>
      )}

      <Section
        icon="📅"
        title={t("fam.last7")}
        hint={missedDays.length ? `${t("fam.missed")}: ${missedDays.reduce((n, d) => n + d.missed.length, 0)}` : t("fam.noMissed")}
      >
        <ActivityStrip days={days} lang={me.lang} today={date} />
        {missedDays.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {missedDays.map((d) => (
              <li key={d.date}>
                <span className="font-extrabold">{short(d.date)}:</span>{" "}
                <span className="text-red-700">{d.missed.map((x) => `${kindEmoji(x.kind, x.custom_emoji)} ${x.title}`).join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon="🎁" title={t("fam.choices")} hint={chosen.length ? `${chosen[0].emoji} ${chosen[0].title}` : t("fam.noChoices")}>
        {chosen.length ? (
          <ul className="space-y-1.5 text-sm">
            {chosen.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-2xl bg-stone-50 px-3 py-2">
                <span className="min-w-0 truncate">
                  {r.emoji} {r.title} <span className="text-xs text-muted">· {short(r.requested_at.slice(0, 10))}</span>
                </span>
                <span className="shrink-0 text-xs font-bold text-muted">{t(REDEMPTION_KEY[r.status])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("fam.noChoices")}</p>
        )}
      </Section>

      <Section icon="📒" title={t("ledger.title")} hint={t("ledger.hint")}>
        <CoinLedger ledger={ach.ledger} lang={me.lang} />
      </Section>

      <Section icon="📋" title={t("fam.routine")} hint={t("fam.routineHint", { n: routine.length })}>
        <ul className="space-y-2">
          {routine.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2">
              <span className="text-xl">{kindEmoji(r.kind, r.custom_emoji)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{r.title}</span>
                <span className="block truncate text-xs text-muted">
                  {scheduleLabel(r, me.lang)}
                  {r.start_date > date && ` · ${t("fam.starts", { date: short(r.start_date) })}`}
                  {r.details && ` · ${r.details}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {!self && (
        <Section icon="🤝" title={t("help.button", { name: member.name })} hint={t("help.send")}>
          <p className="mb-3 text-sm text-muted">{t("help.hint", { name: member.name })}</p>
          <ActionForm action={askHelpAward} resetOnSuccess className="space-y-2">
            <input type="hidden" name="helped_id" value={member.id} />
            <label className="label" htmlFor="help-note">
              {t("help.note")}
            </label>
            <textarea id="help-note" name="note" className="field min-h-20" placeholder={t("help.placeholder")} maxLength={200} required />
            <SubmitButton className="btn w-full">{t("help.send")}</SubmitButton>
          </ActionForm>
        </Section>
      )}

      {self && myHelp.length > 0 && (
        <Section icon="🤝" title={t("help.mine")} hint={t(myHelp[0].status === "open" ? "help.waiting" : myHelp[0].status === "approved" ? "help.approved" : "help.declined", { n: myHelp[0].coins })}>
          <ul className="space-y-2 text-sm">
            {myHelp.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3 rounded-2xl bg-stone-50 px-3 py-2">
                <span className="min-w-0">
                  <b>{h.helped_name}</b>: {h.note}
                </span>
                <span className="shrink-0 text-xs font-bold text-muted">
                  {t(h.status === "open" ? "help.waiting" : h.status === "approved" ? "help.approved" : "help.declined", { n: h.coins })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** "Didn't really do it?": a small fold-out form under a ticked item. */
function ReportForm({ it, day, name, t }: { it: TodayItem; day: string; name: string; t: T }) {
  return (
    <details className="mt-1.5">
      <summary className="inline-block cursor-pointer list-none rounded-full px-2 py-0.5 text-xs font-bold text-muted hover:bg-red-50 hover:text-red-700 [&::-webkit-details-marker]:hidden">
        {t("report.button")}
      </summary>
      <ActionForm action={reportTick} className="mt-2 space-y-2 rounded-2xl bg-red-50/60 p-3">
        <p className="text-sm font-extrabold">{t("report.title")}</p>
        <p className="text-xs text-muted">{t("report.hint", { name, title: it.title })}</p>
        <input type="hidden" name="task_id" value={it.id} />
        <input type="hidden" name="date" value={day} />
        <input name="reason" className="field py-2 text-sm" placeholder={t("report.reason")} maxLength={200} />
        <SubmitButton className="w-full rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" pendingText="…">
          {t("report.send")}
        </SubmitButton>
      </ActionForm>
    </details>
  );
}
