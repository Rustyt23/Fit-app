"use client";

import { useState } from "react";

// Monday first, values are JS weekdays (0 = Sunday).
const DAYS = [
  { v: "1", l: "M" },
  { v: "2", l: "T" },
  { v: "3", l: "W" },
  { v: "4", l: "T" },
  { v: "5", l: "F" },
  { v: "6", l: "S" },
  { v: "0", l: "S" },
];

const chip =
  "flex cursor-pointer items-center justify-center rounded-xl border border-line bg-white font-bold text-muted transition has-[:checked]:border-brand has-[:checked]:bg-orange-50 has-[:checked]:text-brand-dark";

type Props = {
  uid: string;
  time?: string;
  anyTime?: boolean;
  days?: string;
  perWeek?: number | null;
  perMonth?: number | null;
  repeatEveryDays?: number | null;
  monthDays?: string | null;
};

const COUNT_LABEL = (n: number) => (n === 1 ? "Once" : n === 2 ? "Twice" : `${n}×`);

type DaysMode = "days" | "weekly" | "monthly" | "interval" | "month_dates";

const ordinal = (day: number) => {
  const mod100 = day % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix}`;
};

const customSummary = (mode: DaysMode, interval: number, monthDays: number[]) => {
  if (mode === "interval") {
    if (interval === 2) return "Every other day";
    if (interval === 7) return "Every week";
    return `Every ${interval} days`;
  }
  if (mode === "month_dates") {
    const selected = monthDays.map(ordinal);
    return selected.length
      ? `${selected.length > 1 ? `${selected.slice(0, -1).join(", ")} & ${selected.at(-1)}` : selected[0]} each month`
      : "Choose monthly dates";
  }
  return "Every 2, 3, 7 or 15 days · specific monthly dates";
};

/** Common schedules stay visible; calendar intervals and monthly dates live in a collapsible panel. */
export default function ScheduleFields({ uid, time, anyTime = false, days, perWeek, perMonth, repeatEveryDays, monthDays }: Props) {
  const [timeMode, setTimeMode] = useState<"set" | "any">(anyTime ? "any" : "set");
  const initialMode: DaysMode = repeatEveryDays ? "interval" : monthDays ? "month_dates" : perWeek ? "weekly" : perMonth ? "monthly" : "days";
  const [daysMode, setDaysMode] = useState<DaysMode>(initialMode);
  const [interval, setIntervalDays] = useState(repeatEveryDays ?? 2);
  const [selectedMonthDays, setSelectedMonthDays] = useState<number[]>(
    monthDays?.split(",").filter(Boolean).map(Number) ?? [],
  );
  const [advancedOpen, setAdvancedOpen] = useState(initialMode === "interval" || initialMode === "month_dates");

  const chooseCommon = (mode: DaysMode) => {
    setDaysMode(mode);
    setAdvancedOpen(false);
  };

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">When</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className={`${chip} gap-1.5 py-2.5 text-sm`}>
            <input type="radio" name="time_mode" value="set" checked={timeMode === "set"} onChange={() => setTimeMode("set")} className="sr-only" />
            ⏰ At a set time
          </label>
          <label className={`${chip} gap-1.5 py-2.5 text-sm`}>
            <input type="radio" name="time_mode" value="any" checked={timeMode === "any"} onChange={() => setTimeMode("any")} className="sr-only" />
            🌤️ Any time of day
          </label>
        </div>
        {timeMode === "set" ? (
          <input
            id={`${uid}-time`}
            name="time"
            type="time"
            aria-label="Time"
            className="field mt-2"
            defaultValue={time || "07:00"}
            required
          />
        ) : (
          <p className="mt-2 text-xs text-muted">No set time and never “late”. If it isn&apos;t ticked by 6 PM, a gentle reminder goes out.</p>
        )}
      </fieldset>

      <fieldset>
        <legend className="label">How often</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["days", "📅 Set days"],
              ["weekly", "🔁 Per week"],
              ["monthly", "🗓️ Per month"],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className={`${chip} py-2.5 text-sm`}>
              <input type="radio" name="days_mode" value={mode} checked={daysMode === mode} onChange={() => chooseCommon(mode)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {daysMode === "days" && (
          <div className="mt-2 grid grid-cols-7 gap-1">
            {DAYS.map((d) => (
              <label key={d.v} className={`${chip} h-12 text-sm`}>
                <input type="checkbox" name="days" value={d.v} defaultChecked={days ? days.includes(d.v) : true} className="sr-only" />
                {d.l}
              </label>
            ))}
          </div>
        )}
        {daysMode === "weekly" && (
          <div className="mt-2">
            <div className="grid grid-cols-6 gap-1">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <label key={n} className={`${chip} h-12 text-sm`}>
                  <input type="radio" name="per_week" value={n} defaultChecked={(perWeek ?? 1) === n} className="sr-only" />
                  {COUNT_LABEL(n)}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Times a week, on any days. It shows every day until it&apos;s done; anything still missing counts on Sunday.
            </p>
          </div>
        )}
        {daysMode === "monthly" && (
          <div className="mt-2">
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((n) => (
                <label key={n} className={`${chip} h-12 text-sm`}>
                  <input type="radio" name="per_month" value={n} defaultChecked={(perMonth ?? 1) === n} className="sr-only" />
                  {COUNT_LABEL(n)}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Times a month, on any days (e.g. a monthly check-up). It shows every day until it&apos;s done; anything still missing
              counts on the last day of the month.
            </p>
          </div>
        )}

        <details
          className="group/schedule mt-2 rounded-2xl border border-line bg-white"
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
            <span aria-hidden>🗓️</span>
            <span className="min-w-0 flex-1">
              More schedules
              <span className="block truncate text-xs font-semibold text-muted">
                {customSummary(daysMode, interval, selectedMonthDays)}
              </span>
            </span>
            <span className="text-muted transition-transform group-open/schedule:rotate-180">⌄</span>
          </summary>

          <div className="space-y-4 border-t border-line p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className={`${chip} py-2.5 text-sm`}>
                <input
                  type="radio"
                  name="days_mode"
                  value="interval"
                  checked={daysMode === "interval"}
                  onChange={() => setDaysMode("interval")}
                  className="sr-only"
                />
                🔁 Every N days
              </label>
              <label className={`${chip} py-2.5 text-sm`}>
                <input
                  type="radio"
                  name="days_mode"
                  value="month_dates"
                  checked={daysMode === "month_dates"}
                  onChange={() => setDaysMode("month_dates")}
                  className="sr-only"
                />
                📆 Monthly dates
              </label>
            </div>

            {daysMode === "interval" && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted">Repeat from the day this routine starts</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[2, 3, 7, 15].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setIntervalDays(n)}
                      className={`h-11 rounded-xl border text-sm font-bold transition ${
                        interval === n ? "border-brand bg-orange-50 text-brand-dark" : "border-line bg-white text-muted"
                      }`}
                    >
                      {n === 2 ? "Other day" : n === 7 ? "Weekly" : `${n} days`}
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm font-bold" htmlFor={`${uid}-interval`}>
                  Every
                  <input
                    id={`${uid}-interval`}
                    name="repeat_every_days"
                    type="number"
                    min={1}
                    max={365}
                    value={interval}
                    onChange={(event) => setIntervalDays(Number(event.target.value))}
                    className="field w-24 text-center"
                    required
                  />
                  days
                </label>
              </div>
            )}

            {daysMode === "month_dates" && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted">Pick one or more dates, such as the 1st and 16th</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <label key={day} className={`${chip} aspect-square text-xs`}>
                      <input
                        type="checkbox"
                        name="month_days"
                        value={day}
                        checked={selectedMonthDays.includes(day)}
                        onChange={(event) =>
                          setSelectedMonthDays((current) =>
                            event.target.checked ? [...current, day].sort((a, b) => a - b) : current.filter((value) => value !== day),
                          )
                        }
                        className="sr-only"
                      />
                      {day}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Dates that don&apos;t exist in a shorter month are skipped.</p>
              </div>
            )}
          </div>
        </details>
      </fieldset>
    </div>
  );
}
