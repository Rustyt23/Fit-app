import { formatTime } from "@/lib/dates";
import { MAX_COINS_PER_RULE } from "@/lib/game";
import { BLANK_TASK, type TaskValues } from "@/lib/templates";
import Coin from "./Coin";
import ScheduleFields from "./ScheduleFields";
import TypeFields, { type CustomType } from "./TypeFields";
import type { Task } from "@/lib/data";

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

const SUGGESTIONS = [
  "Morning walk", "Evening walk", "Yoga", "Stretching", "Gym workout", "Push-ups", "Cycling", "Skipping rope",
  "Vitamin D3", "Vitamin B12", "Omega-3", "Multivitamin", "Protein shake", "Calcium", "Iron",
  "BP tablet", "Sugar tablet", "Thyroid tablet", "Cholesterol tablet", "Eye drops",
];

const chip =
  "flex cursor-pointer items-center justify-center rounded-xl border border-line bg-white font-bold text-muted transition has-[:checked]:border-brand has-[:checked]:bg-orange-50 has-[:checked]:text-brand-dark";

/**
 * The inputs for adding or editing one routine item, inside an ActionForm.
 * The everyday choices (including coins and penalty) are shown; details and importance sit under "More options".
 * Works on the server and in the browser (for templates).
 */
export default function TaskFields({
  memberId,
  id,
  values = BLANK_TASK,
  customTypes = [],
}: {
  memberId?: number;
  id?: number;
  values?: TaskValues;
  /** The family's own types already in use, offered as quick picks. */
  customTypes?: CustomType[];
}) {
  const uid = id ? `t${id}` : "new";
  const extras = [
    values.details,
    values.weight > 1 && `×${values.weight}`,
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      {memberId && <input type="hidden" name="member_id" value={memberId} />}
      {id && <input type="hidden" name="id" value={id} />}

      <TypeFields uid={uid} kind={values.kind} customType={values.custom_type} customEmoji={values.custom_emoji} existing={customTypes} />

      <div>
        <label className="label" htmlFor={`${uid}-title`}>What</label>
        <input
          id={`${uid}-title`}
          name="title"
          className="field"
          placeholder="e.g. Morning walk, Vitamin D3, BP tablet"
          defaultValue={values.title}
          list="task-suggestions"
          required
          maxLength={80}
        />
        <datalist id="task-suggestions">
          {SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <ScheduleFields
        uid={uid}
        time={values.time}
        anyTime={!!values.any_time}
        days={values.days}
        perWeek={values.per_week}
        perMonth={values.per_month}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`${uid}-coins`}>Coins when done</label>
          <span className="relative block">
            <input
              id={`${uid}-coins`}
              name="coins"
              type="number"
              min={0}
              max={MAX_COINS_PER_RULE}
              defaultValue={values.coins ?? ""}
              placeholder="Rules"
              className="field pl-9 text-right font-black"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <Coin size={18} />
            </span>
          </span>
          <p className="mt-1 text-[11px] text-muted">Late ticks get half. Empty = the coin rules.</p>
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-penalty`}>Penalty if missed</label>
          <span className="relative block">
            <input
              id={`${uid}-penalty`}
              name="penalty"
              type="number"
              min={0}
              max={MAX_COINS_PER_RULE}
              defaultValue={values.penalty || ""}
              placeholder="0"
              className="field pl-9 text-right font-black text-red-600"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-black text-red-500">−</span>
          </span>
          <p className="mt-1 text-[11px] text-muted">Taken once the day is over. Never on break days.</p>
        </div>
      </div>

      <details className="group/more rounded-2xl border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
          <span className="text-muted">⚙️</span>
          <span className="flex-1">
            More options
            <span className="block truncate text-xs font-semibold text-muted">
              {extras.length ? extras.join(" · ") : "Details, importance"}
            </span>
          </span>
          <span className="text-muted transition-transform group-open/more:rotate-180">⌄</span>
        </summary>
        <div className="space-y-4 border-t border-line p-3">
          <div>
            <label className="label" htmlFor={`${uid}-details`}>Details</label>
            <input
              id={`${uid}-details`}
              name="details"
              className="field"
              placeholder="e.g. 30 minutes · 1 tablet after breakfast"
              defaultValue={values.details}
              maxLength={160}
            />
          </div>

          <fieldset>
            <legend className="label">Importance (how much it counts in the score)</legend>
            <div className="grid grid-cols-3 gap-2">
              {IMPORTANCE.map((w) => (
                <label key={w.v} className={`${chip} flex-col py-2 text-sm`}>
                  <input type="radio" name="weight" value={w.v} defaultChecked={values.weight === w.v} className="sr-only" />
                  <span>{w.l}</span>
                  <span className="text-[11px] font-bold opacity-70">×{w.v}</span>
                </label>
              ))}
            </div>
          </fieldset>

        </div>
      </details>
    </div>
  );
}

export const IMPORTANCE = [
  { v: 1, l: "Normal" },
  { v: 2, l: "High" },
  { v: 3, l: "Top" },
];

const times = (n: number) => (n === 1 ? "Once" : n === 2 ? "Twice" : `${n}×`);

/** "Any time · Twice a month" / "7:00 AM · Weekdays" */
export function scheduleLabel(t: Pick<Task, "any_time" | "time" | "per_week" | "per_month" | "days">): string {
  const often = t.per_week ? `${times(t.per_week)} a week` : t.per_month ? `${times(t.per_month)} a month` : daysLabel(t.days);
  return `${t.any_time ? "Any time" : formatTime(t.time)} · ${often}`;
}

export function daysLabel(days: string): string {
  if (days.length === 7) return "Every day";
  if (days === "12345") return "Weekdays";
  if (days === "06") return "Weekends";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return DAYS.filter((d) => days.includes(d.v)).map((d) => names[Number(d.v)]).join(", ");
}
