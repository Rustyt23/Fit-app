// Scores, weights, breaks, streaks and themes, against a real (temporary) database.
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, addTask, rulesFrom, setNow, tick, useTempDb } from "./helpers";

let stats: typeof import("@/lib/stats");
let run: typeof import("@/lib/db").run;
let A: number, B: number, exercise: number, supplement: number;

beforeAll(async () => {
  useTempDb();
  setNow("2026-09-24", "20:00"); // a Thursday evening
  stats = await import("@/lib/stats");
  run = (await import("@/lib/db")).run;

  A = await addMember("Asha");
  exercise = await addTask(A, { kind: "exercise", weight: 2, start: "2026-09-21" }); // "high importance"
  supplement = await addTask(A, { kind: "supplement", time: "08:00", start: "2026-09-21" });
  await tick(exercise, A, "2026-09-21"); // only the exercise on Monday

  B = await addMember("Bharat");
  const walk = await addTask(B, { start: "2026-09-21" });
  await tick(walk, B, "2026-09-21");
  await tick(walk, B, "2026-09-23");
  // Bharat was ill on Tuesday.
  await run("INSERT INTO away_periods (member_id, start_date, end_date, reason) VALUES (?, '2026-09-22', '2026-09-22', 'sick')", B);
});

const scoreOf = (rows: import("@/lib/stats").Standing[], id: number) => rows.find((r) => r.member.id === id)?.score ?? null;

describe("daily score", () => {
  it("counts an important item more (exercise ×2 + supplement ×1: exercise alone = 2/3)", async () => {
    expect(scoreOf(await stats.standings("2026-09-21", "2026-09-21"), A)).toBeCloseTo(66.67, 1);
  });

  it("applies admin weight changes from their date only", async () => {
    await rulesFrom("2026-09-22", { weight_exercise: 3 });
    await tick(exercise, A, "2026-09-22");
    // Tuesday: (2×3) / (2×3 + 1) = 6/7. Monday keeps the old weights.
    expect(scoreOf(await stats.standings("2026-09-22", "2026-09-22"), A)).toBeCloseTo(85.71, 1);
    expect(scoreOf(await stats.standings("2026-09-21", "2026-09-21"), A)).toBeCloseTo(66.67, 1);
  });

  it("leaves break days out of the average", async () => {
    expect(scoreOf(await stats.standings("2026-09-21", "2026-09-23"), B)).toBe(100);
  });

  it("doesn't rank someone who was on a break the whole time", async () => {
    const row = (await stats.standings("2026-09-22", "2026-09-22")).find((r) => r.member.id === B)!;
    expect(row.score).toBeNull();
    expect(row.rank).toBe(0);
  });
});

describe("streaks", () => {
  it("skips break days and doesn't break on a day that isn't over yet", async () => {
    const { byMember } = await stats.history();
    // Mon done, Tue break (skipped), Wed done, Thu (today) not yet done.
    expect(stats.streakOf(byMember.get(B)!)).toEqual({ current: 2, best: 2 });
  });
});

describe("event themes", () => {
  it("exercise-only ignores missed supplements", async () => {
    const rows = await stats.themedStandings("exercise", "2026-09-21", "2026-09-21", "2026-09-14", "2026-09-20");
    expect(scoreOf(rows, A)).toBe(100);
  });

  it("punctuality scores the share done on time", async () => {
    await tick(supplement, A, "2026-09-23", false); // late
    await tick(exercise, A, "2026-09-23", true);
    const rows = await stats.themedStandings("on_time", "2026-09-23", "2026-09-23", "2026-09-22", "2026-09-22");
    expect(scoreOf(rows, A)).toBe(50);
  });

  it("most improved scores the rise from the period before", async () => {
    const rows = await stats.themedStandings("improved", "2026-09-22", "2026-09-22", "2026-09-21", "2026-09-21");
    expect(scoreOf(rows, A)).toBeCloseTo(85.71 - 66.67, 1);
    expect(scoreOf(rows, B)).toBeNull(); // on a break, nothing to compare
  });

  it("medicine theme leaves out people with no medicines", async () => {
    const rows = await stats.themedStandings("medicine", "2026-09-21", "2026-09-23", "2026-09-14", "2026-09-20");
    expect(rows.every((r) => r.rank === 0)).toBe(true);
  });
});
