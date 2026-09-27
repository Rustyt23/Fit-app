// Reports, help awards, bulk changes, start/end dates, the tracking start date and resets.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { addMember, addTask, setNow, tick, useTempDb } from "./helpers";

type Me = { id: number; name: string; is_admin: number; lang: string; tracking_start: null };
let me: Me;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/push", () => ({ sendToMember: async () => 0 }));
vi.mock("@/lib/auth", async (real) => ({
  ...(await real<typeof import("@/lib/auth")>()),
  requireAdmin: async () => me,
  requireMember: async () => me,
  endSession: async () => {},
}));

let actions: typeof import("@/app/actions");
let db: typeof import("@/lib/db");
let A: number, B: number, C: number;
const as = (id: number, name: string, admin = false): Me => ({ id, name, is_admin: admin ? 1 : 0, lang: "en", tracking_start: null });

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) fd.append(k, one);
  return fd;
}

/** Fresh numbers every time (history() is cached per request in the app, not in tests). */
async function coins(id: number) {
  vi.resetModules();
  const s = await import("@/lib/stats");
  return (await s.achievementsFor(id)).coins;
}

let walkA: number, walkB: number;

beforeAll(async () => {
  useTempDb();
  setNow("2026-09-27", "20:00");
  actions = await import("@/app/actions");
  db = await import("@/lib/db");
  A = await addMember("Asha", { admin: true });
  B = await addMember("Bala");
  C = await addMember("Chand");
  walkA = await addTask(A, { start: "2026-09-20", coins: 2, anyTime: true });
  walkB = await addTask(B, { start: "2026-09-20", coins: 2, anyTime: true });
  await db.run("UPDATE tasks SET title = 'Walk' WHERE id IN (?, ?)", walkA, walkB);
  for (const d of ["2026-09-25", "2026-09-26", "2026-09-27"]) {
    await tick(walkA, A, d);
    await tick(walkB, B, d);
  }
});

describe("reports", () => {
  it("can't report yourself, an unticked item, or the same tick twice", async () => {
    me = as(B, "Bala");
    expect((await actions.reportTick(undefined, form({ task_id: String(walkB), date: "2026-09-27" })))?.error).toMatch(/yourself/);
    expect((await actions.reportTick(undefined, form({ task_id: String(walkA), date: "2026-09-24" })))?.error).toMatch(/isn't ticked/);
    expect((await actions.reportTick(undefined, form({ task_id: String(walkA), date: "2026-09-20" })))?.error).toMatch(/last 3 days/);
    expect((await actions.reportTick(undefined, form({ task_id: String(walkA), date: "2026-09-27", reason: "Was on the sofa" })))?.message).toMatch(/Sent/);
    expect((await actions.reportTick(undefined, form({ task_id: String(walkA), date: "2026-09-27" })))?.error).toMatch(/already/);
  });

  it("an upheld report takes coins, rewards the reporter and can untick", async () => {
    const [before, reporterBefore] = [await coins(A), await coins(B)];
    const report = (await db.get<{ id: number }>("SELECT id FROM reports"))!;
    me = as(C, "Chand", true); // another admin decides (the report is about Asha, an admin)
    await db.run("UPDATE members SET is_admin = 1 WHERE id = ?", C);
    const res = await actions.resolveReport(undefined, form({ id: String(report.id), decision: "uphold", penalty: "5", reward: "2", untick: "on" }));
    expect(res?.message).toMatch(/unticked/);
    expect(await db.get("SELECT 1 FROM checkins WHERE task_id = ? AND date = '2026-09-27'", walkA)).toBeUndefined();
    // −5 by hand, and the unticked walk's coins (plus that day's bonuses) are gone too; Bala gets +2.
    vi.resetModules();
    const s = await import("@/lib/stats");
    const asha = await s.achievementsFor(A);
    expect(asha.coinsAdjusted).toBe(-5);
    expect(asha.coins).toBeLessThanOrEqual(before - 5 - 2);
    expect(await coins(B)).toBe(reporterBefore + 2);
    expect((await actions.resolveReport(undefined, form({ id: String(report.id), decision: "dismiss" })))?.error).toMatch(/Already handled/);
  });

  it("neither the person reported nor the reporter decides when another admin can", async () => {
    me = as(C, "Chand", true);
    await actions.reportTick(undefined, form({ task_id: String(walkA), date: "2026-09-26" }));
    const id = (await db.get<{ id: number }>("SELECT id FROM reports WHERE status = 'open'"))!.id;
    for (const who of [as(A, "Asha", true), as(C, "Chand", true)]) {
      me = who;
      expect((await actions.resolveReport(undefined, form({ id: String(id), decision: "dismiss" })))?.error).toMatch(/Another admin should decide/);
    }
    // A third admin can.
    const D = await addMember("Dev", { admin: true });
    me = as(D, "Dev", true);
    expect((await actions.resolveReport(undefined, form({ id: String(id), decision: "dismiss" })))?.message).toMatch(/Dismissed/);
  });
});

describe("help awards", () => {
  it("asks, then an admin gives coins", async () => {
    me = as(B, "Bala");
    expect((await actions.askHelpAward(undefined, form({ helped_id: String(B), note: "me" })))?.error).toMatch(/someone else/);
    expect((await actions.askHelpAward(undefined, form({ helped_id: String(A), note: "" })))?.error).toMatch(/what you did/);
    expect((await actions.askHelpAward(undefined, form({ helped_id: String(A), note: "Walked with her" })))?.message).toMatch(/Sent/);
    const before = await coins(B);
    const id = (await db.get<{ id: number }>("SELECT id FROM help_requests"))!.id;
    me = as(A, "Asha", true);
    expect((await actions.resolveHelp(undefined, form({ id: String(id), decision: "approve", coins: "10" })))?.message).toBe("Gave Bala 10 coins.");
    expect(await coins(B)).toBe(before + 10);
  });
});

describe("start and end dates", () => {
  it("saves a later start and a last day, and only shows it in between", async () => {
    me = as(A, "Asha", true);
    const res = await actions.saveTask(
      undefined,
      form({
        kind: "medicine", title: "Antibiotic", time_mode: "set", time: "08:00", days_mode: "days", days: ["0", "1", "2", "3", "4", "5", "6"],
        weight: "1", start_date: "2026-09-29", last_day: "2026-10-03", member_id: String(C),
      }),
    );
    expect(res?.error).toBeUndefined();
    const t = await db.get<import("@/lib/data").Task>("SELECT * FROM tasks WHERE title = 'Antibiotic'");
    expect([t!.start_date, t!.end_date]).toEqual(["2026-09-29", "2026-10-04"]);
    const { isScheduledOn } = await import("@/lib/data");
    expect(["2026-09-28", "2026-09-29", "2026-10-03", "2026-10-04"].map((d) => isScheduledOn(t!, d))).toEqual([false, true, true, false]);
  });

  it("refuses a last day before the start", async () => {
    const res = await actions.saveTask(
      undefined,
      form({ kind: "exercise", title: "Swim", time_mode: "any", days_mode: "days", days: ["1"], weight: "1", start_date: "2026-10-05", last_day: "2026-10-01", member_id: String(C) }),
    );
    expect(res?.error).toMatch(/before the day it starts/);
  });
});

describe("bulk changes", () => {
  it("changes an item for everyone picked who has it", async () => {
    me = as(A, "Asha", true);
    const res = await actions.bulkEditTasks(
      undefined,
      form({
        match_title: "walk", member_ids: [String(A), String(B)], kind: "exercise", title: "Walk", time_mode: "set", time: "07:30",
        days_mode: "days", days: ["0", "1", "2", "3", "4", "5", "6"], weight: "1", coins: "3",
      }),
    );
    expect(res?.message).toBe('Saved "Walk" for Asha and Bala.');
    const rows = await db.all<{ member_id: number; time: string; coins: number }>(
      "SELECT member_id, time, coins FROM tasks WHERE title = 'Walk' AND end_date IS NULL ORDER BY member_id",
    );
    expect(rows).toEqual([
      { member_id: A, time: "07:30", coins: 3 },
      { member_id: B, time: "07:30", coins: 3 },
    ]);
    // The old versions (with history) end today and today's ticks move across.
    expect((await db.all("SELECT 1 FROM tasks WHERE title = 'Walk' AND end_date = '2026-09-27'")).length).toBe(2);
  });

  it("removes ticked items from the picked people only", async () => {
    await addTask(C, { start: "2026-09-27" });
    await db.run("UPDATE tasks SET title = 'Walk' WHERE member_id = ? AND title = 'Task'", C);
    const res = await actions.bulkRemoveTasks(undefined, form({ member_ids: [String(B), String(C)], titles: ["Walk"] }));
    expect(res?.message).toBe("Removed 2 items from Bala and Chand.");
    const left = await db.all<{ member_id: number }>("SELECT member_id FROM tasks WHERE title = 'Walk' AND (end_date IS NULL OR end_date > '2026-09-27')");
    expect(left.map((r) => r.member_id)).toEqual([A]);
  });
});

describe("tracking start and resets", () => {
  it("ignores days before the tracking start, and nothing at all while it's in the future", async () => {
    me = as(A, "Asha", true);
    const all = await coins(B);
    expect(all).toBeGreaterThan(0);
    await actions.setTrackingStart(undefined, form({ date: "2026-09-30" }));
    vi.resetModules();
    const s = await import("@/lib/stats");
    const b = await s.achievementsFor(B);
    expect(b.coins).toBe(0);
    expect(b.badges).toEqual([]);
    await actions.setTrackingStart(undefined, form({ clear: "1" }));
    expect(await coins(B)).toBe(all);
  });

  it("resets one person (needs their name) and keeps their routine", async () => {
    expect((await actions.resetMember(undefined, form({ id: String(B), confirm: "nope" })))?.error).toMatch(/Type Bala/);
    const res = await actions.resetMember(undefined, form({ id: String(B), confirm: "bala" }));
    expect(res?.message).toMatch(/starts fresh/);
    expect(await coins(B)).toBe(0);
    expect(await db.get("SELECT 1 FROM checkins WHERE member_id = ?", B)).toBeUndefined();
    expect(await db.get("SELECT tracking_start FROM members WHERE id = ?", B)).toEqual({ tracking_start: "2026-09-27" });
    expect((await db.all("SELECT 1 FROM tasks WHERE member_id = ?", B)).length).toBeGreaterThan(0);
    expect(await coins(A)).toBeGreaterThan(0);
  });

  it("resets everyone's progress (needs RESET)", async () => {
    expect((await actions.resetProgress(undefined, form({ confirm: "reset" })))?.error).toMatch(/RESET/);
    expect((await actions.resetProgress(undefined, form({ confirm: "RESET" })))?.message).toMatch(/fresh/);
    for (const table of ["checkins", "coin_adjustments", "reports", "help_requests", "event_results"]) {
      expect((await db.all(`SELECT 1 FROM ${table}`)).length, table).toBe(0);
    }
    expect((await db.all("SELECT 1 FROM members")).length).toBe(4);
    expect(await db.get("SELECT value FROM settings WHERE key = 'tracking_start'")).toEqual({ value: "2026-09-27" });
  });

  it("factory reset (needs the family name) deletes everything but the secrets", async () => {
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('family_name', 'Test Family'), ('session_secret', 'x')");
    expect((await actions.factoryReset(undefined, form({ confirm: "wrong" })))?.error).toMatch(/Test Family/);
    await actions.factoryReset(undefined, form({ confirm: "test family" }));
    expect((await db.all("SELECT 1 FROM members")).length).toBe(0);
    expect((await db.all("SELECT 1 FROM tasks")).length).toBe(0);
    expect(await db.all("SELECT key FROM settings")).toEqual([{ key: "session_secret" }]);
  });
});
