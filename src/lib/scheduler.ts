import { all, get, nowStamp, run } from "./db";
import { activeMembers, breakOn, effectiveTime, tasksForDay } from "./data";
import { formatDate, formatMonth, formatTime, minutes, nowHHMM, today } from "./dates";
import { sendToMember } from "./push";
import { kindEmoji } from "./kinds";
import { EVENTS, finalizeEvents, type EventResult } from "./stats";

/** Reminder goes out at the task's time, if the scheduler ran within this many minutes of it. */
const DUE_WINDOW_MIN = 15;
/** A medicine still not ticked this long after its time triggers a nudge plus a caregiver alert. */
const MISSED_AFTER_MIN = 60;
const MISSED_WINDOW_MIN = 120;

/** Records a reminder before sending it, so a restart or overlapping tick never sends it twice. */
async function claim(taskId: number, date: string, type: "due" | "missed"): Promise<boolean> {
  const r = await run("INSERT OR IGNORE INTO reminders_sent (task_id, date, type) VALUES (?, ?, ?)", taskId, date, type);
  return r.changes > 0;
}

async function remindTasks() {
  const date = today();
  const now = minutes(nowHHMM());
  const admins = await all<{ id: number }>("SELECT id FROM members WHERE active = 1 AND is_admin = 1");
  const hasDevices = async (id: number) => !!(await get("SELECT 1 FROM push_subscriptions WHERE member_id = ?", id));

  for (const member of await activeMembers()) {
    if (await breakOn(member.id, date)) continue; // no nagging on sick / travel days
    for (const task of await tasksForDay(member.id, date)) {
      // Weekly-target items are flexible: no daily nagging.
      if (task.checkin || task.per_week || task.per_month) continue;
      // "Any time" items get one gentle reminder in the evening instead.
      const at = effectiveTime(task);
      const late = now - minutes(at);

      if (late >= 0 && late < DUE_WINDOW_MIN && (await hasDevices(member.id)) && (await claim(task.id, date, "due"))) {
        const emoji = kindEmoji(task.kind, task.custom_emoji);
        await sendToMember(member.id, {
          title: `${emoji} Time for ${task.title}`,
          body: [task.details, "Tap to tick it off."].filter(Boolean).join(" · "),
          url: "/today",
          tag: `due-${task.id}`,
        });
      }

      if (task.kind === "medicine" && late >= MISSED_AFTER_MIN && late < MISSED_WINDOW_MIN && (await claim(task.id, date, "missed"))) {
        await sendToMember(member.id, {
          title: `💊 Did you take your ${task.title}?`,
          body: task.any_time ? "Tick it once you've taken it." : `It was due at ${formatTime(task.time)}. Tick it once you've taken it.`,
          url: "/today",
          tag: `missed-${task.id}`,
        });
        // Caregiver alert to the admins (not to the person themselves).
        for (const admin of admins.filter((a) => a.id !== member.id)) {
          await sendToMember(admin.id, {
            title: `💊 ${member.name} hasn't ticked ${task.title}`,
            body: task.any_time ? "Still not ticked this evening. Maybe give them a call?" : `Due at ${formatTime(task.time)}. Maybe give them a call?`,
            url: `/admin/member/${member.id}`,
            tag: `care-${task.id}`,
          });
        }
      }
    }
  }
  await run("DELETE FROM reminders_sent WHERE date < date(?, '-7 days')", date);
}

/** Tells each winner of a just-finished week or month what they won (once per period). */
async function announceWinners() {
  const periods = await all<{ event: "week" | "month"; period: string }>(
    "SELECT event, period FROM event_periods WHERE notified_at IS NULL",
  );
  for (const p of periods) {
    const claimed = await run(
      "UPDATE event_periods SET notified_at = ? WHERE event = ? AND period = ? AND notified_at IS NULL",
      nowStamp(), p.event, p.period,
    );
    if (!claimed.changes) continue;
    const winners = await all<EventResult>("SELECT * FROM event_results WHERE event = ? AND period = ?", p.event, p.period);
    const when = p.event === "week" ? `the week of ${formatDate(p.period, { day: "numeric", month: "short" })}` : formatMonth(p.period);
    for (const w of winners) {
      const medal = ["🥇", "🥈", "🥉"][w.place - 1] ?? "🏅";
      const prize = [w.prize_coins ? `+${w.prize_coins} coins` : "", w.prize_text].filter(Boolean).join(" and ");
      await sendToMember(w.member_id, {
        title: `${medal} You finished #${w.place} in ${EVENTS[p.event].label.toLowerCase()}!`,
        body: `${when}: ${prize || "well done"}. 🎉`,
        url: "/today",
        tag: `won-${p.event}-${p.period}`,
      });
    }
  }
}

/** One scheduler run: close finished events, announce winners, send due reminders. Safe to repeat. */
export async function tick() {
  await finalizeEvents();
  await announceWinners();
  await remindTasks();
}

const g = globalThis as unknown as { __familyScheduler?: ReturnType<typeof setInterval> };

/** On your own computer / VPS: run every minute inside the server. (On Cloudflare a Cron Trigger calls /api/cron instead.) */
export function startScheduler() {
  if (g.__familyScheduler || process.env.REMINDERS === "off") return;
  const safeTick = () => tick().catch((e) => console.error("[scheduler]", e));
  g.__familyScheduler = setInterval(safeTick, 60_000);
  setTimeout(safeTick, 5_000);
  console.log("[scheduler] started");
}
