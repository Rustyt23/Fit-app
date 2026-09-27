// Adding one routine item for several people at once, copying an item to others, and removing several at once.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { addMember, setNow, useTempDb } from "./helpers";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/auth", async (real) => ({
  ...(await real<typeof import("@/lib/auth")>()),
  requireAdmin: async () => ({ id: 1, name: "Papa", is_admin: 1 }),
}));

let actions: typeof import("@/app/actions");
let db: typeof import("@/lib/db");
let P: number, M: number, N: number, V: number;

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) fd.append(k, one);
  return fd;
}

const protein = {
  kind: "supplement",
  title: "Protein shake",
  details: "1 scoop",
  time_mode: "set",
  time: "08:00",
  days_mode: "days",
  days: ["0", "1", "2", "3", "4", "5", "6"],
  weight: "1",
  coins: "5",
};

const titlesOf = async (member: number) =>
  (await db.all<{ title: string }>("SELECT title FROM tasks WHERE member_id = ? ORDER BY id", member)).map((r) => r.title);

beforeAll(async () => {
  useTempDb();
  setNow("2026-09-27", "09:00");
  actions = await import("@/app/actions");
  db = await import("@/lib/db");
  P = await addMember("Papa", { admin: true });
  M = await addMember("Mom");
  N = await addMember("Neha");
  V = await addMember("Vicky");
});

describe("one item for several people", () => {
  it("gives each picked person their own copy with the same settings", async () => {
    const res = await actions.saveTask(undefined, form({ ...protein, pick_members: "1", member_ids: [String(M), String(N), String(V)] }));
    expect(res?.error).toBeUndefined();
    expect(res?.message).toBe('Added "Protein shake" for Mom, Neha and Vicky.');
    const rows = await db.all<{ member_id: number; time: string; coins: number; details: string; start_date: string }>(
      "SELECT member_id, time, coins, details, start_date FROM tasks ORDER BY member_id",
    );
    expect(rows.map((r) => r.member_id)).toEqual([M, N, V]);
    for (const r of rows) expect(r).toMatchObject({ time: "08:00", coins: 5, details: "1 scoop", start_date: "2026-09-27" });
    expect(await titlesOf(P)).toEqual([]);
  });

  it("skips people who already have it and says so", async () => {
    const res = await actions.saveTask(undefined, form({ ...protein, pick_members: "1", member_ids: [String(P), String(M)] }));
    expect(res?.message).toBe('Added "Protein shake" to Papa\'s routine. Mom already has it.');
    expect(await titlesOf(M)).toEqual(["Protein shake"]);

    const again = await actions.saveTask(undefined, form({ ...protein, title: "protein SHAKE", pick_members: "1", member_ids: [String(M), String(N)] }));
    expect(again?.error).toBe('Mom and Neha already have "protein SHAKE".');
  });

  it("needs at least one person", async () => {
    const res = await actions.saveTask(undefined, form({ ...protein, title: "Omega-3", pick_members: "1" }));
    expect(res?.error).toBe("Pick at least one person.");
  });

  it("still works for one person from their own page", async () => {
    const res = await actions.saveTask(undefined, form({ ...protein, title: "Vitamin D3", member_id: String(N) }));
    expect(res?.message).toBe('Added "Vitamin D3" to Neha\'s routine.');
  });

  it("saves interval and specific-month-date schedules", async () => {
    await actions.saveTask(undefined, form({ ...protein, title: "Water plants", days_mode: "interval", repeat_every_days: "15", member_id: String(P) }));
    await actions.saveTask(
      undefined,
      form({ ...protein, title: "Check measurements", days_mode: "month_dates", month_days: ["16", "1"], member_id: String(P) }),
    );
    expect(await db.get("SELECT repeat_every_days, month_days FROM tasks WHERE title = 'Water plants'")).toEqual({
      repeat_every_days: 15,
      month_days: null,
    });
    expect(await db.get("SELECT repeat_every_days, month_days FROM tasks WHERE title = 'Check measurements'")).toEqual({
      repeat_every_days: null,
      month_days: "1,16",
    });
  });
});

describe("give an existing item to others", () => {
  it("copies it exactly, never to its owner", async () => {
    const added = await actions.saveTask(
      undefined,
      form({ kind: "other", custom_type: "Mind", custom_emoji: "🧘", title: "Meditation", time_mode: "any", days_mode: "monthly", per_month: "2", weight: "2", penalty: "3", member_id: String(V) }),
    );
    expect(added?.error).toBeUndefined();
    const id = (await db.get<{ id: number }>("SELECT id FROM tasks WHERE title = 'Meditation'"))!.id;

    const res = await actions.copyTask(undefined, form({ id: String(id), member_ids: [String(V), String(M)] }));
    expect(res?.message).toBe('Added "Meditation" to Mom\'s routine.');
    const copy = await db.get<Record<string, unknown>>("SELECT * FROM tasks WHERE title = 'Meditation' AND member_id = ?", M);
    expect(copy).toMatchObject({ kind: "other", custom_type: "Mind", custom_emoji: "🧘", any_time: 1, per_month: 2, weight: 2, penalty: 3 });
    expect((await db.all("SELECT 1 FROM tasks WHERE title = 'Meditation'")).length).toBe(2);
  });
});

describe("remove several items at once", () => {
  it("removes the ticked items, keeping history for ones already done", async () => {
    const ids = async (title: string) => (await db.all<{ id: number }>("SELECT id FROM tasks WHERE title = ? AND member_id = ?", title, N)).map((r) => r.id)[0];
    const [shake, d3] = [await ids("Protein shake"), await ids("Vitamin D3")];
    await db.run("INSERT INTO checkins (task_id, member_id, date, done_at, on_time) VALUES (?, ?, '2026-09-27', '08:00', 1)", shake, N);

    const res = await actions.removeTasks(undefined, form({ ids: [String(shake), String(d3)] }));
    expect(res?.message).toBe("Removed 2 items.");
    expect(await db.get("SELECT end_date FROM tasks WHERE id = ?", shake)).toEqual({ end_date: "2026-09-27" });
    expect(await db.get("SELECT 1 FROM tasks WHERE id = ?", d3)).toBeUndefined();
    expect(await db.get("SELECT 1 FROM checkins WHERE task_id = ?", shake)).toBeDefined();
    // Other people's copies are untouched.
    expect(await titlesOf(M)).toContain("Protein shake");
  });

  it("refuses items that are already gone, and an empty selection", async () => {
    const gone = (await db.get<{ id: number }>("SELECT id FROM tasks WHERE title = 'Protein shake' AND member_id = ?", N))!.id;
    const mom = (await db.get<{ id: number }>("SELECT id FROM tasks WHERE title = 'Protein shake' AND member_id = ?", M))!.id;
    expect((await actions.removeTasks(undefined, form({ ids: [String(gone), String(mom)] })))?.error).toMatch(/already removed/);
    expect(await db.get("SELECT end_date FROM tasks WHERE id = ?", mom)).toEqual({ end_date: null });
    expect((await actions.removeTasks(undefined, form({})))?.error).toBe("Tick the items you want to remove.");
  });
});
