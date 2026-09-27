import "server-only";
import { cache } from "react";
import { all, get } from "./db";
import { today } from "./dates";
import { DEFAULT_THEMES, isThemeSetting, type ThemeSetting } from "./themes";

// Score weights, coin amounts, limits and presets live in game.ts (safe in browser code too).
export * from "./game";
import { DEFAULT_RULES, MAX_COINS_PER_RULE, cleanRules, type GameRules } from "./game";

export type RuleVersion = { from: string; rules: GameRules };

export const ruleVersions = cache(async (): Promise<RuleVersion[]> =>
  (await all<{ effective_date: string; rules: string }>("SELECT effective_date, rules FROM game_rules ORDER BY effective_date")).map(
    (v) => ({ from: v.effective_date, rules: cleanRules(JSON.parse(v.rules)) }),
  ),
);

/** The rules in force on `date`: each change applies from its day onward. */
export function rulesAt(versions: RuleVersion[], date: string): GameRules {
  let rules = DEFAULT_RULES;
  for (const v of versions) {
    if (v.from > date) break;
    rules = v.rules;
  }
  return rules;
}

export async function currentRules(): Promise<GameRules> {
  return rulesAt(await ruleVersions(), today());
}

// ---------- Event prizes (admin-editable) ----------

export type EventKind = "week" | "month";
export type Prize = { coins: number; prize: string; secret: boolean };
export type EventPrizes = Record<EventKind, Prize[]>;

/** 1st, 2nd and 3rd place. A place with no coins and no prize has no winner. */
export const PLACES = 3;

export const DEFAULT_PRIZES: EventPrizes = {
  week: [
    { coins: 50, prize: "", secret: false },
    { coins: 30, prize: "", secret: false },
    { coins: 15, prize: "", secret: false },
  ],
  month: [
    { coins: 0, prize: "Gift package", secret: false },
    { coins: 0, prize: "Gift package", secret: false },
    { coins: 0, prize: "", secret: false },
  ],
};

export const hasPrize = (p: Prize | undefined) => !!p && (p.coins > 0 || p.prize.trim() !== "");

export function cleanPrizes(raw: unknown): EventPrizes {
  const src = (raw ?? {}) as Partial<Record<EventKind, Partial<Prize>[]>>;
  const one = (p: Partial<Prize> | undefined, fallback: Prize): Prize => ({
    coins: Number.isFinite(Number(p?.coins)) ? Math.min(MAX_COINS_PER_RULE * 10, Math.max(0, Math.round(Number(p!.coins)))) : fallback.coins,
    prize: typeof p?.prize === "string" ? p.prize.trim().slice(0, 80) : fallback.prize,
    secret: typeof p?.secret === "boolean" ? p.secret : fallback.secret,
  });
  return {
    week: DEFAULT_PRIZES.week.map((d, i) => one(src.week?.[i], d)),
    month: DEFAULT_PRIZES.month.map((d, i) => one(src.month?.[i], d)),
  };
}

export const eventPrizes = cache(async (): Promise<EventPrizes> => {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'event_prizes'");
  return cleanPrizes(row ? JSON.parse(row.value) : undefined);
});

// ---------- Event themes (admin-editable) ----------

export const eventThemes = cache(async (): Promise<Record<EventKind, ThemeSetting>> => {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'event_themes'");
  const raw = (row ? JSON.parse(row.value) : {}) as Partial<Record<EventKind, unknown>>;
  return {
    week: isThemeSetting(raw.week) ? raw.week : DEFAULT_THEMES.week,
    month: isThemeSetting(raw.month) ? raw.month : DEFAULT_THEMES.month,
  };
});
