import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { BREAK_REASONS, breakOn, countsFrom, quotaOf, tasksForDay, trackingStart, type TodayItem } from "@/lib/data";
import { finalizeEvents, standings } from "@/lib/stats";
import { addDays, formatDate, minutes, nowHHMM, today } from "@/lib/dates";
import { inLateWindow } from "@/lib/tick-window";
import { translator } from "@/lib/i18n";
import { endBreak } from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import ProgressRing from "@/components/ProgressRing";
import TaskRow from "./TaskRow";
import { rowProps, statusOf } from "./rows";
import DayCelebration from "@/components/DayCelebration";
import EmptyState from "@/components/EmptyState";

/** A small round icon button (Yesterday, Calendar, Chart); a dot means something needs you. */
function IconLink({ href, label, dot, children }: { href: string; label: string; dot?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label} title={label} className="relative grid h-9 w-9 place-items-center rounded-full bg-white text-base shadow-sm">
      {children}
      {dot && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-cream" />}
    </Link>
  );
}

/** Order of the list: timed items by time (so missed ones come first), then any-time, weekly, monthly. */
const urgency = (it: TodayItem) => (it.per_month ? 4 : it.per_week ? 3 : it.any_time ? 2 : 1);

/**
 * Today, kept minimal so it fits on one phone screen: a one-line header (date, progress and the
 * Yesterday / Calendar / Chart icons) and the day's items as compact rows with their tick.
 * Open items come first in the order they're due; ticked ones drop to the bottom.
 */
export default async function TodayPage() {
  const me = await requireMember();
  const t = translator(me.lang);
  const simple = me.text_size === "large";
  await finalizeEvents();
  const date = today();
  const yesterday = addDays(date, -1);
  const nowText = nowHHMM();
  const now = minutes(nowText);
  const lateWindow = inLateWindow(nowText);
  const [items, onBreak, board, yItems, yBreak, familyStart] = await Promise.all([
    tasksForDay(me.id, date),
    breakOn(me.id, date),
    standings(date, date),
    lateWindow ? tasksForDay(me.id, yesterday) : Promise.resolve([] as TodayItem[]),
    lateWindow ? breakOn(me.id, yesterday) : Promise.resolve(undefined),
    trackingStart(),
  ]);
  // Before tracking starts (an admin chose a later day), ticks are just practice.
  const startsOn = countsFrom(me, familyStart);
  const doneCount = items.filter((i) => i.checkin).length;
  // On the last day of a week/month, "N times" items may still be short: those sessions count as
  // missed today, so the day isn't "all done" (and can't reach 100%) even with every row ticked.
  const short = items.filter((i) => i.shortfall > 0);
  const allDone = items.length > 0 && doneCount === items.length && !short.length;
  const mine = board.find((s) => s.member.id === me.id);
  // Weighted score when there is one (important items count more), else a plain count.
  const percent = Math.round(mine?.score ?? (items.length ? (doneCount / items.length) * 100 : 0));
  // Before 10 AM, yesterday's unticked items can still be ticked on the Yesterday page (🕙 gets a dot).
  const yesterdayOpen = yesterday >= startsOn && !yBreak && yItems.some((i) => !quotaOf(i) && !i.checkin);

  const open = items.filter((it) => !it.checkin).sort((a, b) => urgency(a) - urgency(b) || a.time.localeCompare(b.time));
  const done = items.filter((it) => it.checkin).sort((a, b) => a.checkin!.done_at.localeCompare(b.checkin!.done_at));

  return (
    <div className="space-y-3">
      <DayCelebration done={allDone && !onBreak} date={date} memberId={me.id} />

      <section className="flex items-center gap-3">
        {items.length > 0 && !onBreak && (
          <ProgressRing percent={percent} size={46} stroke={5} color={allDone ? "var(--color-supplement)" : "var(--color-brand)"}>
            <span className="text-[11px] font-black">{percent}%</span>
          </ProgressRing>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-muted">{formatDate(date, { weekday: "long", day: "numeric", month: "long" }, me.lang)}</p>
          <p className="truncate text-lg font-black leading-tight">
            {onBreak || !items.length
              ? t("nav.today")
              : allDone
                ? t("today.allDone")
                : t("today.progress", { done: doneCount, total: items.length })}
          </p>
        </div>
        <span className="flex shrink-0 gap-1.5">
          <IconLink href="/yesterday" label={t("hist.yesterday")} dot={yesterdayOpen}>
            🕙
          </IconLink>
          <IconLink href="/history" label={t("hist.calendar")}>
            📅
          </IconLink>
          <IconLink href="/history?view=chart" label={t("hist.chart")}>
            📊
          </IconLink>
        </span>
      </section>

      {startsOn > date && (
        <p className="rounded-xl bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900">
          🗓️ {t("track.notYet", { date: formatDate(startsOn, { weekday: "short", day: "numeric", month: "short" }, me.lang) })}
        </p>
      )}

      {!onBreak && short.length > 0 && (
        <ul className="space-y-0.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">
          {short.map((it) => (
            <li key={it.id}>
              ⚠️{" "}
              {t(it.per_week ? "today.shortWeek" : "today.shortMonth", {
                title: it.title,
                done: it.quotaTarget - it.shortfall,
                target: it.quotaTarget,
                n: it.shortfall,
              })}
            </li>
          ))}
        </ul>
      )}

      {onBreak ? (
        <section className="card flex items-center gap-3">
          <span className="text-3xl">{BREAK_REASONS[onBreak.reason].emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-black">{t(onBreak.reason === "sick" ? "break.sickTitle" : "break.travelTitle")}</span>
            <span className="block text-xs text-muted">
              {t("break.until", { date: formatDate(onBreak.end_date, { weekday: "short", day: "numeric", month: "short" }, me.lang) })}
            </span>
          </span>
          <ActionForm action={endBreak}>
            <input type="hidden" name="id" value={onBreak.id} />
            <SubmitButton className="btn shrink-0 px-3 py-2 text-sm" pendingText="…">
              {t("break.back")}
            </SubmitButton>
          </ActionForm>
        </section>
      ) : items.length === 0 ? (
        <EmptyState
          title={t("empty.today")}
          text={me.is_admin ? undefined : t("empty.todaySub")}
          action={me.is_admin ? { href: `/admin/member/${me.id}#add`, label: t("empty.todayAdmin") } : undefined}
        />
      ) : (
        <ul className="space-y-1.5">
          {[...open, ...done].map((it) => (
            <li key={it.id}>
              <TaskRow {...rowProps(it, date, me.id, statusOf(it, now, t), t)} simple={simple} compact />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
