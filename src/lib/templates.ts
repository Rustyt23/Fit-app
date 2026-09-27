// Ready-made routine items for one-tap adding. Pure data (used in the browser).
import type { Task } from "./data";

export type TaskValues = Pick<
  Task,
  "kind" | "title" | "details" | "time" | "days" | "weight" | "any_time" | "per_week" | "per_month" | "repeat_every_days" | "month_days" | "custom_type" | "custom_emoji" | "coins" | "penalty"
>;

const base = {
  days: "0123456",
  weight: 1,
  any_time: 0,
  per_week: null,
  per_month: null,
  repeat_every_days: null,
  month_days: null,
  custom_type: null,
  custom_emoji: null,
  // New items earn 2 coins when done and lose 1 when missed, unless changed.
  coins: 2,
  penalty: 1,
} as const;

export const BLANK_TASK: TaskValues = { ...base, kind: "exercise", title: "", details: "", time: "", any_time: 1 };

export const TEMPLATES: (TaskValues & { emoji: string })[] = [
  { ...base, emoji: "🚶", kind: "exercise", title: "Morning walk", details: "30 minutes", time: "07:00" },
  { ...base, emoji: "🧘", kind: "exercise", title: "Yoga", details: "20 minutes", time: "06:30" },
  { ...base, emoji: "🏋️", kind: "exercise", title: "Gym", details: "45 minutes", time: "", any_time: 1, per_week: 3 },
  { ...base, emoji: "🚴", kind: "exercise", title: "Cycling", details: "20 minutes", time: "", any_time: 1, per_week: 3 },
  { ...base, emoji: "🤸", kind: "exercise", title: "Stretching", details: "10 minutes", time: "21:30" },
  { ...base, emoji: "☀️", kind: "supplement", title: "Vitamin D3", details: "1 tablet after breakfast", time: "09:00" },
  { ...base, emoji: "🐟", kind: "supplement", title: "Omega-3", details: "1 capsule after lunch", time: "13:30" },
  { ...base, emoji: "🩺", kind: "medicine", title: "BP tablet", details: "1 tablet", time: "09:00", weight: 2 },
  { ...base, emoji: "🍬", kind: "medicine", title: "Sugar tablet", details: "After breakfast", time: "08:30", weight: 2 },
  { ...base, emoji: "🦋", kind: "medicine", title: "Thyroid tablet", details: "Empty stomach", time: "06:30", weight: 2 },
  { ...base, emoji: "🧘", kind: "other", custom_type: "Mind", custom_emoji: "🧘", title: "Meditation", details: "10 minutes", time: "", any_time: 1 },
  { ...base, emoji: "💧", kind: "other", custom_type: "Water", custom_emoji: "💧", title: "Drink 8 glasses of water", details: "", time: "", any_time: 1 },
  { ...base, emoji: "🩸", kind: "other", custom_type: "Check-up", custom_emoji: "🩸", title: "Check blood sugar", details: "Fasting", time: "07:00", per_month: 2 },
];
