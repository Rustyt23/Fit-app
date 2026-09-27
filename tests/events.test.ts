// Weekly events close automatically at 10 AM the next morning, after the "forgot to tick" window.
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, addTask, setNow, setting, tick, useTempDb } from "./helpers";

let stats: typeof import("@/lib/stats");
let all: typeof import("@/lib/db").all;
let A: number, B: number, walkB: number, walkA: number;
const WEEK = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];

beforeAll(async () => {
  useTempDb();
  stats = await import("@/lib/stats");
  all = (await import("@/lib/db")).all;
  A = await addMember("Asha");
  B = await addMember("Bharat");
  walkA = await addTask(A, { start: "2026-09-21" });
  walkB = await addTask(B, { start: "2026-09-21" });
  // Both did Monday to Saturday. Nobody has ticked Sunday yet.
  for (const d of WEEK) {
    await tick(walkA, A, d);
    await tick(walkB, B, d);
  }
  await setting("weekly_events_from", "2026-09-21");
  await setting("event_themes", { week: "all", month: "all" });
});

const results = () => all<{ member_id: number; place: number; prize_coins: number }>("SELECT * FROM event_results WHERE event = 'week' ORDER BY place");

describe("weekly event closing", () => {
  it("is still open on Monday before 10 AM", async () => {
    setNow("2026-09-28", "09:30");
    await stats.finalizeEvents();
    expect(await results()).toEqual([]);
  });

  it("counts Sunday's items ticked on Monday morning", async () => {
    await tick(walkB, B, "2026-09-27", false); // Bharat remembers at 9:30
    setNow("2026-09-28", "10:05");
    await stats.finalizeEvents();
    const r = await results();
    expect(r.map((x) => [x.member_id, x.place, x.prize_coins])).toEqual([
      [B, 1, 50],
      [A, 2, 30],
    ]);
    const [period] = await all<{ theme: string }>("SELECT theme FROM event_periods WHERE event = 'week' AND period = '2026-09-21'");
    expect(period.theme).toBe("all");
  });

  it("adds prize coins to the winner's balance", async () => {
    expect((await stats.achievementsFor(B)).prizeCoins).toBe(50);
    expect((await stats.achievementsFor(A)).prizeCoins).toBe(30);
  });

  it("locks the result: later changes and repeat runs don't reshuffle it", async () => {
    await tick(walkA, A, "2026-09-27");
    await stats.finalizeEvents();
    await stats.finalizeEvents();
    expect((await results()).map((x) => [x.member_id, x.place])).toEqual([
      [B, 1],
      [A, 2],
    ]);
  });

  it("doesn't close the month until it's over", async () => {
    expect(await all("SELECT * FROM event_periods WHERE event = 'month'")).toEqual([]);
  });
});
