import { addDays, formatTime } from "@/lib/dates";
import { MAX_COINS_PER_RULE } from "@/lib/game";
import { BLANK_TASK, type TaskValues } from "@/lib/templates";
import Coin from "./Coin";
import ScheduleFields from "./ScheduleFields";
import TypeFields, { type CustomType } from "./TypeFields";
import type { Task } from "@/lib/data";
import type { Lang } from "@/lib/i18n";
import { adminText } from "@/lib/i18n-admin";

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
  today,
  editing = !!id,
  lang = "en",
}: {
  memberId?: number;
  id?: number;
  /** An existing item also brings its start and end dates. */
  values?: TaskValues & Partial<Pick<Task, "start_date" | "end_date">>;
  /** Today's date (in the family's time zone), for the start/end date limits. */
  today: string;
  /** Editing existing items (the start date is fixed once they've started). */
  editing?: boolean;
  /** The family's own types already in use, offered as quick picks. */
  customTypes?: CustomType[];
  /** The admin's language. */
  lang?: Lang;
}) {
  const t = adminText(lang);
  const uid = id ? `t${id}` : "new";
  const extras = [
    values.details,
    values.weight > 1 && `×${values.weight}`,
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      {memberId && <input type="hidden" name="member_id" value={memberId} />}
      {id && <input type="hidden" name="id" value={id} />}

      <TypeFields uid={uid} kind={values.kind} customType={values.custom_type} customEmoji={values.custom_emoji} existing={customTypes} lang={lang} />

      <div>
        <label className="label" htmlFor={`${uid}-title`}>
          {t("tf.what")}
        </label>
        <input
          id={`${uid}-title`}
          name="title"
          className="field"
          placeholder={t("tf.whatPlaceholder")}
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
        repeatEveryDays={values.repeat_every_days}
        monthDays={values.month_days}
        today={today}
        startDate={values.start_date}
        lastDay={values.end_date ? addDays(values.end_date, -1) : null}
        editing={editing}
        lang={lang}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`${uid}-coins`}>
            {t("tf.coins")}
          </label>
          <span className="relative block">
            <input
              id={`${uid}-coins`}
              name="coins"
              type="number"
              min={0}
              max={MAX_COINS_PER_RULE}
              defaultValue={values.coins ?? ""}
              placeholder={t("tf.rules")}
              className="field pl-9 text-right font-black"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <Coin size={18} />
            </span>
          </span>
          <p className="mt-1 text-[11px] text-muted">{t("tf.coinsHint")}</p>
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-penalty`}>
            {t("tf.penalty")}
          </label>
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
          <p className="mt-1 text-[11px] text-muted">{t("tf.penaltyHint")}</p>
        </div>
      </div>

      <details className="group/more rounded-2xl border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
          <span className="text-muted">⚙️</span>
          <span className="flex-1">
            {t("tf.more")}
            <span className="block truncate text-xs font-semibold text-muted">
              {extras.length ? extras.join(" · ") : t("tf.moreHint")}
            </span>
          </span>
          <span className="text-muted transition-transform group-open/more:rotate-180">⌄</span>
        </summary>
        <div className="space-y-4 border-t border-line p-3">
          <div>
            <label className="label" htmlFor={`${uid}-details`}>
              {t("tf.details")}
            </label>
            <input
              id={`${uid}-details`}
              name="details"
              className="field"
              placeholder={t("tf.detailsPlaceholder")}
              defaultValue={values.details}
              maxLength={160}
            />
          </div>

          <fieldset>
            <legend className="label">{t("tf.importance")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {IMPORTANCE.map((w) => (
                <label key={w.v} className={`${chip} flex-col py-2 text-sm`}>
                  <input type="radio" name="weight" value={w.v} defaultChecked={values.weight === w.v} className="sr-only" />
                  <span>{t(w.key)}</span>
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
  { v: 1, key: "imp.normal" },
  { v: 2, key: "imp.high" },
  { v: 3, key: "imp.top" },
] as const;

/** "Normal" / "High" / "Top" for an item's importance, in the given language. */
export function importanceLabel(weight: number, lang: Lang = "en"): string {
  const w = IMPORTANCE.find((x) => x.v === weight);
  return w ? adminText(lang)(w.key) : "";
}

/** "Any time · Twice a month" / "7:00 AM · Weekdays" (or in Hindi). */
export function scheduleLabel(
  task: Pick<Task, "any_time" | "time" | "per_week" | "per_month" | "repeat_every_days" | "month_days" | "days">,
  lang: Lang = "en",
): string {
  const t = adminText(lang);
  const times = (n: number) => (n === 1 ? t("sched.once") : n === 2 ? t("sched.twice") : t("sched.times", { n }));
  const often = task.per_week
    ? t("sched.perWeek", { n: times(task.per_week) })
    : task.per_month
      ? t("sched.perMonth", { n: times(task.per_month) })
      : task.repeat_every_days
        ? intervalLabel(task.repeat_every_days, lang)
        : task.month_days
          ? t("sched.monthDays", { dates: monthDaysLabel(task.month_days, lang) })
          : daysLabel(task.days, lang);
  return `${task.any_time ? t("sched.anyTime") : formatTime(task.time)} · ${often}`;
}

export function intervalLabel(days: number, lang: Lang = "en"): string {
  const t = adminText(lang);
  if (days === 1) return t("sched.everyDay");
  if (days === 2) return t("sched.otherDay");
  if (days === 7) return t("sched.everyWeek");
  return t("sched.everyN", { n: days });
}

const ordinal = (day: number) => {
  const mod100 = day % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix}`;
};

export function monthDaysLabel(monthDays: string, lang: Lang = "en"): string {
  const labels = monthDays.split(",").filter(Boolean).map(Number).map((d) => (lang === "hi" ? String(d) : ordinal(d)));
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} & ${labels.at(-1)}` : (labels[0] ?? "");
}

export function daysLabel(days: string, lang: Lang = "en"): string {
  const t = adminText(lang);
  if (days.length === 7) return t("sched.everyDay");
  if (days === "12345") return t("sched.weekdays");
  if (days === "06") return t("sched.weekends");
  const names = t("sched.days").split(",");
  return DAYS.filter((d) => days.includes(d.v)).map((d) => names[Number(d.v)]).join(", ");
}
