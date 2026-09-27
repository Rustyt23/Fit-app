// Game rules shared by server and browser code (no database access here):
// score weights, coin amounts, limits and the coin presets.
import type { Kind } from "./kinds";

export type GameRules = {
  /** How much one item of each type counts towards the daily score. */
  weight_exercise: number;
  weight_supplement: number;
  weight_medicine: number;
  weight_other: number;
  exercise_on_time: number;
  exercise_late: number;
  supplement_on_time: number;
  supplement_late: number;
  medicine_on_time: number;
  medicine_late: number;
  other_on_time: number;
  other_late: number;
  /** Bonus coins for each badge (repeatable ones every time they're earned). */
  perfect_day: number;
  star_of_day: number;
  perfect_week: number;
  badge_first_step: number;
  badge_streak_3: number;
  badge_streak_7: number;
  badge_streak_30: number;
  badge_early_bird: number;
  badge_perfect_pill: number;
  badge_century: number;
  badge_champion: number;
};

export type BadgeId =
  | "first_step" | "perfect_day" | "streak_3" | "streak_7" | "streak_30" | "early_bird"
  | "perfect_pill" | "century" | "star_of_day" | "perfect_week" | "champion";

/** The coin rule that pays for a badge. */
export function bonusKey(badge: BadgeId): keyof GameRules {
  return badge === "perfect_day" || badge === "star_of_day" || badge === "perfect_week" ? badge : `badge_${badge}`;
}

const badgeCoins = (n: number) => ({
  badge_first_step: n,
  badge_streak_3: n,
  badge_streak_7: n,
  badge_streak_30: n,
  badge_early_bird: n,
  badge_perfect_pill: n,
  badge_century: n,
  badge_champion: n,
});

export const DEFAULT_RULES: GameRules = {
  weight_exercise: 1,
  weight_supplement: 1,
  weight_medicine: 1,
  weight_other: 1,
  exercise_on_time: 2,
  exercise_late: 1,
  supplement_on_time: 2,
  supplement_late: 1,
  medicine_on_time: 2,
  medicine_late: 1,
  other_on_time: 2,
  other_late: 1,
  perfect_day: 5,
  star_of_day: 5,
  perfect_week: 10,
  ...badgeCoins(20),
};

export const MAX_COINS_PER_RULE = 500;
export const MAX_WEIGHT = 10;

/** Every badge's coin bonus, in the order they're shown (names come from BADGE_TEXT). */
export const COIN_BONUSES: { badge: BadgeId; key: keyof GameRules; emoji: string }[] = (
  [
    ["perfect_day", "💯"],
    ["star_of_day", "⭐"],
    ["perfect_week", "🌟"],
    ["first_step", "🌱"],
    ["streak_3", "🔥"],
    ["streak_7", "⚡"],
    ["streak_30", "🏔️"],
    ["early_bird", "🌅"],
    ["perfect_pill", "💊"],
    ["century", "🎯"],
    ["champion", "👑"],
  ] as const
).map(([badge, emoji]) => ({ badge, key: bonusKey(badge), emoji }));

export const weightKey = (kind: Kind) => `weight_${kind}` as const;
export const coinKey = (kind: Kind, onTime: boolean) => `${kind}_${onTime ? "on_time" : "late"}` as const;
export const isWeightKey = (k: string) => k.startsWith("weight_");

/** Keeps only known keys with whole numbers in range; anything missing falls back to the default. */
export function cleanRules(raw: Partial<Record<string, unknown>>): GameRules {
  const out = { ...DEFAULT_RULES };
  for (const key of Object.keys(out) as (keyof GameRules)[]) {
    const v = Number(raw[key]);
    if (!Number.isFinite(v)) continue;
    out[key] = isWeightKey(key)
      ? Math.min(MAX_WEIGHT, Math.max(1, Math.round(v)))
      : Math.min(MAX_COINS_PER_RULE, Math.max(0, Math.round(v)));
  }
  // Rules saved before "Your own" types existed: pay them like exercise (keeps presets matching).
  if (raw.other_on_time === undefined) out.other_on_time = out.exercise_on_time;
  if (raw.other_late === undefined) out.other_late = out.exercise_late;
  // Rules saved when one amount ("badge") paid for every other badge: each badge starts from it.
  const legacy = Number(raw.badge);
  if (Number.isFinite(legacy)) {
    for (const key of Object.keys(badgeCoins(0)) as (keyof GameRules)[]) {
      if (raw[key] === undefined) out[key] = Math.min(MAX_COINS_PER_RULE, Math.max(0, Math.round(legacy)));
    }
  }
  return out;
}

/** Coin keys (everything except the score weights). */
export const COIN_KEYS = (Object.keys(DEFAULT_RULES) as (keyof GameRules)[]).filter((k) => !isWeightKey(k));

export type CoinPreset = { id: "normal" | "generous" | "strict"; emoji: string; label: string; how: string; coins: Partial<GameRules> };

/** Simple choices for admins who don't want to tune every number. */
export const COIN_PRESETS: CoinPreset[] = [
  {
    id: "normal",
    emoji: "🙂",
    label: "Normal",
    how: "2 coins on time, 1 late. Perfect Day 5, Star of the Day 5, Perfect Week 10, other badges 20.",
    coins: {
      exercise_on_time: 2, exercise_late: 1, supplement_on_time: 2, supplement_late: 1, medicine_on_time: 2, medicine_late: 1,
      other_on_time: 2, other_late: 1,
      perfect_day: 5, star_of_day: 5, perfect_week: 10, ...badgeCoins(20),
    },
  },
  {
    id: "generous",
    emoji: "🤑",
    label: "Generous",
    how: "5 on time, 3 late. Big bonuses: 10 / 10 / 25, other badges 50.",
    coins: {
      exercise_on_time: 5, exercise_late: 3, supplement_on_time: 5, supplement_late: 3, medicine_on_time: 5, medicine_late: 3,
      other_on_time: 5, other_late: 3,
      perfect_day: 10, star_of_day: 10, perfect_week: 25, ...badgeCoins(50),
    },
  },
  {
    id: "strict",
    emoji: "⏱️",
    label: "Strict",
    how: "2 on time, nothing if late. Perfect Day 5, Star of the Day 5, Perfect Week 10, other badges 20.",
    coins: {
      exercise_on_time: 2, exercise_late: 0, supplement_on_time: 2, supplement_late: 0, medicine_on_time: 2, medicine_late: 0,
      other_on_time: 2, other_late: 0,
      perfect_day: 5, star_of_day: 5, perfect_week: 10, ...badgeCoins(20),
    },
  },
];

/** Which preset the current coin amounts match, or "custom". */
export function matchPreset(rules: GameRules): CoinPreset["id"] | "custom" {
  return COIN_PRESETS.find((p) => COIN_KEYS.every((k) => p.coins[k] === rules[k]))?.id ?? "custom";
}
