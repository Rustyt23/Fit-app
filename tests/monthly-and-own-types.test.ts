// "N times a month" items, and the family's own item types.
import { beforeAll, describe, expect, it } from "vitest";
import { COIN_PRESETS, DEFAULT_RULES, cleanRules, matchPreset } from "@/lib/game";
import { kindEmoji } from "@/lib/kinds";
import { addMember, addTask, rulesFrom, setNow, tick, useTempDb } from "./helpers";

let stats: typeof import("@/lib/stats");
let data: typeof import("@/lib/data");
let M: number, N: number, O: number, checkup: number, late: number;

beforeAll(async () => {
  useTempDb();
  setNow("2026-09-20", "20:00");
  stats = await import("@/lib/stats");
  data = await import("@/lib/data");

  // Maya: blood-sugar check twice a month from August, −10 per missed check. Did it once in August.
  M = await addMember("Maya");
  checkup = await addTask(M, { kind: "other", customType: "Check-up", perMonth: 2, anyTime: true, penalty: 10, start: "2026-08-01" });
  await tick(checkup, M, "2026-08-12");
  await tick(checkup, M, "2026-09-03");

  // Neel: twice a month, but only added on 16 Sept (15 of 30 days left).
  N = await addMember("Neel");
  late = await addTask(N, { perMonth: 2, anyTime: true, start: "2026-09-16" });

  // Om: meditation (own type) + exercise, own-type weight 3 and 7 coins on time.
  O = await addMember("Om");
  const meditate = await addTask(O, { kind: "other", customType: "Mind", anyTime: true, start: "2026-09-20" });
  await addTask(O, { start: "2026-09-20" });
  await rulesFrom("2026-09-20", { weight_other: 3, other_on_time: 7 });
  await tick(meditate, O, "2026-09-20");
});

const day = async (member: number, date: string) => (await stats.history()).byMember.get(member)!.find((d) => d.date === date)!;

describe("N times a month", () => {
  it("puts what's missing on the month's last day, with the penalty", async () => {
    expect(await day(M, "2026-08-31")).toMatchObject({ scheduled: 1, done: 0, penalty: 10 });
    expect(await day(M, "2026-08-12")).toMatchObject({ scheduled: 1, done: 1 });
  });

  it("doesn't judge the current month before it ends", async () => {
    expect((await stats.achievementsFor(M)).coinsPenalty).toBe(10); // August only
  });

  it("shows progress until the month's target is met, then hides", async () => {
    const item = (await data.tasksForDay(M, "2026-09-20")).find((t) => t.id === checkup)!;
    expect([item.quotaDone, item.quotaTarget]).toEqual([1, 2]);
    await tick(checkup, M, "2026-09-10");
    expect((await data.tasksForDay(M, "2026-09-20")).find((t) => t.id === checkup)).toBeUndefined();
  });

  it("scales the target down for a partial month (from 16 Sept: 2 → 1)", async () => {
    expect(data.quotaTarget(2, 15, 30)).toBe(1);
    const item = (await data.tasksForDay(N, "2026-09-20")).find((t) => t.id === late)!;
    expect(item.quotaTarget).toBe(1);
  });
});

describe("own types", () => {
  it("use their own weight in the score: meditation (×3) done, exercise (×1) not → 75%", async () => {
    expect(stats.dayPct(await day(O, "2026-09-20"))).toBe(75);
  });

  it("earn their own coins", async () => {
    expect((await day(O, "2026-09-20")).coins).toBe(7);
  });

  it("show their own emoji", () => {
    expect(kindEmoji("other", "🧘")).toBe("🧘");
    expect(kindEmoji("other", null)).toBe("✨");
    expect(kindEmoji("medicine")).toBe("💊");
  });

  it("don't change which coin preset older saved rules match", () => {
    const generous = COIN_PRESETS.find((p) => p.id === "generous")!.coins;
    const { other_on_time, other_late, ...savedBefore } = { ...DEFAULT_RULES, ...generous };
    void other_on_time;
    void other_late;
    expect(matchPreset(cleanRules(savedBefore))).toBe("generous");
  });
});
