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
};

const COUNT_LABEL = (n: number) => (n === 1 ? "Once" : n === 2 ? "Twice" : `${n}×`);

/** When and how often: a set time or any time of day; chosen weekdays or "N times a week". */
export default function ScheduleFields({ uid, time, anyTime = false, days, perWeek, perMonth }: Props) {
  const [timeMode, setTimeMode] = useState<"set" | "any">(anyTime ? "any" : "set");
  const [daysMode, setDaysMode] = useState<"days" | "weekly" | "monthly">(perWeek ? "weekly" : perMonth ? "monthly" : "days");

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
              <input type="radio" name="days_mode" value={mode} checked={daysMode === mode} onChange={() => setDaysMode(mode)} className="sr-only" />
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
      </fieldset>
    </div>
  );
}
