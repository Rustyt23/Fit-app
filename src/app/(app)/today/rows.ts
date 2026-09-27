// Shared by the Today and Yesterday pages: a task row's status line and props.
import { ANY_TIME_REMINDER, ON_TIME_GRACE_MIN, type TodayItem } from "@/lib/data";
import { formatTime, minutes } from "@/lib/dates";
import type { T } from "@/lib/i18n";
import type { RowStatus } from "./TaskRow";

export function statusOf(item: TodayItem, now: number, t: T): RowStatus {
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
export function rowProps(it: TodayItem, date: string, memberId: number, status: RowStatus, t: T) {
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
