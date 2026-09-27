import "server-only";
import { cache } from "react";
import { all, get } from "./db";
import { addDays, daysBetween, daysSince, minutes, nextMonth, parseDate, startOfMonth, startOfWeek, today, weekday } from "./dates";
import type { Kind } from "./kinds";
import type { Lang } from "./i18n";

export { KINDS, AVATAR_COLORS, type Kind } from "./kinds";

export type Member = {
  id: number;
  name: string;
  is_admin: number;
  photo_version: number;
  has_photo: number;
  color: string;
  active: number;
  /** 1 while they still have the default PIN (0000). */
  default_pin: number;
  lang: Lang;
  text_size: "normal" | "large";
  /** Set when an admin reset this person: days before it don't count for them. */
  tracking_start: string | null;
};

export type Task = {
  id: number;
  member_id: number;
  kind: Kind;
  title: string;
  details: string;
  /** 'HH:MM', or '' for an any-time item. */
  time: string;
  /** Weekdays it repeats on (0 = Sunday). Ignored for "N times a week" items. */
  days: string;
  /** How much this item counts compared to others of its type (1 = normal). */
  weight: number;
  /** 1 = any time of the day (no set time, never late). */
  any_time: number;
  /** Set for "this many times a week, any days" items. */
  per_week: number | null;
  /** Set for "this many times a month, any days" items. */
  per_month: number | null;
  /** Set for items repeating every N calendar days, anchored to start_date. */
  repeat_every_days: number | null;
  /** Comma-separated dates of the month, e.g. "1,16". */
  month_days: string | null;
  /** For "Your own" types (kind 'other'): the type's name and emoji. */
  custom_type: string | null;
  custom_emoji: string | null;
  /** Coins for doing it (null = the admin's coin rules). */
  coins: number | null;
  /** Coins taken when it's missed. */
  penalty: number;
  start_date: string;
  end_date: string | null;
};

/** Any-time items get their reminder (and medicine check) at this time instead. */
export const ANY_TIME_REMINDER = "18:00";

/** The time used for reminders and "due now" hints. */
export function effectiveTime(task: Pick<Task, "any_time" | "time">): string {
  return task.any_time || !task.time ? ANY_TIME_REMINDER : task.time;
}

export type Checkin = {
  task_id: number;
  member_id: number;
  date: string;
  done_at: string;
  on_time: number;
};

/** A check-in counts as on time up to this many minutes after the scheduled time. */
export const ON_TIME_GRACE_MIN = 60;

const MEMBER_COLS =
  "id, name, is_admin, photo_version, (photo IS NOT NULL OR photo_key IS NOT NULL) AS has_photo, color, active, default_pin, lang, text_size, tracking_start";

export async function setting(key: string): Promise<string | undefined> {
  return (await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key))?.value;
}

/** The day the family's tracking starts (set by an admin); days before it don't count. */
export const trackingStart = cache(async (): Promise<string | null> => (await setting("tracking_start")) ?? null);

/** The first day that counts for a member: the family's start, or their own (after a reset) if later. */
export function countsFrom(member: Pick<Member, "tracking_start">, familyStart: string | null): string {
  const own = member.tracking_start ?? "";
  const family = familyStart ?? "";
  return own > family ? own : family;
}

export const familyName = cache(async (): Promise<string> => (await setting("family_name")) ?? "Our Family");

export async function memberCount(): Promise<number> {
  return (await get<{ n: number }>("SELECT COUNT(*) AS n FROM members"))!.n;
}

export async function getMember(id: number): Promise<Member | undefined> {
  return get<Member>(`SELECT ${MEMBER_COLS} FROM members WHERE id = ?`, id);
}

export const activeMembers = cache(
  (): Promise<Member[]> => all<Member>(`SELECT ${MEMBER_COLS} FROM members WHERE active = 1 ORDER BY id`),
);

/** Whether the item is in force on `date` (so it can be ticked). Weekly-target items are open every day. */
export function isScheduledOn(task: Task, date: string): boolean {
  if (task.start_date > date || (task.end_date !== null && date >= task.end_date)) return false;
  if (task.per_week || task.per_month) return true;
  if (task.repeat_every_days) return daysSince(task.start_date, date) % task.repeat_every_days === 0;
  if (task.month_days) {
    const day = parseDate(date).getUTCDate();
    return task.month_days.split(",").some((value) => Number(value) === day);
  }
  return task.days.includes(String(weekday(date)));
}

/** Tasks that are (or were) in effect at some point during [from, to]. */
function tasksInRange(from: string, to: string, memberId?: number): Promise<Task[]> {
  const sql = `SELECT * FROM tasks WHERE start_date <= ? AND (end_date IS NULL OR end_date > ?)`;
  return memberId === undefined
    ? all<Task>(sql + " ORDER BY time", to, from)
    : all<Task>(sql + " AND member_id = ? ORDER BY any_time, time", to, from, memberId);
}

/** The member's current routine (everything not yet ended), for the admin screens. */
export function currentTasks(memberId: number): Promise<Task[]> {
  return all<Task>(
    "SELECT * FROM tasks WHERE member_id = ? AND (end_date IS NULL OR end_date > ?) ORDER BY per_week IS NOT NULL, per_month IS NOT NULL, any_time, time, id",
    memberId,
    today(),
  );
}

/** "N times a week" or "N times a month" items: a target per period instead of fixed days. */
export type Quota = { per: "week" | "month"; count: number };

export function quotaOf(t: Pick<Task, "per_week" | "per_month">): Quota | null {
  if (t.per_week) return { per: "week", count: t.per_week };
  if (t.per_month) return { per: "month", count: t.per_month };
  return null;
}

/** First and last day of the week or month containing `date`. */
export function quotaPeriod(per: Quota["per"], date: string): [string, string] {
  if (per === "week") {
    const start = startOfWeek(date);
    return [start, addDays(start, 6)];
  }
  const start = startOfMonth(date);
  return [start, addDays(nextMonth(start), -1)];
}

/**
 * The target for a period the item only partly covers (added mid-way, or days off on a
 * break) is scaled down: e.g. 3× a week, available 4 of 7 days → 2.
 */
export function quotaTarget(count: number, availableDays: number, periodDays: number): number {
  return availableDays >= periodDays ? count : Math.min(count, Math.ceil((count * availableDays) / periodDays));
}

export function weekTarget(perWeek: number, availableDays: number): number {
  return quotaTarget(perWeek, availableDays, 7);
}

/** `quotaDone` / `quotaTarget`: for weekly/monthly-target items, progress this week or month. */
/**
 * `shortfall`: on the last day of a week/month (for "N times" items), how many sessions are
 * still missing and will count as missed, worked out exactly as the score does.
 */
export type TodayItem = Task & { checkin: Checkin | null; quotaDone: number; quotaTarget: number; shortfall: number };

/**
 * The items to show for a day. A weekly/monthly-target item shows every day until its
 * target for that week or month is reached (and on the days it was done).
 */
export async function tasksForDay(memberId: number, date: string): Promise<TodayItem[]> {
  const [weekStart, weekEnd] = quotaPeriod("week", date);
  const [monthStart, monthEnd] = quotaPeriod("month", date);
  const from = weekStart < monthStart ? weekStart : monthStart;
  const to = weekEnd > monthEnd ? weekEnd : monthEnd;
  const [tasks, checkins, member, breaks, familyStart] = await Promise.all([
    tasksInRange(date, date, memberId),
    all<Checkin>("SELECT * FROM checkins WHERE member_id = ? AND date BETWEEN ? AND ?", memberId, from, to),
    getMember(memberId),
    all<Break>("SELECT * FROM away_periods WHERE member_id = ? AND end_date >= ? AND start_date <= ?", memberId, from, to),
    trackingStart(),
  ]);
  const onDay = new Map(checkins.filter((c) => c.date === date).map((c) => [c.task_id, c]));
  const countsFromDay = countsFrom(member ?? { tracking_start: null }, familyStart);
  const onBreak = (d: string) => breaks.some((b) => b.start_date <= d && d <= b.end_date);
  return tasks
    .filter((t) => isScheduledOn(t, date))
    .map((t) => {
      const quota = quotaOf(t);
      if (!quota) return { ...t, checkin: onDay.get(t.id) ?? null, quotaDone: 0, quotaTarget: 0, shortfall: 0 };
      const [start, end] = quotaPeriod(quota.per, date);
      const periodDays = daysBetween(start, end);
      // The same sums as the score (stats.history): only counted days, fewer on breaks.
      const active = periodDays.filter((d) => d >= countsFromDay && isScheduledOn(t, d));
      const counted = checkins.filter((c) => c.task_id === t.id && active.includes(c.date)).length;
      const due = quotaTarget(quota.count, active.filter((d) => !onBreak(d)).length, periodDays.length);
      return {
        ...t,
        checkin: onDay.get(t.id) ?? null,
        quotaDone: checkins.filter((c) => c.task_id === t.id && c.date >= start && c.date <= end).length,
        quotaTarget: quotaTarget(quota.count, periodDays.filter((d) => isScheduledOn(t, d)).length, periodDays.length),
        shortfall: date === end && active.at(-1) === end ? Math.max(0, due - counted) : 0,
      };
    })
    .filter((t) => !quotaOf(t) || t.checkin || t.quotaDone < t.quotaTarget);
}

export function isOnTime(scheduled: string, doneAt: string): boolean {
  return minutes(doneAt) <= minutes(scheduled) + ON_TIME_GRACE_MIN;
}

export type AuditEntry = { id: number; action: string; at: string; actor: string | null };

export function recentAudit(limit = 15): Promise<AuditEntry[]> {
  return all<AuditEntry>(
    `SELECT a.id, a.action, a.at, m.name AS actor
     FROM audit_log a LEFT JOIN members m ON m.id = a.actor_id
     ORDER BY a.id DESC LIMIT ?`,
    limit,
  );
}

// ---------- Breaks ----------

export type Break = {
  id: number;
  member_id: number;
  start_date: string;
  end_date: string;
  reason: "sick" | "travel";
};

export const BREAK_REASONS = {
  sick: { emoji: "🤒", label: "Sick" },
  travel: { emoji: "✈️", label: "Travelling" },
} as const;

/** Breaks that haven't finished yet (current or upcoming). */
export function openBreaks(memberId: number): Promise<Break[]> {
  return all<Break>(
    "SELECT * FROM away_periods WHERE member_id = ? AND end_date >= ? ORDER BY start_date",
    memberId,
    today(),
  );
}

export function breakOn(memberId: number, date: string): Promise<Break | undefined> {
  return get<Break>(
    "SELECT * FROM away_periods WHERE member_id = ? AND start_date <= ? AND end_date >= ?",
    memberId,
    date,
    date,
  );
}

export function recentBreaks(memberId: number, limit = 10): Promise<Break[]> {
  return all<Break>("SELECT * FROM away_periods WHERE member_id = ? ORDER BY start_date DESC LIMIT ?", memberId, limit);
}

// ---------- Coin shop ----------

export type Reward = { id: number; emoji: string; title: string; cost: number; hidden: number };

export type Redemption = {
  id: number;
  member_id: number;
  emoji: string;
  title: string;
  cost: number;
  status: "requested" | "given" | "declined";
  requested_at: string;
  resolved_at: string | null;
};

export const STARTER_REWARDS: Omit<Reward, "id">[] = [
  { emoji: "📱", title: "30 minutes extra screen time", cost: 100, hidden: 0 },
  { emoji: "🎬", title: "Pick the Sunday movie", cost: 150, hidden: 0 },
  { emoji: "🧽", title: "Skip the dishes once", cost: 150, hidden: 0 },
  { emoji: "🛌", title: "Sleep in on Sunday", cost: 200, hidden: 0 },
  { emoji: "🍕", title: "Choose what's for dinner", cost: 250, hidden: 0 },
  { emoji: "🍦", title: "Ice-cream treat", cost: 300, hidden: 0 },
  { emoji: "🎁", title: "Surprise gift from the admins", cost: 400, hidden: 1 },
];

export function activeRewards(): Promise<Reward[]> {
  return all<Reward>("SELECT id, emoji, title, cost, hidden FROM rewards WHERE active = 1 ORDER BY cost, id");
}

export function redemptionsOf(memberId: number, limit = 20): Promise<Redemption[]> {
  return all<Redemption>("SELECT * FROM redemptions WHERE member_id = ? ORDER BY id DESC LIMIT ?", memberId, limit);
}

export function pendingRedemptions(): Promise<(Redemption & { member_name: string })[]> {
  return all<Redemption & { member_name: string }>(
    `SELECT r.*, m.name AS member_name FROM redemptions r JOIN members m ON m.id = r.member_id
     WHERE r.status = 'requested' ORDER BY r.id`,
  );
}

/** The family's own item types in use (for quick picks when adding items). */
export async function customTypes(): Promise<{ name: string; emoji: string }[]> {
  return all<{ name: string; emoji: string }>(
    `SELECT custom_type AS name, MAX(custom_emoji) AS emoji FROM tasks
     WHERE kind = 'other' AND custom_type IS NOT NULL AND (end_date IS NULL OR end_date > ?)
     GROUP BY custom_type ORDER BY custom_type`,
    today(),
  );
}

/** Everyone's current routine items (for bulk changes). */
export function allCurrentTasks(): Promise<Task[]> {
  return all<Task>(
    `SELECT t.* FROM tasks t JOIN members m ON m.id = t.member_id
     WHERE m.active = 1 AND (t.end_date IS NULL OR t.end_date > ?) ORDER BY t.member_id, t.any_time, t.time, t.id`,
    today(),
  );
}

// ---------- Fair play: reports and help ----------

/** How many days back a tick can still be reported. */
export const REPORT_DAYS = 3;

export type Report = {
  id: number;
  reporter_id: number;
  member_id: number;
  task_id: number;
  date: string;
  title: string;
  reason: string;
  status: "open" | "upheld" | "dismissed";
  penalty: number;
  reward: number;
  created_at: string;
  reporter_name: string;
  member_name: string;
};

const REPORT_COLS = `r.*, a.name AS reporter_name, b.name AS member_name
  FROM reports r JOIN members a ON a.id = r.reporter_id JOIN members b ON b.id = r.member_id`;

export function openReports(): Promise<Report[]> {
  return all<Report>(`SELECT ${REPORT_COLS} WHERE r.status = 'open' ORDER BY r.id`);
}

/** Reports about one person's recent ticks (to show "reported" next to them). */
export function recentReportsAbout(memberId: number): Promise<Report[]> {
  return all<Report>(`SELECT ${REPORT_COLS} WHERE r.member_id = ? AND r.date >= ? ORDER BY r.id`, memberId, addDays(today(), -REPORT_DAYS));
}

export type HelpRequest = {
  id: number;
  member_id: number;
  helped_id: number;
  note: string;
  status: "open" | "approved" | "declined";
  coins: number;
  created_at: string;
  member_name: string;
  helped_name: string;
};

const HELP_COLS = `h.*, a.name AS member_name, b.name AS helped_name
  FROM help_requests h JOIN members a ON a.id = h.member_id JOIN members b ON b.id = h.helped_id`;

export function openHelpRequests(): Promise<HelpRequest[]> {
  return all<HelpRequest>(`SELECT ${HELP_COLS} WHERE h.status = 'open' ORDER BY h.id`);
}

/** A member's own recent help requests, newest first. */
export function myHelpRequests(memberId: number): Promise<HelpRequest[]> {
  return all<HelpRequest>(`SELECT ${HELP_COLS} WHERE h.member_id = ? ORDER BY h.id DESC LIMIT 10`, memberId);
}

// ---------- Follow-up: what each person did and missed ----------

export type DayActivity = {
  date: string;
  /** Items ticked that day (on time or late). */
  done: (Pick<Task, "id" | "title" | "kind" | "custom_emoji"> & { on_time: number })[];
  /** Fixed-day items not ticked. Today these are still "to do", not missed. */
  missed: Pick<Task, "id" | "title" | "kind" | "custom_emoji">[];
  /** On a sick or travel break (nothing counts). */
  away: boolean;
  /** Before tracking started for this person (nothing counts). */
  notCounted: boolean;
};

/**
 * Day-by-day follow-up for the last `days` days (today first): what was ticked and which
 * fixed-day items were missed. "N times a week/month" items show when done; their shortfall
 * is only known at the end of the period, so it isn't listed as missed here.
 */
export function recentActivity(member: Pick<Member, "id" | "tracking_start">, days = 7): Promise<DayActivity[]> {
  const to = today();
  return activityBetween(member, addDays(to, -(days - 1)), to);
}

/** The same, for any range of days (newest first); days after today are left out. */
export async function activityBetween(member: Pick<Member, "id" | "tracking_start">, from: string, until: string): Promise<DayActivity[]> {
  const now = today();
  const to = until > now ? now : until;
  if (from > to) return [];
  const [tasks, checkins, breaks, familyStart] = await Promise.all([
    tasksInRange(from, to, member.id),
    all<Checkin>("SELECT * FROM checkins WHERE member_id = ? AND date BETWEEN ? AND ?", member.id, from, to),
    all<Break>("SELECT * FROM away_periods WHERE member_id = ? AND end_date >= ? AND start_date <= ?", member.id, from, to),
    trackingStart(),
  ]);
  const start = countsFrom(member, familyStart);
  const ticks = new Map(checkins.map((c) => [`${c.task_id}|${c.date}`, c]));
  const lite = (t: Task) => ({ id: t.id, title: t.title, kind: t.kind, custom_emoji: t.custom_emoji });
  const out: DayActivity[] = [];
  for (let date = to; date >= from; date = addDays(date, -1)) {
    const away = breaks.some((b) => b.start_date <= date && date <= b.end_date);
    const day: DayActivity = { date, done: [], missed: [], away, notCounted: date < start };
    for (const t of tasks) {
      if (!isScheduledOn(t, date)) continue;
      const c = ticks.get(`${t.id}|${date}`);
      if (c) day.done.push({ ...lite(t), on_time: c.on_time });
      // Today's open items are always listed (as still to do), even before tracking starts.
      else if (!quotaOf(t) && !away && (!day.notCounted || date === now)) day.missed.push(lite(t));
    }
    out.push(day);
  }
  return out;
}
