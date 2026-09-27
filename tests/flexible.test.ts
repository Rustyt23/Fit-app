// "Any time" and "N times a week" items, per-item coins, and penalty coins.
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, addTask, onBreak, setNow, tick, useTempDb } from "./helpers";

let stats: typeof import("@/lib/stats");
let data: typeof import("@/lib/data");
let P: number, Q: number, R: number, S: number, weekly: number;

// The week under test: Mon 21 – Sun 27 Sept 2026.
beforeAll(async () => {
  useTempDb();
  setNow("2026-09-28", "10:05"); // Monday, just after the 10 AM window: Sunday is final
  stats = await import("@/lib/stats");
  data = await import("@/lib/data");

  // Priya: 3× a week, any time, 10 coins each, −5 per missed session.
  P = await addMember("Priya");
  weekly = await addTask(P, { perWeek: 3, anyTime: true, coins: 10, penalty: 5, start: "2026-09-21" });
  await tick(weekly, P, "2026-09-22");
  await tick(weekly, P, "2026-09-24");

  // Qasim: every day at 7, −4 if missed. Did Friday, missed Saturday and Sunday.
  Q = await addMember("Qasim");
  const q = await addTask(Q, { penalty: 4, start: "2026-09-25" });
  await tick(q, Q, "2026-09-25");

  // Rani: every day, −3 if missed, missed all three days but was ill on Saturday.
  R = await addMember("Rani");
  await addTask(R, { penalty: 3, start: "2026-09-25" });
  await onBreak(R, "2026-09-26", "2026-09-26");

  // Sunil: 3× a week, but only added on Thursday (4 days left), did it once.
  S = await addMember("Sunil");
  const s = await addTask(S, { perWeek: 3, penalty: 2, start: "2026-09-24" });
  await tick(s, S, "2026-09-25");
});

const day = async (member: number, date: string) => (await stats.history()).byMember.get(member)!.find((d) => d.date === date)!;

describe("N times a week", () => {
  it("counts only on days it's done, with no shortfall mid-week", async () => {
    expect(await day(P, "2026-09-22")).toMatchObject({ scheduled: 1, done: 1 });
    expect(stats.dayPct(await day(P, "2026-09-23"))).toBeNull(); // a rest day: doesn't count at all
  });

  it("puts what's still missing on Sunday, the day it falls due", async () => {
    expect(await day(P, "2026-09-27")).toMatchObject({ scheduled: 1, done: 0, penalty: 5 });
  });

  it("shows every day until the week's target is reached, then hides", async () => {
    const thu = (await data.tasksForDay(P, "2026-09-25")).find((t) => t.id === weekly)!;
    expect([thu.quotaDone, thu.quotaTarget]).toEqual([2, 3]);
    await tick(weekly, P, "2026-09-26");
    expect((await data.tasksForDay(P, "2026-09-27")).find((t) => t.id === weekly)).toBeUndefined();
    expect((await data.tasksForDay(P, "2026-09-26")).find((t) => t.id === weekly)?.checkin).toBeTruthy();
    expect(await day(P, "2026-09-27")).toMatchObject({ scheduled: 0, penalty: 0 }); // target met: nothing due
  });

  it("scales the target down for a partial week (added Thursday: 3 → 2)", async () => {
    expect(data.weekTarget(3, 4)).toBe(2);
    expect(await day(S, "2026-09-27")).toMatchObject({ scheduled: 1, done: 0, penalty: 2 });
  });
});

describe("per-item coins", () => {
  it("pays the item's own coins instead of the coin rules (3 × 10)", async () => {
    const coins = (await stats.history()).byMember.get(P)!.reduce((n, d) => n + d.coins, 0);
    expect(coins).toBe(30);
  });

  it("pays half for a late tick", () => {
    const rules = { exercise_on_time: 2, exercise_late: 1 } as Parameters<typeof stats.coinsForTask>[2];
    expect(stats.coinsForTask({ coins: 9, kind: "exercise" }, false, rules)).toBe(4);
    expect(stats.coinsForTask({ coins: null, kind: "exercise" }, false, rules)).toBe(1);
  });
});

describe("penalty coins", () => {
  it("takes coins for each missed day and shows them in the balance", async () => {
    const q = await stats.achievementsFor(Q);
    expect(q.coinsPenalty).toBe(8); // Saturday + Sunday
    expect(q.coins).toBe(q.coinsEarned - 8);
  });

  it("never charges on a break day", async () => {
    expect((await stats.achievementsFor(R)).coinsPenalty).toBe(6); // Friday + Sunday, not Saturday
  });

  it("waits until the 10 AM window has passed", async () => {
    setNow("2026-09-28", "09:30"); // Sunday could still be ticked
    expect((await stats.achievementsFor(Q)).coinsPenalty).toBe(4); // only Saturday so far
    setNow("2026-09-28", "10:05");
  });
});
