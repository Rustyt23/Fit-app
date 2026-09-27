"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { adminText, type AKey } from "@/lib/i18n-admin";

// Monday first, values are JS weekdays (0 = Sunday).
const DAYS = ["1", "2", "3", "4", "5", "6", "0"];
const LETTERS: Record<Lang, string[]> = {
  en: ["S", "M", "T", "W", "T", "F", "S"],
  hi: ["र", "सो", "मं", "बु", "गु", "शु", "श"],
};
const ALL_DAYS = "0123456";

const chip =
  "flex cursor-pointer items-center justify-center rounded-xl border border-line bg-white font-bold text-muted transition has-[:checked]:border-brand has-[:checked]:bg-orange-50 has-[:checked]:text-brand-dark";

/** How the item repeats. "daily" and "weekdays" are both saved as chosen weekdays. */
type Repeat = "daily" | "weekdays" | "interval" | "weekly" | "monthly" | "month_dates";

const REPEATS: { value: Repeat; key: AKey }[] = [
  { value: "daily", key: "sf.daily" },
  { value: "weekdays", key: "sf.weekdays" },
  { value: "interval", key: "sf.interval" },
  { value: "weekly", key: "sf.weekly" },
  { value: "monthly", key: "sf.monthly" },
  { value: "month_dates", key: "sf.monthDates" },
];

type Props = {
  uid: string;
  time?: string;
  anyTime?: boolean;
  days?: string;
  perWeek?: number | null;
  perMonth?: number | null;
  repeatEveryDays?: number | null;
  monthDays?: string | null;
  /** Today, for the date limits. */
  today: string;
  /** Start and (inclusive) last day. Editing: the start can only change before the item has started. */
  startDate?: string;
  lastDay?: string | null;
  editing?: boolean;
  lang?: Lang;
};


const ordinal = (day: number) => {
  const mod100 = day % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix}`;
};

const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} & ${items.at(-1)}` : (items[0] ?? ""));

function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function formatDay(d: string, lang: Lang) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * When and how often. Starts as "Every day · Any time of day" with one summary line;
 * "Customise" opens dropdowns for the time, how it repeats, and when it starts and ends.
 */
export default function ScheduleFields(props: Props) {
  const { uid, today, editing = false, lang = "en" } = props;
  const t = adminText(lang);
  const times = (n: number) => (n === 1 ? t("sched.once") : n === 2 ? t("sched.twice") : t("sf.nTimes", { n }));
  const dayNames = t("sched.days").split(",");
  const initialDays = props.days ?? ALL_DAYS;
  const initialRepeat: Repeat = props.repeatEveryDays
    ? "interval"
    : props.monthDays
      ? "month_dates"
      : props.perWeek
        ? "weekly"
        : props.perMonth
          ? "monthly"
          : initialDays.length === 7
            ? "daily"
            : "weekdays";

  const [anyTime, setAnyTime] = useState(props.anyTime ?? true);
  const [time, setTime] = useState(props.time || "07:00");
  const [repeat, setRepeat] = useState<Repeat>(initialRepeat);
  const [days, setDays] = useState<string[]>(initialDays === ALL_DAYS ? ["1", "2", "3", "4", "5"] : initialDays.split(""));
  const [interval, setIntervalDays] = useState(props.repeatEveryDays ?? 2);
  const [perWeek, setPerWeek] = useState(props.perWeek ?? 3);
  const [perMonth, setPerMonth] = useState(props.perMonth ?? 1);
  const [monthDays, setMonthDays] = useState<number[]>(props.monthDays?.split(",").filter(Boolean).map(Number) ?? [1]);
  const [start, setStart] = useState(props.startDate && props.startDate > today ? props.startDate : today);
  const [ends, setEnds] = useState(!!props.lastDay);
  const [lastDay, setLastDay] = useState(props.lastDay ?? "");
  const startLocked = editing && (props.startDate ?? today) <= today;
  const customised = anyTime !== true || repeat !== "daily" || start !== today || ends;
  const [open, setOpen] = useState(editing && customised);

  const often =
    repeat === "daily"
      ? t("sched.everyDay")
      : repeat === "weekdays"
        ? days.length === 5 && !days.includes("0") && !days.includes("6")
          ? t("sched.weekdays")
          : days.length === 2 && days.includes("0") && days.includes("6")
            ? t("sched.weekends")
            : list(DAYS.filter((d) => days.includes(d)).map((d) => dayNames[Number(d)])) || t("sf.pickDays")
        : repeat === "interval"
          ? interval === 2
            ? t("sched.otherDay")
            : t("sched.everyN", { n: interval })
          : repeat === "weekly"
            ? t("sched.perWeek", { n: times(perWeek) })
            : repeat === "monthly"
              ? t("sched.perMonth", { n: times(perMonth) })
              : monthDays.length
                ? t("sched.monthDays", { dates: list(monthDays.map((d) => (lang === "hi" ? String(d) : ordinal(d)))) })
                : t("sf.pickDates");
  const when = anyTime ? t("sf.anyTime") : formatClock(time);
  const span = [start > today && t("m.from", { date: formatDay(start, lang) }), ends && lastDay && t("m.until", { date: formatDay(lastDay, lang) })]
    .filter(Boolean)
    .join(" ");

  const setDaysMode = repeat === "daily" || repeat === "weekdays";

  return (
    <fieldset>
      <legend className="label">{t("sf.when")}</legend>

      {/* What gets saved, whatever is open or closed. */}
      <input type="hidden" name="time_mode" value={anyTime ? "any" : "set"} />
      {!anyTime && <input type="hidden" name="time" value={time} />}
      <input
        type="hidden"
        name="days_mode"
        value={setDaysMode ? "days" : repeat}
      />
      {repeat === "daily" && DAYS.map((d) => <input key={d} type="hidden" name="days" value={d} />)}
      {repeat === "weekdays" && days.map((d) => <input key={d} type="hidden" name="days" value={d} />)}
      {repeat === "interval" && <input type="hidden" name="repeat_every_days" value={interval} />}
      {repeat === "weekly" && <input type="hidden" name="per_week" value={perWeek} />}
      {repeat === "monthly" && <input type="hidden" name="per_month" value={perMonth} />}
      {repeat === "month_dates" && monthDays.map((d) => <input key={d} type="hidden" name="month_days" value={d} />)}
      {!startLocked && <input type="hidden" name="start_date" value={start} />}
      <input type="hidden" name="last_day" value={ends ? lastDay : ""} />

      <div className="rounded-2xl border border-line bg-white">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-xl" aria-hidden>
            {anyTime ? "🌤️" : "⏰"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-extrabold">{often}</span>
            <span className="block truncate text-xs font-semibold text-muted">
              {when}
              {span && ` · ${span}`}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm font-bold text-brand-dark"
          >
            {open ? t("sf.done") : t("sf.customise")}
          </button>
        </div>

        {open && (
          <div className="space-y-4 border-t border-line p-3">
            <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-3">
              <label className="text-sm font-bold text-muted" htmlFor={`${uid}-time-mode`}>
                {t("sf.time")}
              </label>
              <select id={`${uid}-time-mode`} className="field" value={anyTime ? "any" : "set"} onChange={(e) => setAnyTime(e.target.value === "any")}>
                <option value="any">{t("sf.anyTime")}</option>
                <option value="set">{t("sf.setTime")}</option>
              </select>

              {!anyTime && (
                <>
                  <label className="text-sm font-bold text-muted" htmlFor={`${uid}-time`}>
                    {t("sf.at")}
                  </label>
                  <input id={`${uid}-time`} type="time" className="field" value={time} onChange={(e) => setTime(e.target.value || "07:00")} required />
                </>
              )}

              <label className="text-sm font-bold text-muted" htmlFor={`${uid}-repeat`}>
                {t("sf.repeats")}
              </label>
              <select id={`${uid}-repeat`} className="field" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
                {REPEATS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(r.key)}
                  </option>
                ))}
              </select>

              {repeat === "interval" && (
                <>
                  <span className="text-sm font-bold text-muted">{t("sf.every")}</span>
                  <span className="flex items-center gap-2">
                    <Stepper value={interval} min={2} max={365} onChange={setIntervalDays} label={t("sf.daysBetween")} />
                    <span className="text-sm font-bold">{t("sf.days")}</span>
                  </span>
                </>
              )}
              {repeat === "weekly" && (
                <>
                  <label className="text-sm font-bold text-muted" htmlFor={`${uid}-per-week`}>
                    {t("sf.howMany")}
                  </label>
                  <select id={`${uid}-per-week`} className="field" value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {t("sf.aWeekAny", { times: times(n) })}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {repeat === "monthly" && (
                <>
                  <label className="text-sm font-bold text-muted" htmlFor={`${uid}-per-month`}>
                    {t("sf.howMany")}
                  </label>
                  <select id={`${uid}-per-month`} className="field" value={perMonth} onChange={(e) => setPerMonth(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {t("sf.aMonthAny", { times: times(n) })}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {repeat === "weekdays" && (
              <div>
                <div className="grid grid-cols-7 gap-1">
                  {DAYS.map((d) => (
                    <label key={d} className={`${chip} h-11 text-sm`} title={dayNames[Number(d)]}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={days.includes(d)}
                        onChange={(e) => setDays((cur) => (e.target.checked ? [...cur, d] : cur.filter((x) => x !== d)))}
                      />
                      {LETTERS[lang][Number(d)]}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-1.5 text-xs font-bold">
                  <button type="button" className="rounded-full border border-line px-2.5 py-1 text-muted" onClick={() => setDays(["1", "2", "3", "4", "5"])}>
                    {t("sched.weekdays")}
                  </button>
                  <button type="button" className="rounded-full border border-line px-2.5 py-1 text-muted" onClick={() => setDays(["6", "0"])}>
                    {t("sched.weekends")}
                  </button>
                </div>
              </div>
            )}

            {repeat === "month_dates" && (
              <div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <label key={day} className={`${chip} h-9 text-xs`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={monthDays.includes(day)}
                        onChange={(e) =>
                          setMonthDays((cur) => (e.target.checked ? [...cur, day].sort((a, b) => a - b) : cur.filter((x) => x !== day)))
                        }
                      />
                      {day}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">{t("sf.shortMonth")}</p>
              </div>
            )}

            {(repeat === "weekly" || repeat === "monthly") && (
              <p className="text-xs text-muted">{t(repeat === "weekly" ? "sf.quotaWeek" : "sf.quotaMonth")}</p>
            )}
            {anyTime && <p className="text-xs text-muted">{t("sf.anyTimeHint")}</p>}

            <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-3 border-t border-line pt-3">
              <label className="text-sm font-bold text-muted" htmlFor={`${uid}-start`}>
                {t("sf.starts")}
              </label>
              <input
                id={`${uid}-start`}
                type="date"
                className="field disabled:bg-stone-50 disabled:text-muted"
                value={startLocked ? (props.startDate ?? today) : start}
                min={today}
                disabled={startLocked}
                onChange={(e) => setStart(e.target.value && e.target.value >= today ? e.target.value : today)}
              />

              <label className="text-sm font-bold text-muted" htmlFor={`${uid}-ends`}>
                {t("sf.ends")}
              </label>
              <select id={`${uid}-ends`} className="field" value={ends ? "date" : "never"} onChange={(e) => setEnds(e.target.value === "date")}>
                <option value="never">{t("sf.never")}</option>
                <option value="date">{t("sf.onDate")}</option>
              </select>

              {ends && (
                <>
                  <label className="text-sm font-bold text-muted" htmlFor={`${uid}-last`}>
                    {t("sf.lastDay")}
                  </label>
                  <input
                    id={`${uid}-last`}
                    type="date"
                    className="field"
                    value={lastDay}
                    min={startLocked ? today : start}
                    onChange={(e) => setLastDay(e.target.value)}
                    required
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </fieldset>
  );
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const btn = "grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-lg font-black text-ink disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value)) || min)))}
        className="h-11 w-14 rounded-xl border border-line text-center text-lg font-black tabular-nums"
        aria-label={label}
      />
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>
        +
      </button>
    </span>
  );
}
