// The family follow-up: what each person did and missed over the last days.
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, addTask, onBreak, setNow, setting, tick, useTempDb } from "./helpers";

let data: typeof import("@/lib/data");
let M: number, walk: number, pill: number, gym: number;

beforeAll(async () => {
  useTempDb();
  setNow("2026-09-27", "20:00"); // a Sunday
  data = await import("@/lib/data");
  M = await addMember("Maya");
  walk = await addTask(M, { start: "2026-09-01", anyTime: true });
  pill = await addTask(M, { kind: "medicine", start: "2026-09-01", time: "09:00" });
  gym = await addTask(M, { start: "2026-09-01", perWeek: 3, anyTime: true });
  await tick(walk, M, "2026-09-26");
  await tick(pill, M, "2026-09-26");
  await tick(walk, M, "2026-09-25", false);
  await tick(gym, M, "2026-09-25");
  await onBreak(M, "2026-09-23", "2026-09-23");
});

const activity = async () => data.recentActivity({ id: M, tracking_start: null }, 7);

describe("recent activity", () => {
  it("lists what was done and what was missed, newest first", async () => {
    const days = await activity();
    expect(days.map((d) => d.date)).toEqual(["2026-09-27", "2026-09-26", "2026-09-25", "2026-09-24", "2026-09-23", "2026-09-22", "2026-09-21"]);
    const [today, sat, fri] = days;
    // Today: nothing done yet, both fixed items still to do (the weekly one isn't listed as missed).
    expect(today.done).toEqual([]);
    expect(today.missed.map((x) => x.id).sort()).toEqual([walk, pill].sort());
    expect(sat.done.map((x) => x.id).sort()).toEqual([walk, pill].sort());
    expect(sat.missed).toEqual([]);
    expect(fri.done.map((x) => [x.id, x.on_time])).toEqual(expect.arrayContaining([[walk, 0], [gym, 1]]));
    expect(fri.missed.map((x) => x.id)).toEqual([pill]);
  });

  it("doesn't count break days or days before tracking starts as missed", async () => {
    const days = await activity();
    const wed = days.find((d) => d.date === "2026-09-23")!;
    expect(wed.away).toBe(true);
    expect(wed.missed).toEqual([]);
    await setting("tracking_start", "2026-09-25");
    const later = await activity();
    const thu = later.find((d) => d.date === "2026-09-24")!;
    expect(thu.notCounted).toBe(true);
    expect(thu.missed).toEqual([]);
    expect(later.find((d) => d.date === "2026-09-25")!.missed.map((x) => x.id)).toEqual([pill]);
  });
});
