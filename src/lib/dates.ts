// Calendar days are 'YYYY-MM-DD' strings in the family's timezone.
// All day arithmetic below is pure calendar math (done in UTC), so it gives the
// same answer on your own computer and on Cloudflare Workers (which run in UTC).
//
// The family's timezone is India (IST, Asia/Kolkata) wherever the server runs.
// APP_TIMEZONE can override it (e.g. "Europe/London") if the family ever moves.

const pad = (n: number) => String(n).padStart(2, "0");

export function timeZone(): string {
  return process.env.APP_TIMEZONE || "Asia/Kolkata";
}

type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock time in the family's timezone at a given instant. */
function zoned(instant: number): Parts {
  const tz = timeZone();
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

export function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** A calendar day as a Date at 00:00 UTC (only use the UTC getters on it). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function today(): string {
  const p = zoned(Date.now());
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Day and time (in the family's timezone) of an instant, e.g. when a tick was tapped. */
export function zonedDateTime(instant: number): { date: string; time: string } {
  const p = zoned(instant);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

export function nowHHMM(): string {
  const p = zoned(Date.now());
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** The instant (epoch ms) when the given day and time begin in the family's timezone. */
export function instantOf(date: string, hhmm = "00:00"): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const offset = (t: number) => {
    const p = zoned(t);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
  };
  const first = wall - offset(wall);
  const second = wall - offset(first); // corrects around daylight-saving changes
  return second;
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

export function weekday(s: string): number {
  return parseDate(s).getUTCDay();
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the week containing `s`. */
export function startOfWeek(s: string): string {
  return addDays(s, -((weekday(s) + 6) % 7));
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + "01";
}

/** First day of the month after the one containing `s`. */
export function nextMonth(s: string): string {
  const d = parseDate(s);
  return toDateStr(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}

/** First day of the month before the one containing `s`. */
export function prevMonth(s: string): string {
  const d = parseDate(s);
  return toDateStr(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "07:30" -> "7:30 AM" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${pad(m)} ${suffix}`;
}

export function formatDate(
  s: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" },
  lang: string = "en",
): string {
  return parseDate(s).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-GB", { ...opts, timeZone: "UTC" });
}

/** "2026-09" or "2026-09-01" -> "September 2026" */
export function formatMonth(s: string, lang: string = "en"): string {
  return formatDate(`${s.slice(0, 7)}-01`, { month: "long", year: "numeric" }, lang);
}

/**
 * Shows a stored timestamp in the family's timezone, e.g. "27 Sept, 7:05 AM".
 * New rows store UTC ISO strings; older rows stored local "YYYY-MM-DD HH:MM:SS".
 */
export function formatStamp(stamp: string): string {
  let date: string, time: string;
  if (stamp.includes("T")) {
    const p = zoned(Date.parse(stamp));
    date = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
    time = `${pad(p.h)}:${pad(p.mi)}`;
  } else {
    [date, time] = [stamp.slice(0, 10), stamp.slice(11, 16)];
  }
  return `${formatDate(date, { day: "numeric", month: "short" })}, ${formatTime(time)}`;
}
