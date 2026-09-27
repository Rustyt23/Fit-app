import { describe, expect, it } from "vitest";
import { LATE_TICK_UNTIL, canTick, lastFinalDay } from "@/lib/tick-window";
import { ROTATION, resolveTheme } from "@/lib/themes";
import { BADGE_TEXT, DICTIONARIES, translator } from "@/lib/i18n";
import { ADMIN_DICTIONARIES, adminText } from "@/lib/i18n-admin";
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
    expect(r.badge_first_step).toBe(DEFAULT_RULES.badge_first_step);
    expect("hacker" in r).toBe(false);
  });
  it("gives every badge the old single 'other badges' amount from older saved rules", () => {
    const r = cleanRules({ badge: 35, perfect_day: 7 });
    expect([r.badge_first_step, r.badge_streak_7, r.badge_champion, r.perfect_day]).toEqual([35, 35, 35, 7]);
    expect(cleanRules({ badge: 35, badge_century: 3 }).badge_century).toBe(3);
  });
  it("fills in missing prize places and trims text", () => {
    const p = cleanPrizes({ week: [{ coins: 10, prize: "  Movie  ", secret: true }] });
    expect(p.week[0]).toEqual({ coins: 10, prize: "Movie", secret: true });
    expect(p.week).toHaveLength(3);
    expect(p.month[0].prize).toBe("Gift package");
  });
});

describe("admin screens in Hindi and English", () => {
  const placeholders = (x: string) => [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  it("has every admin phrase in both languages, with the same {placeholders}", () => {
    expect(Object.keys(ADMIN_DICTIONARIES.hi).sort()).toEqual(Object.keys(ADMIN_DICTIONARIES.en).sort());
    for (const k of Object.keys(ADMIN_DICTIONARIES.en) as (keyof typeof ADMIN_DICTIONARIES.en)[]) {
      expect(placeholders(ADMIN_DICTIONARIES.hi[k]), k).toEqual(placeholders(ADMIN_DICTIONARIES.en[k]));
    }
  });
  it("switches with the admin's language", () => {
    expect(adminText("hi")("admin.title")).toBe("एडमिन");
    expect(adminText("en")("x.addedFor", { title: "Walk", names: "Mom and Neha" })).toBe('Added "Walk" for Mom and Neha.');
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
