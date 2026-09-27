// The "96% with everything ticked" case: on a week's last day, a "3 times a week" item done only
// twice shows as ticked, but one session is still missing. Today must say so, and agree with the score.
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, addTask, setNow, tick, useTempDb } from "./helpers";

let data: typeof import("@/lib/data");
let stats: typeof import("@/lib/stats");
let M: number, walk: number, gym: number;

beforeAll(async () => {
  useTempDb();
  setNow("2026-09-27", "20:00"); // Sunday, last day of the week
  data = await import("@/lib/data");
  stats = await import("@/lib/stats");
  M = await addMember("Maya");
  walk = await addTask(M, { start: "2026-09-14", anyTime: true });
  gym = await addTask(M, { start: "2026-09-14", perWeek: 3, anyTime: true });
  await tick(gym, M, "2026-09-23"); // once during the week
  await tick(walk, M, "2026-09-27");
  await tick(gym, M, "2026-09-27"); // and again today: 2 of 3
});

describe("weekly shortfall on the last day", () => {
  it("every row is ticked, but the missing session is shown and the day isn't 100%", async () => {
    const items = await data.tasksForDay(M, "2026-09-27");
    expect(items.every((i) => i.checkin)).toBe(true);
    const g = items.find((i) => i.id === gym)!;
    expect(g.shortfall).toBe(1);
    expect(items.find((i) => i.id === walk)!.shortfall).toBe(0);

    const today = (await stats.history()).byMember.get(M)!.at(-1)!;
    // Scored today: walk and today's gym session done, plus the 1 missing session → 2 of 3.
    // (Wednesday's session counts on Wednesday.)
    expect([today.done, today.scheduled]).toEqual([2, 3]);
    expect(Math.round(stats.dayPct(today)!)).toBe(67);
    // Today's rows plus shortfalls add up to exactly what's scored.
    expect(items.length + items.reduce((n, i) => n + i.shortfall, 0)).toBe(today.scheduled);
  });

  it("isn't flagged on other days of the week", async () => {
    const items = await data.tasksForDay(M, "2026-09-26");
    expect(items.every((i) => i.shortfall === 0)).toBe(true);
  });
});
