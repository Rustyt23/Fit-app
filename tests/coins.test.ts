// Coin balance: task coins + bonuses, with admin rule changes applying from their date only.
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, addTask, rulesFrom, setNow, tick, useTempDb } from "./helpers";

let stats: typeof import("@/lib/stats");
let run: typeof import("@/lib/db").run;
let me: number;

beforeAll(async () => {
  useTempDb();
  setNow("2026-09-24", "20:00");
  stats = await import("@/lib/stats");
  run = (await import("@/lib/db")).run;
  me = await addMember("Solo");
  const walk = await addTask(me, { start: "2026-09-22" });
  await tick(walk, me, "2026-09-22");
  await tick(walk, me, "2026-09-23");
  // From Wednesday the admin pays more for exercise and Perfect Days.
  await rulesFrom("2026-09-23", { exercise_on_time: 5, perfect_day: 50 });
});

describe("coins", () => {
  it("adds up tasks and bonuses at the rate in force each day", async () => {
    const a = await stats.achievementsFor(me);
    // Tue: 2 (task) + 5 (Perfect Day) + 5 (Star of the Day) + 20 (First Step badge)
    // Wed: 5 (task) + 50 (Perfect Day) + 5 (Star of the Day)
    expect(a.coinsEarned).toBe(92);
    expect(a.coins).toBe(92);
  });

  it("takes coins for a reward request, and gives them back if declined", async () => {
    await run("INSERT INTO rewards (id, emoji, title, cost) VALUES (1, '🎬', 'Movie', 30)");
    await run("INSERT INTO redemptions (id, member_id, reward_id, emoji, title, cost) VALUES (1, ?, 1, '🎬', 'Movie', 30)", me);
    expect((await stats.achievementsFor(me)).coins).toBe(62);
    await run("UPDATE redemptions SET status = 'declined' WHERE id = 1");
    expect((await stats.achievementsFor(me)).coins).toBe(92);
  });
});
