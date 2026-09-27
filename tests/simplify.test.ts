// Coin presets, quick-add templates and the weekly recap.
import { beforeAll, describe, expect, it } from "vitest";
import { COIN_KEYS, COIN_PRESETS, DEFAULT_RULES, MAX_COINS_PER_RULE, matchPreset } from "@/lib/game";
import { TEMPLATES } from "@/lib/templates";
import { KINDS } from "@/lib/kinds";
import { addMember, addTask, setNow, setting, tick, useTempDb } from "./helpers";

describe("coin presets", () => {
  it("each preset sets every coin amount, within limits", () => {
    for (const p of COIN_PRESETS) {
      for (const k of COIN_KEYS) {
        expect(p.coins[k], `${p.id}.${k}`).toBeTypeOf("number");
        expect(p.coins[k]!).toBeGreaterThanOrEqual(0);
        expect(p.coins[k]!).toBeLessThanOrEqual(MAX_COINS_PER_RULE);
      }
    }
  });
  it("recognises which preset the current amounts are", () => {
    expect(matchPreset(DEFAULT_RULES)).toBe("normal");
    expect(matchPreset({ ...DEFAULT_RULES, ...COIN_PRESETS.find((p) => p.id === "strict")!.coins })).toBe("strict");
    expect(matchPreset({ ...DEFAULT_RULES, exercise_on_time: 7 })).toBe("custom");
  });
  it("ignores score weights when matching", () => {
    expect(matchPreset({ ...DEFAULT_RULES, weight_exercise: 3 })).toBe("normal");
  });
});

describe("quick-add templates", () => {
  it("would all pass the same checks as the save form", () => {
    for (const t of TEMPLATES) {
      expect(KINDS.some((k) => k.value === t.kind), t.title).toBe(true);
      expect(t.title.length).toBeGreaterThan(0);
      if (t.any_time) expect(t.time).toBe("");
      else expect(t.time, t.title).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      if (t.per_week !== null) expect(t.per_week).toBeGreaterThanOrEqual(1);
      expect([1, 2, 3]).toContain(t.weight);
      expect(new Set(TEMPLATES.map((x) => x.title)).size).toBe(TEMPLATES.length);
    }
  });
});

describe("weekly recap", () => {
  let stats: typeof import("@/lib/stats");
  let me: number;

  beforeAll(async () => {
    useTempDb();
    setNow("2026-09-27", "20:00"); // Sunday evening
    stats = await import("@/lib/stats");
    await setting("event_themes", { week: "all", month: "all" });
    me = await addMember("Meera");
    const other = await addMember("Om");
    const walk = await addTask(me, { start: "2026-09-14" });
    const tablet = await addTask(me, { kind: "medicine", time: "09:00", start: "2026-09-14" });
    const omWalk = await addTask(other, { start: "2026-09-21" });
    // Week before: 1 of 2 each day (50%).
    for (const d of ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]) await tick(walk, me, d);
    // This week: Mon–Wed both (100%), Thu–Sun walk only (50%).
    for (const d of ["2026-09-21", "2026-09-22", "2026-09-23"]) {
      await tick(walk, me, d);
      await tick(tablet, me, d);
    }
    for (const d of ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]) await tick(walk, me, d);
    for (const d of ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]) await tick(omWalk, other, d);
  });

  it("sums up the week", async () => {
    const r = await stats.weekRecap(me, "2026-09-21", "2026-09-27");
    // (3 × 100% + 4 × 50%) / 7 days
    expect(r.score).toBeCloseTo(71.43, 1);
    expect(r.prevScore).toBe(50);
    expect([r.done, r.scheduled]).toEqual([10, 14]);
    expect(r.perfectDays).toBe(3);
    expect(r.bestDay).toEqual({ date: "2026-09-21", pct: 100 });
    // 10 on-time ticks × 2 coins (the coin rules), no penalties.
    expect(r.coins).toBe(20);
    expect(r.eventRank).toBe(2); // Om did 100% every day
    expect(r.eventTheme).toBe("all");
  });
});
