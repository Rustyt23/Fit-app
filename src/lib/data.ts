import "server-only";
import { cache } from "react";
import { all, get } from "./db";
import { addDays, daysBetween, minutes, nextMonth, startOfMonth, startOfWeek, today, weekday } from "./dates";
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
  "id, name, is_admin, photo_version, (photo IS NOT NULL OR photo_key IS NOT NULL) AS has_photo, color, active, default_pin, lang, text_size";

export async function setting(key: string): Promise<string | undefined> {
  return (await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key))?.value;
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
  return (
    task.start_date <= date &&
    (task.end_date === null || date < task.end_date) &&
    (!!task.per_week || !!task.per_month || task.days.includes(String(weekday(date))))
  );
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
export type TodayItem = Task & { checkin: Checkin | null; quotaDone: number; quotaTarget: number };

/**
 * The items to show for a day. A weekly/monthly-target item shows every day until its
 * target for that week or month is reached (and on the days it was done).
 */
export async function tasksForDay(memberId: number, date: string): Promise<TodayItem[]> {
  const [weekStart, weekEnd] = quotaPeriod("week", date);
  const [monthStart, monthEnd] = quotaPeriod("month", date);
  const from = weekStart < monthStart ? weekStart : monthStart;
  const to = weekEnd > monthEnd ? weekEnd : monthEnd;
  const [tasks, checkins] = await Promise.all([
    tasksInRange(date, date, memberId),
    all<Checkin>("SELECT * FROM checkins WHERE member_id = ? AND date BETWEEN ? AND ?", memberId, from, to),
  ]);
  const onDay = new Map(checkins.filter((c) => c.date === date).map((c) => [c.task_id, c]));
  return tasks
    .filter((t) => isScheduledOn(t, date))
    .map((t) => {
      const quota = quotaOf(t);
      if (!quota) return { ...t, checkin: onDay.get(t.id) ?? null, quotaDone: 0, quotaTarget: 0 };
      const [start, end] = quotaPeriod(quota.per, date);
      const periodDays = daysBetween(start, end);
      return {
        ...t,
        checkin: onDay.get(t.id) ?? null,
        quotaDone: checkins.filter((c) => c.task_id === t.id && c.date >= start && c.date <= end).length,
        quotaTarget: quotaTarget(quota.count, periodDays.filter((d) => isScheduledOn(t, d)).length, periodDays.length),
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
