import "server-only";
import { cache } from "react";
import { all, batch, get, nowStamp, run, sql } from "./db";
import { activeMembers, isScheduledOn, quotaOf, quotaPeriod, quotaTarget, type Checkin, type Kind, type Member, type Task } from "./data";
import { addDays, daysBetween, instantOf, minutes, nextMonth, nowHHMM, startOfMonth, startOfWeek, today } from "./dates";
import { PLACES, coinKey, eventPrizes, eventThemes, hasPrize, ruleVersions, rulesAt, weightKey, type EventKind, type Prize } from "./rules";
import { resolveTheme, type Theme } from "./themes";
import { lastFinalDay } from "./tick-window";

// Everything here is derived from the check-in history, so ticking/unticking,
// breaks and routine changes are always reflected consistently.

/** A day counts towards a streak when at least this % of the routine was done. */
export const STREAK_MIN = 75;
/** Tasks scheduled before this time count for the Early Bird badge/award. */
const EARLY_BEFORE = 9 * 60;

export type AwayPeriod = {
  id: number;
  member_id: number;
  start_date: string;
  end_date: string;
  reason: "sick" | "travel";
  created_by: number | null;
};

export type DayStat = {
  date: string;
  scheduled: number;
  done: number;
  onTime: number;
  /** Weighted totals (admin's score weights × each item's own weight). */
  scheduledWeight: number;
  doneWeight: number;
  meds: number;
  medsOnTime: number;
  earlyOnTime: number;
  /** Per activity type, for themed events. */
  kinds: Record<Kind, KindTally>;
  /** Coins earned for items done that day (per-item coins or the coin rules). */
  coins: number;
  /** Penalty coins for items missed that day (only once the day is final). */
  penalty: number;
  away: AwayPeriod | null;
};

type KindTally = { scheduled: number; done: number; onTime: number; scheduledWeight: number; doneWeight: number };
const emptyTally = (): KindTally => ({ scheduled: 0, done: 0, onTime: 0, scheduledWeight: 0, doneWeight: 0 });

/** Weighted completion % for the day, or null when the day doesn't count (nothing scheduled, or on a break). */
export function dayPct(d: DayStat): number | null {
  return d.scheduledWeight > 0 && !d.away ? (d.doneWeight / d.scheduledWeight) * 100 : null;
}

/** Coins for one done item: its own amount if the admin set one (half if late), else the coin rules. */
export function coinsForTask(t: Pick<Task, "coins" | "kind">, onTime: boolean, rules: ReturnType<typeof rulesAt>): number {
  if (t.coins != null) return onTime ? t.coins : Math.floor(t.coins / 2);
  return rules[coinKey(t.kind, onTime)];
}

/**
 * Per-member daily stats from the first routine item ever created up to today. Cached per request.
 *
 * Fixed-day items count on each of their days. "N times a week" items count on the days
 * they're done, and whatever is still missing of the week's target counts (as not done)
 * on the week's last day, the day it falls due. Penalties are only charged once a day is
 * final (after the next morning's 10 AM window) and never on break days.
 */
export const history = cache(async () => {
  const end = today();
  const finalDay = lastFinalDay(end, nowHHMM());
  const [tasks, checkins, away, members, versions] = await Promise.all([
    all<Task>("SELECT * FROM tasks ORDER BY time"),
    all<Checkin>("SELECT * FROM checkins"),
    all<AwayPeriod>("SELECT * FROM away_periods"),
    activeMembers(),
    ruleVersions(),
  ]);
  const first = tasks.reduce((min, t) => (t.start_date < min ? t.start_date : min), end);
  const days = daysBetween(first, end);
  const done = new Map(checkins.map((c) => [`${c.task_id}|${c.date}`, c]));
  const rulesByDay = new Map(days.map((d) => [d, rulesAt(versions, d)]));

  const byMember = new Map<number, DayStat[]>();
  for (const m of members) {
    const breaks = away.filter((a) => a.member_id === m.id);
    const breakOn = (date: string) => breaks.find((b) => b.start_date <= date && date <= b.end_date) ?? null;
    const stats: DayStat[] = days.map((date) => ({
      date,
      scheduled: 0,
      done: 0,
      onTime: 0,
      scheduledWeight: 0,
      doneWeight: 0,
      meds: 0,
      medsOnTime: 0,
      earlyOnTime: 0,
      kinds: { exercise: emptyTally(), supplement: emptyTally(), medicine: emptyTally(), other: emptyTally() },
      coins: 0,
      penalty: 0,
      away: breakOn(date),
    }));
    const dayStat = new Map(stats.map((d) => [d.date, d]));

    /** Counts `count` occurrences of an item on a day, done or not. */
    const add = (s: DayStat, t: Task, count: number, c: Checkin | undefined) => {
      const w = rulesByDay.get(s.date)![weightKey(t.kind)] * (t.weight || 1);
      const k = s.kinds[t.kind];
      s.scheduled += count;
      s.scheduledWeight += w * count;
      k.scheduled += count;
      k.scheduledWeight += w * count;
      if (t.kind === "medicine") s.meds += count;
      if (!c) {
        if (s.date <= finalDay && !s.away) s.penalty += t.penalty * count;
        return;
      }
      s.done++;
      s.doneWeight += w;
      k.done++;
      k.doneWeight += w;
      s.coins += coinsForTask(t, !!c.on_time, rulesByDay.get(s.date)!);
      if (!c.on_time) return;
      s.onTime++;
      k.onTime++;
      if (t.kind === "medicine") s.medsOnTime++;
      if (!t.any_time && minutes(t.time) < EARLY_BEFORE) s.earlyOnTime++;
    };

    for (const t of tasks.filter((t) => t.member_id === m.id)) {
      const quota = quotaOf(t);
      if (!quota) {
        for (const s of stats) if (isScheduledOn(t, s.date)) add(s, t, 1, done.get(`${t.id}|${s.date}`));
        continue;
      }
      // Weekly/monthly target: done days count as they happen; any shortfall falls due on
      // the period's last day.
      for (let p = quotaPeriod(quota.per, t.start_date)[0]; p <= end; p = addDays(quotaPeriod(quota.per, p)[1], 1)) {
        const [pStart, pEnd] = quotaPeriod(quota.per, p);
        const periodDays = daysBetween(pStart, pEnd);
        const activeDays = periodDays.filter((d) => isScheduledOn(t, d));
        if (!activeDays.length) continue;
        let doneCount = 0;
        for (const d of activeDays) {
          const c = done.get(`${t.id}|${d}`);
          const s = dayStat.get(d);
          if (c && s) {
            add(s, t, 1, c);
            doneCount++;
          }
        }
        // Only judged if the item is still running at the end of the period (an item removed
        // or edited part-way isn't charged for the part it no longer covers).
        const lastDay = activeDays.at(-1)!;
        if (lastDay !== pEnd) continue;
        const available = activeDays.filter((d) => !breakOn(d)).length;
        const shortfall = Math.max(0, quotaTarget(quota.count, available, periodDays.length) - doneCount);
        const due = dayStat.get(lastDay);
        if (shortfall && due) add(due, t, shortfall, undefined);
      }
    }
    byMember.set(m.id, stats);
  }
  return { members, first, byMember, versions };
});

// ---------- Streaks ----------

export type Streak = { current: number; best: number };

/**
 * Consecutive counting days at or above STREAK_MIN. Days on a break or with nothing
 * scheduled are skipped (they neither add nor break the streak), and today only
 * breaks it once the day is over.
 */
export function streakOf(days: DayStat[]): Streak {
  const t = today();
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const p = dayPct(days[i]);
    if (p === null) continue;
    if (p >= STREAK_MIN) current++;
    else if (days[i].date !== t) break;
  }
  let best = 0, runLen = 0;
  for (const d of days) {
    const p = dayPct(d);
    if (p === null) continue;
    if (p >= STREAK_MIN) best = Math.max(best, ++runLen);
    else if (d.date !== t) runLen = 0;
  }
  return { current, best };
}

// ---------- Standings ----------

export type Standing = {
  member: Member;
  /** Average weighted daily completion % over counting days; null if none counted. */
  score: number | null;
  done: number;
  scheduled: number;
  onTime: number;
  earlyOnTime: number;
  meds: number;
  medsOnTime: number;
  /** Break covering the last day of the range, if any. */
  away: AwayPeriod | null;
  streak: number;
  rank: number;
};

/**
 * Ranks active members by adherence over [from, to].
 * Each day's score is (weighted) done / scheduled, so someone with 3 tasks competes
 * fairly with someone who has 12. Break days are left out entirely.
 */
export async function standings(from: string, to: string, metric: (d: DayStat) => number | null = dayPct): Promise<Standing[]> {
  const { members, byMember } = await history();
  const rows: Standing[] = members.map((member) => {
    const allDays = byMember.get(member.id) ?? [];
    const days = allDays.filter((d) => d.date >= from && d.date <= to);
    const counted = days.filter((d) => metric(d) !== null);
    const sum = (f: (d: DayStat) => number) => counted.reduce((n, d) => n + f(d), 0);
    return {
      member,
      score: counted.length ? sum((d) => metric(d)!) / counted.length : null,
      done: sum((d) => d.done),
      scheduled: sum((d) => d.scheduled),
      onTime: sum((d) => d.onTime),
      earlyOnTime: sum((d) => d.earlyOnTime),
      meds: sum((d) => d.meds),
      medsOnTime: sum((d) => d.medsOnTime),
      away: days.at(-1)?.away ?? null,
      streak: streakOf(allDays).current,
      rank: 0,
    };
  });
  return rankRows(rows);
}

/** Sorts by score and assigns ranks. */
function rankRows(rows: Standing[]): Standing[] {
  // Higher score first; ties broken by on-time check-ins, then total done.
  rows.sort(
    (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) ||
      b.onTime - a.onTime ||
      b.done - a.done ||
      a.member.name.localeCompare(b.member.name),
  );

  // Equal (rounded) scores share a rank: 1, 1, 3 ... Members with nothing counted are unranked.
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const same = prev && Math.round(prev.score ?? -1) === Math.round(r.score ?? -1);
    r.rank = r.score === null ? 0 : same ? prev.rank : i + 1;
  });
  return rows;
}

// ---------- Themed scoring ----------

/** Daily score used by each event theme (null = the day doesn't count for this person). */
export const THEME_METRIC: Record<Exclude<Theme, "improved">, (d: DayStat) => number | null> = {
  all: dayPct,
  exercise: (d) => {
    const k = d.kinds.exercise;
    return d.away || !k.scheduledWeight ? null : (k.doneWeight / k.scheduledWeight) * 100;
  },
  on_time: (d) => (d.away || !d.scheduled ? null : (d.onTime / d.scheduled) * 100),
  medicine: (d) => (d.away || !d.meds ? null : (d.medsOnTime / d.meds) * 100),
};

/**
 * Standings for an event period under a theme. "Most improved" scores each person by
 * how many points their full-routine score rose compared with the period before.
 */
export async function themedStandings(theme: Theme, from: string, to: string, prevFrom: string, prevTo: string): Promise<Standing[]> {
  if (theme !== "improved") return standings(from, to, THEME_METRIC[theme]);
  const [now, before] = await Promise.all([standings(from, to), standings(prevFrom, prevTo)]);
  const prev = new Map(before.map((s) => [s.member.id, s.score]));
  return rankRows(
    now.map((s) => {
      const p = prev.get(s.member.id);
      return { ...s, score: s.score === null || p == null ? null : s.score - p, rank: 0 };
    }),
  );
}

// ---------- Automatic weekly & monthly events ----------

export const EVENTS: Record<EventKind, { label: string; short: string; emoji: string; start: (d: string) => string; next: (d: string) => string }> = {
  week: { label: "Weekly challenge", short: "week", emoji: "⚡", start: startOfWeek, next: (d) => addDays(d, 7) },
  month: { label: "Monthly championship", short: "month", emoji: "🏆", start: startOfMonth, next: nextMonth },
};

export type EventResult = {
  event: EventKind;
  period: string;
  member_id: number;
  place: number;
  score: number;
  prize_coins: number;
  prize_text: string;
  delivered_at: string | null;
  note: string;
  theme: Theme;
};

export type EventNow = {
  kind: EventKind;
  start: string;
  /** Last day of the event (inclusive). */
  end: string;
  /** Epoch ms when it ends, in the family's timezone, for the countdown. */
  endsAt: number;
  prizes: Prize[];
  theme: Theme;
};

/** The previous period of the same kind (for "most improved"). */
function previousPeriod(kind: EventKind, start: string): [string, string] {
  const prevEnd = addDays(start, -1);
  return [EVENTS[kind].start(prevEnd), prevEnd];
}

export async function eventNow(kind: EventKind): Promise<EventNow> {
  const e = EVENTS[kind];
  const start = e.start(today());
  const next = e.next(start);
  const [prizes, themes] = await Promise.all([eventPrizes(), eventThemes()]);
  return { kind, start, end: addDays(next, -1), endsAt: instantOf(next), prizes: prizes[kind], theme: resolveTheme(themes[kind], kind, start) };
}

/** Live standings for an event: from its start up to `to` (today for the running one). */
export function eventStandings(event: Pick<EventNow, "kind" | "start" | "theme">, to: string): Promise<Standing[]> {
  const [prevFrom, prevTo] = previousPeriod(event.kind, event.start);
  return themedStandings(event.theme, event.start, to, prevFrom, prevTo);
}

/** Weekly challenges count from the week the feature was first used (no surprise back-pay). */
async function weeklyEventsFrom(): Promise<string> {
  const key = "weekly_events_from";
  await run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", key, startOfWeek(today()));
  return (await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key))!.value;
}

/**
 * Locks in the winners of every event period that has ended. Runs automatically
 * (on page views and from the scheduler), is safe to run any number of times, and
 * snapshots the prizes, so later changes can't reshuffle what was already won.
 */
export async function finalizeEvents(): Promise<void> {
  // A period closes once its last day is final, i.e. after the next morning's
  // 10 AM "forgot to tick" window.
  const finalDay = lastFinalDay(today(), nowHHMM());
  const [{ first }, prizes, themes] = await Promise.all([history(), eventPrizes(), eventThemes()]);
  for (const kind of ["week", "month"] as EventKind[]) {
    const e = EVENTS[kind];
    let from = e.start(first);
    if (kind === "week") {
      const since = await weeklyEventsFrom();
      if (since > from) from = since;
    }
    const done = new Set(
      (await all<{ period: string }>("SELECT period FROM event_periods WHERE event = ?", kind)).map((r) => r.period),
    );
    for (let p = from; addDays(e.next(p), -1) <= finalDay; p = e.next(p)) {
      if (done.has(p)) continue;
      const end = addDays(e.next(p), -1);
      const theme = resolveTheme(themes[kind], kind, p);
      const rows = await eventStandings({ kind, start: p, theme }, end);
      const winners = rows.filter((r) => r.rank > 0 && r.rank <= PLACES && (r.score ?? 0) > 0 && hasPrize(prizes[kind][r.rank - 1]));
      await batch(
        sql("INSERT OR IGNORE INTO event_periods (event, period, finalized_at, theme) VALUES (?, ?, ?, ?)", kind, p, nowStamp(), theme),
        ...winners.map((w) => {
          const prize = prizes[kind][w.rank - 1];
          return sql(
            "INSERT OR IGNORE INTO event_results (event, period, member_id, place, score, prize_coins, prize_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
            kind, p, w.member.id, w.rank, w.score!, prize.coins, prize.prize,
          );
        }),
      );
    }
  }
}

const RESULT_COLS = "r.*, p.theme AS theme FROM event_results r JOIN event_periods p ON p.event = r.event AND p.period = r.period";

export function eventResults(kind?: EventKind): Promise<EventResult[]> {
  return kind
    ? all<EventResult>(`SELECT ${RESULT_COLS} WHERE r.event = ? ORDER BY r.period DESC, r.place, r.member_id`, kind)
    : all<EventResult>(`SELECT ${RESULT_COLS} ORDER BY r.period DESC, r.event, r.place, r.member_id`);
}

// ---------- Badges & coins ----------

export type BadgeId =
  | "first_step" | "perfect_day" | "streak_3" | "streak_7" | "streak_30" | "early_bird"
  | "perfect_pill" | "century" | "star_of_day" | "perfect_week" | "champion";

export const BADGES: { id: BadgeId; emoji: string; name: string; how: string; repeat?: boolean }[] = [
  { id: "first_step", emoji: "🌱", name: "First Step", how: "Tick your first task" },
  { id: "perfect_day", emoji: "💯", name: "Perfect Day", how: "Finish 100% of a day's routine", repeat: true },
  { id: "streak_3", emoji: "🔥", name: "On Fire", how: `3-day streak (${STREAK_MIN}%+ each day)` },
  { id: "streak_7", emoji: "⚡", name: "Unstoppable", how: "7-day streak" },
  { id: "streak_30", emoji: "🏔️", name: "Legend", how: "30-day streak" },
  { id: "early_bird", emoji: "🌅", name: "Early Bird", how: "20 before-9-AM tasks done on time" },
  { id: "perfect_pill", emoji: "💊", name: "Perfect Pill", how: "Every medicine on time for 7 days in a row" },
  { id: "century", emoji: "🎯", name: "Century", how: "100 tasks done" },
  { id: "star_of_day", emoji: "⭐", name: "Star of the Day", how: "Top of the family for a day", repeat: true },
  { id: "perfect_week", emoji: "🌟", name: "Perfect Week", how: "100% on every day of a Mon–Sun week", repeat: true },
  { id: "champion", emoji: "👑", name: "Champion", how: "Finish a month at #1", repeat: true },
];

export type EarnedBadge = { id: BadgeId; count: number; first: string; last: string };

export type Achievements = {
  badges: EarnedBadge[];
  streak: Streak;
  coinsEarned: number;
  /** Part of coinsEarned that came from weekly/monthly event prizes. */
  prizeCoins: number;
  /** Coins taken away for missed items. */
  coinsPenalty: number;
  coinsSpent: number;
  coins: number;
};

/** Badges, streaks and coin balance for every active member. Cached per request. */
export const achievements = cache(async (): Promise<Map<number, Achievements>> => {
  const [{ members, byMember, versions }, results, spentRows] = await Promise.all([
    history(),
    eventResults(),
    all<{ member_id: number; n: number }>(
      "SELECT member_id, SUM(cost) AS n FROM redemptions WHERE status != 'declined' GROUP BY member_id",
    ),
  ]);
  const spent = new Map(spentRows.map((r) => [r.member_id, r.n]));
  const t = today();
  const yesterday = addDays(t, -1);

  // Star of the Day: everyone tied for the top score on each finished day (score > 0).
  const stars = new Map<number, string[]>();
  const dates = byMember.get(members[0]?.id)?.map((d) => d.date) ?? [];
  dates.forEach((date, i) => {
    if (date >= t) return;
    const pcts = members.map((m) => ({ id: m.id, p: dayPct(byMember.get(m.id)![i]) }));
    const top = Math.max(...pcts.map((x) => x.p ?? -1));
    if (top <= 0) return;
    for (const x of pcts) if (x.p !== null && Math.round(x.p) === Math.round(top)) stars.set(x.id, [...(stars.get(x.id) ?? []), date]);
  });

  const result = new Map<number, Achievements>();
  for (const m of members) {
    const days = byMember.get(m.id)!;
    const earned = new Map<BadgeId, EarnedBadge>();
    let coinsEarned = 0;
    let coinsPenalty = 0;
    const award = (id: BadgeId, date: string) => {
      const b = earned.get(id);
      if (b) {
        b.count++;
        b.last = date;
      } else earned.set(id, { id, count: 1, first: date, last: date });
      // Bonus coins, at the rate in force on the day it was earned.
      const rules = rulesAt(versions, date);
      coinsEarned += id === "perfect_day" || id === "star_of_day" || id === "perfect_week" ? rules[id] : rules.badge;
    };

    let totalDone = 0, early = 0, streakRun = 0, pillRun = 0;
    for (const d of days) {
      // Task coins (worked out in history() with the rules in force that day), minus penalties.
      coinsEarned += d.coins;
      coinsPenalty += d.penalty;
      totalDone += d.done;
      early += d.earlyOnTime;
      if (d.done > 0 && !earned.has("first_step")) award("first_step", d.date);
      if (totalDone >= 100 && !earned.has("century")) award("century", d.date);
      if (early >= 20 && !earned.has("early_bird")) award("early_bird", d.date);

      const p = dayPct(d);
      if (p !== null) {
        if (p === 100) award("perfect_day", d.date);
        if (p >= STREAK_MIN) {
          streakRun++;
          // One-time badges: only the first streak to reach each length counts.
          if (streakRun === 3 && !earned.has("streak_3")) award("streak_3", d.date);
          if (streakRun === 7 && !earned.has("streak_7")) award("streak_7", d.date);
          if (streakRun === 30 && !earned.has("streak_30")) award("streak_30", d.date);
        } else if (d.date !== t) streakRun = 0;
      }

      if (d.meds > 0 && !d.away) {
        if (d.medsOnTime === d.meds) {
          if (++pillRun === 7 && !earned.has("perfect_pill")) award("perfect_pill", d.date);
        } else if (d.date !== t) pillRun = 0;
      }

      // A finished Mon–Sun week with at least 3 counting days, all at 100%.
      if (d.date <= yesterday && startOfWeek(d.date) === addDays(d.date, -6)) {
        const week = days.filter((w) => w.date >= addDays(d.date, -6) && w.date <= d.date).map(dayPct).filter((x) => x !== null);
        if (week.length >= 3 && week.every((x) => x === 100)) award("perfect_week", d.date);
      }
    }
    for (const date of stars.get(m.id) ?? []) award("star_of_day", date);

    const mine = results.filter((r) => r.member_id === m.id);
    for (const r of mine.filter((r) => r.event === "month" && r.place === 1)) award("champion", addDays(nextMonth(r.period), -1));
    const prizeCoins = mine.reduce((n, r) => n + r.prize_coins, 0);
    coinsEarned += prizeCoins;

    const badges = BADGES.map((b) => earned.get(b.id)).filter((b): b is EarnedBadge => !!b);
    const coinsSpent = spent.get(m.id) ?? 0;
    result.set(m.id, {
      badges,
      streak: streakOf(days),
      coinsEarned,
      prizeCoins,
      coinsPenalty,
      coinsSpent,
      coins: coinsEarned - coinsPenalty - coinsSpent,
    });
  }
  return result;
});

export async function achievementsFor(memberId: number): Promise<Achievements> {
  return (
    (await achievements()).get(memberId) ?? {
      badges: [],
      streak: { current: 0, best: 0 },
      coinsEarned: 0,
      prizeCoins: 0,
      coinsPenalty: 0,
      coinsSpent: 0,
      coins: 0,
    }
  );
}

// ---------- Period awards (week / month) ----------

export type AwardId = "champion" | "improved" | "streak" | "early" | "pill";
/** `value` fills the award's explanation (a %, points, days or a count). */
export type Award = { id: AwardId; emoji: string; value: number; winners: Member[] };

/** Several ways to win, so it's not only ever the fittest person on top. */
export async function periodAwards(from: string, to: string, prevFrom: string, prevTo: string): Promise<Award[]> {
  const [now, prev] = await Promise.all([standings(from, to), standings(prevFrom, prevTo)]);
  const before = new Map(prev.map((s) => [s.member.id, s.score]));
  const awards: Award[] = [];

  // Everyone tied for the highest value, as long as it reaches `min`.
  const topBy = (vals: { m: Member; v: number }[], min: number) => {
    const best = Math.max(...vals.map((x) => x.v));
    return best >= min ? vals.filter((x) => x.v === best).map((x) => x.m) : [];
  };

  const champ = now.filter((s) => s.rank === 1 && (s.score ?? 0) > 0);
  if (champ.length) awards.push({ id: "champion", emoji: "👑", value: Math.round(champ[0].score!), winners: champ.map((s) => s.member) });

  const improved = now
    .filter((s) => s.score !== null && before.get(s.member.id) != null)
    .map((s) => ({ m: s.member, v: Math.round(s.score! - before.get(s.member.id)!) }));
  const bestGain = Math.max(0, ...improved.map((x) => x.v));
  if (bestGain >= 1) {
    awards.push({ id: "improved", emoji: "📈", value: bestGain, winners: improved.filter((x) => x.v === bestGain).map((x) => x.m) });
  }

  const streakers = topBy(now.map((s) => ({ m: s.member, v: s.streak })), 2);
  if (streakers.length) {
    const n = now.find((s) => s.member.id === streakers[0].id)!.streak;
    awards.push({ id: "streak", emoji: "🔥", value: n, winners: streakers });
  }

  const birds = topBy(now.map((s) => ({ m: s.member, v: s.earlyOnTime })), 1);
  if (birds.length) {
    const n = now.find((s) => s.member.id === birds[0].id)!.earlyOnTime;
    awards.push({ id: "early", emoji: "🌅", value: n, winners: birds });
  }

  // Not a competition: everyone who took every medicine on time gets it.
  const pills = now.filter((s) => s.meds > 0 && s.medsOnTime === s.meds).map((s) => s.member);
  if (pills.length) awards.push({ id: "pill", emoji: "💊", value: 0, winners: pills });

  return awards;
}

// ---------- Weekly recap ----------

export type WeekRecap = {
  from: string;
  to: string;
  /** Average score over the week (so far), and the week before for comparison. */
  score: number | null;
  prevScore: number | null;
  done: number;
  scheduled: number;
  perfectDays: number;
  bestDay: { date: string; pct: number } | null;
  /** Coins earned from tasks that week, minus penalties (bonuses and prizes not included). */
  coins: number;
  badges: BadgeId[];
  /** Place in that week's challenge (0 = not ranked). */
  eventRank: number;
  eventTheme: Theme;
};

/** A member's week in numbers: shown on Today on Sundays and Mondays, and under Me. */
export async function weekRecap(memberId: number, weekStart: string, to: string): Promise<WeekRecap> {
  const [prevFrom, prevTo] = previousPeriod("week", weekStart);
  const themes = await eventThemes();
  const theme = resolveTheme(themes.week, "week", weekStart);
  const [{ byMember }, now, before, event, ach] = await Promise.all([
    history(),
    standings(weekStart, to),
    standings(prevFrom, prevTo),
    eventStandings({ kind: "week", start: weekStart, theme }, to),
    achievementsFor(memberId),
  ]);
  const days = (byMember.get(memberId) ?? []).filter((d) => d.date >= weekStart && d.date <= to);
  const row = now.find((s) => s.member.id === memberId);
  let best: WeekRecap["bestDay"] = null;
  for (const d of days) {
    const p = dayPct(d);
    if (p !== null && (!best || p > best.pct)) best = { date: d.date, pct: p };
  }
  const badgesThisWeek = ach.badges.filter((b) => b.last >= weekStart && b.last <= to).map((b) => b.id);
  return {
    from: weekStart,
    to,
    score: row?.score ?? null,
    prevScore: before.find((s) => s.member.id === memberId)?.score ?? null,
    done: row?.done ?? 0,
    scheduled: row?.scheduled ?? 0,
    perfectDays: days.filter((d) => dayPct(d) === 100).length,
    bestDay: best,
    coins: days.reduce((n, d) => n + d.coins - d.penalty, 0),
    badges: badgesThisWeek,
    eventRank: event.find((s) => s.member.id === memberId)?.rank ?? 0,
    eventTheme: theme,
  };
}
