import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { ANY_TIME_REMINDER, BREAK_REASONS, ON_TIME_GRACE_MIN, breakOn, quotaOf, tasksForDay, type TodayItem } from "@/lib/data";
import { BADGES, STREAK_MIN, achievementsFor, eventNow, eventResults, eventStandings, finalizeEvents, standings, weekRecap } from "@/lib/stats";
import { addDays, formatDate, formatMonth, formatTime, minutes, nowHHMM, startOfMonth, startOfWeek, today, weekday } from "@/lib/dates";
import { LATE_TICK_UNTIL, inLateWindow } from "@/lib/tick-window";
import { BADGE_TEXT, translator, type Key, type T } from "@/lib/i18n";
import { endBreak } from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import ProgressRing from "@/components/ProgressRing";
import TaskRow, { type RowStatus } from "./TaskRow";
import Coin from "@/components/Coin";
import DayCelebration from "@/components/DayCelebration";
import EmptyState from "@/components/EmptyState";
import RecapCard from "@/components/RecapCard";
import Section from "@/components/Section";
import TodayGlance from "@/components/TodayGlance";

const PARTS = [
  { key: "part.morning", emoji: "🌅", until: 12 * 60 },
  { key: "part.afternoon", emoji: "☀️", until: 17 * 60 },
  { key: "part.evening", emoji: "🌇", until: 21 * 60 },
  { key: "part.night", emoji: "🌙", until: 24 * 60 },
] as const;

function greeting(now: number, t: T) {
  if (now < 12 * 60) return t("greet.morning");
  if (now < 17 * 60) return t("greet.afternoon");
  return t("greet.evening");
}

function statusOf(item: TodayItem, now: number, t: T): RowStatus {
  if (item.checkin) {
    return item.checkin.on_time
      ? { tone: "done", text: t("status.doneAt", { time: formatTime(item.checkin.done_at) }) }
      : { tone: "late", text: t("status.doneLate", { time: formatTime(item.checkin.done_at) }) };
  }
  if (item.per_week || item.per_month) return { tone: "upcoming", text: "" };
  if (item.any_time) return now >= minutes(ANY_TIME_REMINDER) ? { tone: "due", text: t("status.stillToDo") } : { tone: "upcoming", text: "" };
  if (now > minutes(item.time) + ON_TIME_GRACE_MIN) return { tone: "overdue", text: t("status.missed") };
  if (now >= minutes(item.time) - 30) return { tone: "due", text: t("status.due") };
  return { tone: "upcoming", text: formatTime(item.time) };
}

/** Everything a task row needs, for today's list or yesterday's. */
function rowProps(it: TodayItem, date: string, memberId: number, status: RowStatus, t: T) {
  return {
    id: it.id,
    memberId,
    date,
    kind: it.kind,
    title: it.title,
    details: it.details,
    time: it.any_time ? t("task.anyTime") : formatTime(it.time),
    done: !!it.checkin,
    status,
    note: it.per_week
      ? t("task.weekProgress", { done: it.quotaDone, target: it.quotaTarget })
      : it.per_month
        ? t("task.monthProgress", { done: it.quotaDone, target: it.quotaTarget })
        : undefined,
    customEmoji: it.custom_emoji,
    coins: it.coins,
    penaltyText: it.penalty ? t("task.penalty", { n: it.penalty }) : undefined,
  };
}

/** The most urgent open item: the earliest timed one (missed ones first), then any-time, then weekly. */
function pickUpNext(items: TodayItem[]): TodayItem | undefined {
  const open = items.filter((i) => !i.checkin);
  return (
    open.filter((i) => !i.any_time && !quotaOf(i)).sort((a, b) => a.time.localeCompare(b.time))[0] ??
    open.find((i) => i.any_time && !quotaOf(i)) ??
    open.find((i) => i.per_week) ??
    open.find((i) => i.per_month)
  );
}

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
  const week = await eventNow("week");
  // Sunday: this week so far. Monday: last week, now that it's over.
  const dow = weekday(date);
  const recapWeek = dow === 0 ? startOfWeek(date) : dow === 1 ? addDays(startOfWeek(date), -7) : null;
  const [items, onBreak, board, weekBoard, ach, results, yItems, yBreak, recap] = await Promise.all([
    tasksForDay(me.id, date),
    breakOn(me.id, date),
    standings(date, date),
    eventStandings(week, date),
    achievementsFor(me.id),
    eventResults(),
    lateWindow ? tasksForDay(me.id, yesterday) : Promise.resolve([] as TodayItem[]),
    lateWindow ? breakOn(me.id, yesterday) : Promise.resolve(undefined),
    recapWeek ? weekRecap(me.id, recapWeek, dow === 0 ? date : addDays(recapWeek, 6)) : Promise.resolve(null),
  ]);
  const doneCount = items.filter((i) => i.checkin).length;
  const allDone = items.length > 0 && doneCount === items.length;
  const mine = board.find((s) => s.member.id === me.id);
  // Weighted score when there is one (important items count more), else a plain count.
  const percent = Math.round(mine?.score ?? (items.length ? (doneCount / items.length) * 100 : 0));
  // Badges earned today or yesterday (Star of the Day is only decided once a day is over).
  const fresh = ach.badges.filter((b) => b.last >= yesterday);
  // My wins from the week and month that just finished.
  const lastWeek = addDays(startOfWeek(date), -7);
  const lastMonth = addDays(startOfMonth(date), -1).slice(0, 8) + "01";
  const myWins = results.filter(
    (r) => r.member_id === me.id && ((r.event === "week" && r.period === lastWeek) || (r.event === "month" && r.period === lastMonth)),
  );
  // Before 10 AM, yesterday's unticked items can still be ticked. (Weekly-target items can
  // simply be done today instead, so they aren't listed.)
  const yFixed = yItems.filter((i) => !quotaOf(i));
  const missedYesterday = !yBreak && yFixed.some((i) => !i.checkin) ? yFixed : [];

  // Focus: the next thing to do, then the rest still open; finished items fold away.
  const upNext = pickUpNext(items);
  const open = items.filter((it) => !it.checkin && it.id !== upNext?.id);
  const finished = items.filter((it) => it.checkin);
  const timed = open.filter((it) => !it.any_time && !quotaOf(it));
  const groups: { key: Key; emoji: string; items: TodayItem[] }[] = [
    ...PARTS.map((part, i) => ({
      key: part.key as Key,
      emoji: part.emoji,
      items: timed.filter((it) => minutes(it.time) < part.until && minutes(it.time) >= (PARTS[i - 1]?.until ?? 0)),
    })),
    { key: "part.anytime" as Key, emoji: "🌤️", items: open.filter((it) => it.any_time && !quotaOf(it)) },
    { key: "part.week" as Key, emoji: "🔁", items: open.filter((it) => it.per_week) },
    { key: "part.month" as Key, emoji: "🗓️", items: open.filter((it) => it.per_month) },
  ].filter((g) => g.items.length);
  const row = (it: TodayItem, day: string, status: RowStatus) => ({ ...rowProps(it, day, me.id, status, t), simple });

  return (
    <div className="space-y-4">
      <DayCelebration done={allDone && !onBreak} date={date} memberId={me.id} />

      <section>
        <p className="text-sm font-bold text-muted">{formatDate(date, undefined, me.lang)}</p>
        <h1 className="text-2xl font-black">{t("today.greeting", { greeting: greeting(now, t), name: me.name })}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-sm font-extrabold">
          <span className="rounded-full bg-white px-3 py-1 shadow-sm" title={t("today.streakHint", { min: STREAK_MIN })}>
            {t("today.streak", { n: ach.streak.current })}
          </span>
          <Link href="/shop" className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-amber-800 shadow-sm">
            <Coin size={16} className="coin-shine" /> {t("today.coins", { n: ach.coins })}
          </Link>
        </div>
      </section>

      {myWins.map((w) => (
        <section key={`${w.event}-${w.period}`} className="card bg-gradient-to-br from-amber-100 via-orange-50 to-white text-center">
          <p className="text-4xl">{["🥇", "🥈", "🥉"][w.place - 1] ?? "🏅"}🎉</p>
          <p className="mt-1 text-lg font-black">
            {t("win.title", { place: w.place, what: w.event === "month" ? formatMonth(w.period, me.lang) : t("win.lastWeek") })}
          </p>
          <p className="text-sm text-muted">
            {[
              w.prize_coins ? t("win.coinsAdded", { n: w.prize_coins }) : "",
              w.prize_text ? (w.delivered_at ? t("win.delivered", { prize: w.prize_text }) : t("win.onItsWay", { prize: w.prize_text })) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
      ))}

      {fresh.length > 0 && (
        <Link href="/me" className="card flex items-center gap-3 bg-gradient-to-r from-amber-50 to-white">
          <span className="text-4xl">{BADGES.find((b) => b.id === fresh[0].id)!.emoji}</span>
          <span>
            <span className="block text-xs font-extrabold uppercase tracking-wider text-amber-700">{t("badge.new")}</span>
            <span className="block font-black">{fresh.map((f) => BADGE_TEXT[me.lang][f.id].name).join(", ")}</span>
          </span>
        </Link>
      )}

      {missedYesterday.length > 0 && (
        <section className="card border-2 border-orange-200">
          <h2 className="text-lg font-black">🕙 {t("yday.title")}</h2>
          <p className="mb-3 text-sm text-muted">{t("yday.sub", { time: formatTime(LATE_TICK_UNTIL) })}</p>
          <ul className="space-y-2.5">
            {missedYesterday.map((it) => (
              <li key={it.id}>
                <TaskRow {...row(it, yesterday, it.checkin ? statusOf(it, now, t) : { tone: "overdue", text: t("status.yesterday") })} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {onBreak ? (
        <section className="card text-center">
          <p className="text-5xl">{BREAK_REASONS[onBreak.reason].emoji}</p>
          <h2 className="mt-2 text-xl font-black">{t(onBreak.reason === "sick" ? "break.sickTitle" : "break.travelTitle")}</h2>
          <p className="mt-1 text-muted">
            {t("break.until", { date: formatDate(onBreak.end_date, { weekday: "short", day: "numeric", month: "short" }, me.lang) })}
          </p>
          <ActionForm action={endBreak} className="mt-4">
            <input type="hidden" name="id" value={onBreak.id} />
            <SubmitButton className="btn" pendingText="…">
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
        <section className="card space-y-4">
          <div className="flex items-center gap-4">
            <ProgressRing percent={percent} size={64} stroke={7} color={allDone ? "var(--color-supplement)" : "var(--color-brand)"}>
              <span className="text-base font-black">{percent}%</span>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              {allDone ? (
                <>
                  <p className="text-xl font-black">{t("today.allDone")}</p>
                  <p className="text-sm text-muted">{t("today.allDoneSub")}</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-black">{t("today.progress", { done: doneCount, total: items.length })}</p>
                  <p className="text-sm text-muted">
                    {t("today.toGo", { n: items.length - doneCount })} {t(doneCount === 0 ? "today.start" : "today.keepGoing")}
                  </p>
                </>
              )}
            </div>
            {mine && mine.rank > 0 && mine.done > 0 && (
              <Link href="/leaderboard" className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-sm font-extrabold">
                {mine.rank === 1 ? "👑 #1" : `#${mine.rank}`}
              </Link>
            )}
          </div>
          {upNext && (
            <div>
              <p className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-brand-dark">{t("today.upNext")}</p>
              <TaskRow {...row(upNext, date, statusOf(upNext, now, t))} hero />
              {!simple && <p className="mt-2 px-1 text-[11px] text-muted">{t("today.swipeHint")}</p>}
            </div>
          )}
        </section>
      )}

      {!onBreak &&
        groups.map((g) => (
          <section key={g.key}>
            <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wider text-muted">
              {g.emoji} {t(g.key)}
            </h2>
            <ul className="space-y-2.5">
              {g.items.map((it) => (
                <li key={it.id}>
                  <TaskRow {...row(it, date, statusOf(it, now, t))} />
                </li>
              ))}
            </ul>
          </section>
        ))}

      {!onBreak && finished.length > 0 && (
        <Section icon="✅" title={t("today.doneFold", { n: finished.length })} hint={t("today.doneFoldHint")}>
          <ul className="space-y-2.5">
            {finished.map((it) => (
              <li key={it.id}>
                <TaskRow {...row(it, date, statusOf(it, now, t))} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recap && <RecapCard recap={recap} lang={me.lang} title={t(dow === 0 ? "recap.titleNow" : "recap.titleLast")} />}

      <TodayGlance event={week} eventRows={weekBoard} board={board} meId={me.id} lang={me.lang} />

      {!onBreak && items.length > 0 && (
        <p className="text-center text-sm text-muted">
          {t("today.breakPrompt")}{" "}
          <Link href="/me#break" className="font-bold underline">
            {t("today.breakLink")}
          </Link>{" "}
          {t("today.breakSuffix")}
        </p>
      )}
    </div>
  );
}
