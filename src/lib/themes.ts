// Event themes: what a weekly/monthly event is judged on. Pure (safe anywhere).
import { parseDate } from "./dates";

export type Theme = "all" | "exercise" | "on_time" | "medicine" | "improved";
/** What the admin picks: a fixed theme, or a different one automatically each period. */
export type ThemeSetting = Theme | "rotate";

export const THEMES: Theme[] = ["all", "exercise", "on_time", "medicine", "improved"];
export const THEME_EMOJI: Record<Theme, string> = {
  all: "📋",
  exercise: "🏃",
  on_time: "⏰",
  medicine: "💊",
  improved: "📈",
};

/** Themes used when rotating. Medicine is left out because not everyone takes medicines. */
export const ROTATION: Theme[] = ["all", "exercise", "on_time", "improved"];

export const DEFAULT_THEMES: Record<"week" | "month", ThemeSetting> = { week: "rotate", month: "all" };

export function isThemeSetting(v: unknown): v is ThemeSetting {
  return v === "rotate" || THEMES.includes(v as Theme);
}

/** The theme a period is judged on. Rotation is fixed by the period's start date, so it never changes mid-event. */
export function resolveTheme(setting: ThemeSetting, kind: "week" | "month", periodStart: string): Theme {
  if (setting !== "rotate") return setting;
  const d = parseDate(periodStart);
  const index = kind === "week" ? Math.floor(d.getTime() / (7 * 86400_000)) : d.getUTCFullYear() * 12 + d.getUTCMonth();
  return ROTATION[((index % ROTATION.length) + ROTATION.length) % ROTATION.length];
}
