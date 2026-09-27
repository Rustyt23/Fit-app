import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { breakOn, countsFrom, quotaOf, tasksForDay, trackingStart, type TodayItem } from "@/lib/data";
import { addDays, formatDate, formatTime, minutes, nowHHMM, today } from "@/lib/dates";
import { LATE_TICK_UNTIL, inLateWindow } from "@/lib/tick-window";
import { kindEmoji } from "@/lib/kinds";
import { translator, type T } from "@/lib/i18n";
import ProgressRing from "@/components/ProgressRing";
import TaskRow from "../today/TaskRow";
import { rowProps, statusOf } from "../today/rows";

/**
 * Yesterday, one tap away from Today (🕙). Until 10 AM its unticked items can still be
 * ticked here (they count as done, just not on time); after that it shows how the day went.
 */
export default async function YesterdayPage() {
  const me = await requireMember();
  const t = translator(me.lang);
  const date = addDays(today(), -1);
  const nowText = nowHHMM();
  const [items, away, familyStart] = await Promise.all([tasksForDay(me.id, date), breakOn(me.id, date), trackingStart()]);
  const notCounted = date < countsFrom(me, familyStart);
  const open = inLateWindow(nowText) && !away;
  // Weekly/monthly-target items can simply be done today instead, so only fixed ones are listed.
  const list = items.filter((i) => !quotaOf(i) || i.checkin);
  const done = list.filter((i) => i.checkin);
  const left = list.filter((i) => !i.checkin);
  const percent = list.length ? Math.round((done.length / list.length) * 100) : 0;

  const pill = away
    ? { text: `🤒 ${t("hist.break")}`, cls: "bg-sky-100 text-sky-800" }
    : notCounted
      ? { text: t("hist.none"), cls: "bg-stone-100 text-muted" }
      : open
        ? { text: t("yday.openUntil", { time: formatTime(LATE_TICK_UNTIL) }), cls: "bg-orange-100 text-brand-dark" }
        : { text: t("yday.closedPill"), cls: "bg-stone-100 text-muted" };

  return (
    <div className="space-y-4">
      <Link href="/today" className="text-sm font-bold text-muted">
        ‹ {t("nav.today")}
      </Link>

      <section className="card bg-gradient-to-br from-orange-50 via-white to-white">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black">🕙 {t("hist.yesterday")}</h1>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${pill.cls}`}>{pill.text}</span>
        </div>
        <p className="text-sm font-bold text-muted">{formatDate(date, undefined, me.lang)}</p>
        {list.length > 0 && (
          <div className="mt-4 flex items-center gap-4">
            <ProgressRing percent={percent} size={64} stroke={7} color={percent === 100 ? "var(--color-supplement)" : "var(--color-brand)"}>
              <span className="text-base font-black">{percent}%</span>
            </ProgressRing>
            <div className="min-w-0">
              <p className="text-lg font-black">{t("today.progress", { done: done.length, total: list.length })}</p>
              <p className="text-sm text-muted">
                {away
                  ? t("hist.break")
                  : notCounted
                    ? t("hist.notCounted")
                    : open
                      ? left.length
                        ? t("yday.sub", { time: formatTime(LATE_TICK_UNTIL) })
                        : t("today.allDoneSub")
                      : t("yday.closed", { time: formatTime(LATE_TICK_UNTIL) })}
              </p>
            </div>
          </div>
        )}
      </section>

      {!list.length ? (
        <p className="card text-center text-sm text-muted">{t("hist.nothing")}</p>
      ) : open ? (
        <>
          {left.length > 0 && (
            <Group title={t("yday.toTick")} count={left.length}>
              {left.map((it) => (
                <li key={it.id}>
                  <TaskRow {...tickable(it, date, me.id, nowText, notCounted, t)} simple={me.text_size === "large"} />
                </li>
              ))}
            </Group>
          )}
          {done.length > 0 && (
            <Group title={t("hist.done")} count={done.length}>
              {done.map((it) => (
                <li key={it.id}>
                  <TaskRow {...tickable(it, date, me.id, nowText, notCounted, t)} simple={me.text_size === "large"} />
                </li>
              ))}
            </Group>
          )}
        </>
      ) : (
        <>
          {left.length > 0 && (
            <Group title={notCounted || away ? t("yday.notTicked") : t("hist.missed")} count={left.length}>
              {left.map((it) => (
                <Row key={it.id} it={it} t={t} tone={notCounted || away ? "muted" : "missed"} />
              ))}
            </Group>
          )}
          {done.length > 0 && (
            <Group title={t("hist.done")} count={done.length}>
              {done.map((it) => (
                <Row key={it.id} it={it} t={t} tone="done" />
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  );
}

/** Row props for ticking; on a day that doesn't count, no coin or penalty tags. */
function tickable(it: TodayItem, date: string, memberId: number, nowText: string, notCounted: boolean, t: T) {
  const status = it.checkin ? statusOf(it, minutes(nowText), t) : { tone: "overdue" as const, text: t("status.yesterday") };
  const props = rowProps(it, date, memberId, status, t);
  return notCounted ? { ...props, coins: null, penaltyText: undefined } : props;
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-extrabold uppercase tracking-wider text-muted">
        {title}
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] text-ink">{count}</span>
      </h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

/** A read-only row once yesterday is closed. */
function Row({ it, t, tone }: { it: TodayItem; t: T; tone: "done" | "missed" | "muted" }) {
  const styles = {
    done: { box: "border-emerald-100 bg-white", mark: "bg-emerald-500 text-white", text: "text-emerald-700" },
    missed: { box: "border-red-100 bg-white", mark: "bg-red-100 text-red-600", text: "text-red-700" },
    muted: { box: "border-line bg-white", mark: "bg-stone-100 text-muted", text: "text-muted" },
  }[tone];
  return (
    <li className={`flex items-center gap-3 rounded-3xl border px-3 py-3 shadow-sm ${styles.box}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-stone-50 text-2xl">{kindEmoji(it.kind, it.custom_emoji)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold">{it.title}</span>
        <span className={`block truncate text-xs font-bold ${styles.text}`}>
          {it.checkin
            ? t(it.checkin.on_time ? "status.doneAt" : "status.doneLate", { time: formatTime(it.checkin.done_at) })
            : it.any_time
              ? t("task.anyTime")
              : formatTime(it.time)}
        </span>
      </span>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-black ${styles.mark}`} aria-hidden>
        {tone === "done" ? "✓" : tone === "missed" ? "✗" : "–"}
      </span>
    </li>
  );
}
