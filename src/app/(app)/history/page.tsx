import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { activityBetween, getMember } from "@/lib/data";
import { dayPct, history, type DayStat } from "@/lib/stats";
import { addDays, daysBetween, formatDate, formatMonth, nextMonth, startOfMonth, startOfWeek, today, weekday } from "@/lib/dates";
import { kindEmoji } from "@/lib/kinds";
import { translator, type T } from "@/lib/i18n";

type View = "calendar" | "chart";

/** Colour for a day's score: green all done, amber half or more, red less, grey when it didn't count. */
function tone(p: number | null, away: boolean): string {
  if (away) return "bg-sky-100 text-sky-800";
  if (p === null) return "bg-stone-100 text-muted";
  return p >= 100 ? "bg-emerald-500 text-white" : p >= 50 ? "bg-amber-400 text-white" : "bg-red-400 text-white";
}

function barColor(p: number | null): string {
  if (p === null) return "bg-stone-200";
  return p >= 100 ? "bg-emerald-500" : p >= 50 ? "bg-amber-400" : "bg-red-400";
}

/**
 * Past days as a month calendar (tap a day to see what was done and missed) and as a
 * bar chart (last 30 days, and weekly averages). Anyone can look at anyone (?m=).
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; date?: string; m?: string }>;
}) {
  const me = await requireMember();
  const t = translator(me.lang);
  const q = await searchParams;
  const member = q.m ? await getMember(Number(q.m)) : me;
  if (!member?.active) notFound();
  const view: View = q.view === "chart" ? "chart" : "calendar";
  const now = today();
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") && `${q.month}-01` <= now ? `${q.month}-01` : startOfMonth(now);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(q.date ?? "") && q.date! <= now ? q.date! : month === startOfMonth(now) ? now : null;

  const { byMember } = await history();
  const days = new Map((byMember.get(member.id) ?? []).map((d) => [d.date, d]));
  const href = (p: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const all = { view, m: member.id !== me.id ? String(member.id) : undefined, ...p };
    for (const [k, v] of Object.entries(all)) if (v) params.set(k, v);
    return `/history?${params}`;
  };

  return (
    <div className="space-y-4">
      <Link href={member.id === me.id ? "/today" : `/member/${member.id}`} className="text-sm font-bold text-muted">
        ‹ {member.id === me.id ? t("nav.today") : t("fam.title", { name: member.name })}
      </Link>
      <h1 className="text-2xl font-black">{member.id === me.id ? t("hist.mine") : t("hist.title", { name: member.name })}</h1>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1">
        {(["calendar", "chart"] as const).map((v) => (
          <Link
            key={v}
            href={href({ view: v, month: v === "calendar" ? q.month : undefined })}
            className={`rounded-xl py-2 text-center text-sm font-extrabold transition ${view === v ? "bg-white text-ink shadow-sm" : "text-muted"}`}
          >
            {v === "calendar" ? `📅 ${t("hist.calendar")}` : `📊 ${t("hist.chart")}`}
          </Link>
        ))}
      </div>

      {view === "calendar" ? (
        <>
          <Calendar month={month} now={now} selected={selected} days={days} lang={me.lang} href={href} />
          <Legend t={t} />
          {selected && <DayDetail member={member} date={selected} stat={days.get(selected)} t={t} lang={me.lang} />}
        </>
      ) : (
        <Chart days={days} now={now} t={t} lang={me.lang} />
      )}
    </div>
  );
}

function Calendar({
  month,
  now,
  selected,
  days,
  lang,
  href,
}: {
  month: string;
  now: string;
  selected: string | null;
  days: Map<string, DayStat>;
  lang: string;
  href: (p: Record<string, string | undefined>) => string;
}) {
  const last = addDays(nextMonth(month), -1);
  const blanks = (weekday(month) + 6) % 7; // Monday first
  const prev = startOfMonth(addDays(month, -1)).slice(0, 7);
  const next = nextMonth(month);
  const monday = startOfWeek(now);
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <Link href={href({ month: prev })} className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-lg font-black" aria-label="Previous month">
          ‹
        </Link>
        <p className="text-lg font-black">{formatMonth(month, lang)}</p>
        {next <= now ? (
          <Link href={href({ month: next.slice(0, 7) })} className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-lg font-black" aria-label="Next month">
            ›
          </Link>
        ) : (
          <span className="h-9 w-9" />
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="text-[11px] font-bold uppercase text-muted">
            {formatDate(addDays(monday, i), { weekday: "narrow" }, lang)}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {daysBetween(month, last).map((d) => {
          const stat = days.get(d);
          const p = stat ? dayPct(stat) : null;
          const future = d > now;
          const cell = (
            <span
              className={`flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-black ${
                future ? "text-stone-300" : tone(p, !!stat?.away)
              } ${d === selected ? "ring-2 ring-ink ring-offset-1" : ""} ${d === now ? "underline decoration-2 underline-offset-2" : ""}`}
            >
              {Number(d.slice(8))}
              {!future && p !== null && <span className="text-[9px] font-bold opacity-90">{Math.round(p)}%</span>}
              {stat?.away && <span className="text-[9px]">🤒</span>}
            </span>
          );
          return future ? (
            <span key={d}>{cell}</span>
          ) : (
            <Link key={d} href={href({ month: month.slice(0, 7), date: d })} scroll={false}>
              {cell}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Legend({ t }: { t: T }) {
  const items = [
    ["bg-emerald-500", t("hist.all")],
    ["bg-amber-400", t("hist.most")],
    ["bg-red-400", t("hist.little")],
    ["bg-stone-200", t("hist.none")],
    ["bg-sky-200", t("hist.break")],
  ];
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] font-bold text-muted">
      {items.map(([c, l]) => (
        <li key={l} className="flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded ${c}`} />
          {l}
        </li>
      ))}
    </ul>
  );
}

async function DayDetail({
  member,
  date,
  stat,
  t,
  lang,
}: {
  member: { id: number; tracking_start: string | null };
  date: string;
  stat: DayStat | undefined;
  t: T;
  lang: string;
}) {
  const [day] = await activityBetween(member, date, date);
  const p = stat ? dayPct(stat) : null;
  const isToday = date === today();
  const chip = "rounded-full px-2 py-1 text-xs font-bold";
  return (
    <section className="card space-y-3">
      <h2 className="flex items-baseline justify-between text-lg font-black">
        {formatDate(date, { weekday: "long", day: "numeric", month: "long" }, lang)}
        {p !== null && <span className="text-sm font-extrabold text-muted">{Math.round(p)}%</span>}
      </h2>
      {day?.away && <p className="text-sm font-bold text-sky-800">🤒 {t("hist.break")}</p>}
      {day?.notCounted && <p className="text-xs font-bold text-sky-800">{t("hist.notCounted")}</p>}
      {!day || (!day.done.length && !day.missed.length) ? (
        <p className="text-sm text-muted">{t("hist.nothing")}</p>
      ) : (
        <>
          {day.done.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">{t("hist.done")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {day.done.map((x) => (
                  <li key={x.id} className={`${chip} bg-emerald-50 text-emerald-800`}>
                    ✓ {kindEmoji(x.kind, x.custom_emoji)} {x.title}
                    {!x.on_time && " ⏱"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {day.missed.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">{isToday ? t("hist.toDo") : t("hist.missed")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {day.missed.map((x) => (
                  <li key={x.id} className={`${chip} ${isToday ? "bg-stone-100 text-muted" : "bg-red-50 text-red-700"}`}>
                    {isToday ? "⏳" : "✗"} {kindEmoji(x.kind, x.custom_emoji)} {x.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Chart({ days, now, t, lang }: { days: Map<string, DayStat>; now: string; t: T; lang: string }) {
  const last30 = daysBetween(addDays(now, -29), now).map((d) => {
    const s = days.get(d);
    return { date: d, p: s && !s.away ? dayPct(s) : null };
  });
  const counted = last30.filter((d) => d.p !== null);
  const avg = counted.length ? Math.round(counted.reduce((n, d) => n + d.p!, 0) / counted.length) : null;
  const perfect = counted.filter((d) => d.p! >= 100).length;

  const thisWeek = startOfWeek(now);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(thisWeek, -7 * (11 - i))).map((start) => {
    const ps = daysBetween(start, addDays(start, 6))
      .filter((d) => d <= now)
      .map((d) => days.get(d))
      .map((s) => (s && !s.away ? dayPct(s) : null))
      .filter((p): p is number => p !== null);
    return { start, p: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null };
  });

  if (!counted.length && weeks.every((w) => w.p === null)) {
    return <p className="card text-sm text-muted">{t("hist.noData")}</p>;
  }

  return (
    <>
      <section className="card">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-black">{t("hist.last30")}</h2>
          <p className="text-xs font-extrabold text-muted">
            {avg !== null && t("hist.avg", { n: avg })} · {t("hist.perfect", { n: perfect })}
          </p>
        </div>
        <Bars
          bars={last30.map((d) => ({
            key: d.date,
            p: d.p,
            label: weekday(d.date) === 1 || d.date === now ? String(Number(d.date.slice(8))) : "",
            title: `${formatDate(d.date, { day: "numeric", month: "short" }, lang)}: ${d.p === null ? "–" : `${Math.round(d.p)}%`}`,
          }))}
        />
      </section>
      <section className="card">
        <h2 className="mb-3 font-black">{t("hist.weeks")}</h2>
        <Bars
          bars={weeks.map((w, i) => ({
            key: w.start,
            p: w.p,
            label: i % 2 === 1 || i === weeks.length - 1 ? formatDate(w.start, { day: "numeric", month: "short" }, lang) : "",
            title: `${formatDate(w.start, { day: "numeric", month: "short" }, lang)}: ${w.p === null ? "–" : `${Math.round(w.p)}%`}`,
          }))}
          wide
        />
      </section>
      <Legend t={t} />
    </>
  );
}

/** Simple CSS bar chart, 0–100%, with 50% and 100% guide lines. */
function Bars({ bars, wide = false }: { bars: { key: string; p: number | null; label: string; title: string }[]; wide?: boolean }) {
  return (
    <div>
      <div className="relative h-40">
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
        <span className="absolute -top-2 right-0 bg-white pl-1 text-[9px] font-bold text-muted">100%</span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2 bg-white pl-1 text-[9px] font-bold text-muted">50%</span>
        <div className={`absolute inset-0 flex items-end ${wide ? "gap-1.5" : "gap-[3px]"} pr-7`}>
          {bars.map((b) => (
            <div key={b.key} className="flex h-full flex-1 items-end" title={b.title}>
              <div className={`w-full rounded-t ${barColor(b.p)}`} style={{ height: b.p === null ? "3px" : `${Math.max(3, Math.min(100, b.p))}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className={`mt-1 flex ${wide ? "gap-1.5" : "gap-[3px]"} pr-7`}>
        {bars.map((b) => (
          <span key={b.key} className="flex-1 overflow-visible whitespace-nowrap text-center text-[9px] font-bold text-muted">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
