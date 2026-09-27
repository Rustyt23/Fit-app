import { beforeAll, describe, expect, it } from "vitest";
import { addMember, addTask, setNow, useTempDb } from "./helpers";

let data: typeof import("@/lib/data");
let member: number;

beforeAll(async () => {
  useTempDb();
  setNow("2026-09-27", "12:00");
  data = await import("@/lib/data");
  member = await addMember("Meera");
});

const appearsOn = async (taskId: number, date: string) =>
  (await data.tasksForDay(member, date)).some((task) => task.id === taskId);

describe("calendar interval schedules", () => {
  it("repeats from the start date every 2, 7 or 15 days", async () => {
    const alternate = await addTask(member, { start: "2026-09-01", repeatEveryDays: 2 });
    const weekly = await addTask(member, { start: "2026-09-01", repeatEveryDays: 7 });
    const fortnightly = await addTask(member, { start: "2026-09-01", repeatEveryDays: 15 });

    await expect(appearsOn(alternate, "2026-09-01")).resolves.toBe(true);
    await expect(appearsOn(alternate, "2026-09-02")).resolves.toBe(false);
    await expect(appearsOn(alternate, "2026-09-03")).resolves.toBe(true);
    await expect(appearsOn(weekly, "2026-09-08")).resolves.toBe(true);
    await expect(appearsOn(weekly, "2026-09-09")).resolves.toBe(false);
    await expect(appearsOn(fortnightly, "2026-09-16")).resolves.toBe(true);
  });
});

describe("specific monthly dates", () => {
  it("supports several dates such as the 1st and 16th", async () => {
    const twice = await addTask(member, { start: "2026-09-10", monthDays: "1,16" });

    await expect(appearsOn(twice, "2026-09-01")).resolves.toBe(false); // before the routine started
    await expect(appearsOn(twice, "2026-09-16")).resolves.toBe(true);
    await expect(appearsOn(twice, "2026-10-01")).resolves.toBe(true);
    await expect(appearsOn(twice, "2026-10-02")).resolves.toBe(false);
  });
});
