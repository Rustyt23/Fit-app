import { describe, expect, it } from "vitest";
import { LATE_TICK_UNTIL, canTick, lastFinalDay } from "@/lib/tick-window";
import { ROTATION, resolveTheme } from "@/lib/themes";
import { BADGE_TEXT, DICTIONARIES, translator } from "@/lib/i18n";
import { BADGES } from "@/lib/stats";
import { cleanPrizes, cleanRules, DEFAULT_RULES, MAX_WEIGHT } from "@/lib/rules";

describe("forgot-to-tick window", () => {
  it("allows today at any time", () => {
    expect(canTick("2026-09-28", "2026-09-28", "23:59")).toBe(true);
  });
  it(`allows yesterday only before ${LATE_TICK_UNTIL}`, () => {
    expect(canTick("2026-09-27", "2026-09-28", "09:59")).toBe(true);
    expect(canTick("2026-09-27", "2026-09-28", "10:00")).toBe(false);
  });
  it("never allows older days or future days", () => {
    expect(canTick("2026-09-26", "2026-09-28", "06:00")).toBe(false);
    expect(canTick("2026-09-29", "2026-09-28", "06:00")).toBe(false);
  });
  it("keeps yesterday open until 10 AM before closing events", () => {
    expect(lastFinalDay("2026-09-28", "09:30")).toBe("2026-09-26");
    expect(lastFinalDay("2026-09-28", "10:00")).toBe("2026-09-27");
  });
});

describe("event themes", () => {
  it("rotates to a different theme each week, fixed by the week's start", () => {
    const weeks = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].map((w) => resolveTheme("rotate", "week", w));
    expect(new Set(weeks).size).toBe(ROTATION.length);
    expect(resolveTheme("rotate", "week", "2026-09-21")).toBe(resolveTheme("rotate", "week", "2026-09-21"));
  });
  it("uses a fixed theme when one is chosen", () => {
    expect(resolveTheme("exercise", "month", "2026-09-01")).toBe("exercise");
  });
});

describe("admin rules are kept in range", () => {
  it("clamps weights and coins, and ignores unknown keys", () => {
    const r = cleanRules({ weight_exercise: 99, weight_medicine: 0, exercise_on_time: -5, hacker: 1 });
    expect(r.weight_exercise).toBe(MAX_WEIGHT);
    expect(r.weight_medicine).toBe(1);
    expect(r.exercise_on_time).toBe(0);
    expect(r.badge).toBe(DEFAULT_RULES.badge);
    expect("hacker" in r).toBe(false);
  });
  it("fills in missing prize places and trims text", () => {
    const p = cleanPrizes({ week: [{ coins: 10, prize: "  Movie  ", secret: true }] });
    expect(p.week[0]).toEqual({ coins: 10, prize: "Movie", secret: true });
    expect(p.week).toHaveLength(3);
    expect(p.month[0].prize).toBe("Gift package");
  });
});

describe("Hindi and English text", () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it("has every phrase in both languages", () => {
    expect(Object.keys(DICTIONARIES.hi).sort()).toEqual(Object.keys(DICTIONARIES.en).sort());
  });
  it("uses the same {placeholders} in both languages", () => {
    for (const key of Object.keys(DICTIONARIES.en) as (keyof typeof DICTIONARIES.en)[]) {
      expect(placeholders(DICTIONARIES.hi[key]), key).toEqual(placeholders(DICTIONARIES.en[key]));
    }
  });
  it("has a name for every badge in both languages", () => {
    for (const b of BADGES) {
      expect(BADGE_TEXT.en[b.id]?.name).toBeTruthy();
      expect(BADGE_TEXT.hi[b.id]?.name).toBeTruthy();
    }
  });
  it("fills in values", () => {
    expect(translator("hi")("today.progress", { done: 2, total: 5 })).toBe("5 में से 2 पूरे");
    expect(translator("xx")("nav.today")).toBe("Today");
  });
});
