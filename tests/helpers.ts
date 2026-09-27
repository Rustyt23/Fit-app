// Test helpers: a throwaway database per test file, and quick ways to add data.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";

/** Points the app at a new, empty database (call before the first query). */
export function useTempDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-fit-test-"));
  process.env.DB_PATH = path.join(dir, "test.db");
  (globalThis as { __familyDriver?: unknown }).__familyDriver = undefined;
  return process.env.DB_PATH;
}

/** A moment in India time, e.g. ist("2026-09-28", "10:05"). */
export const ist = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);

/** Freezes "now" (only the clock; timers and I/O keep working). */
export function setNow(date: string, hhmm: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(ist(date, hhmm));
}

async function db() {
  return import("@/lib/db");
}

export async function addMember(name: string, opts: { admin?: boolean } = {}): Promise<number> {
  const { run } = await db();
  return (await run("INSERT INTO members (name, pin_hash, is_admin, color) VALUES (?, 'x', ?, '#000')", name, opts.admin ? 1 : 0)).lastRowId;
}

export async function addTask(
  memberId: number,
  opts: {
    kind?: "exercise" | "supplement" | "medicine" | "other";
    time?: string;
    start: string;
    weight?: number;
    days?: string;
    anyTime?: boolean;
    perWeek?: number;
    perMonth?: number;
    customType?: string;
    coins?: number;
    penalty?: number;
  },
): Promise<number> {
  const { run } = await db();
  return (
    await run(
      `INSERT INTO tasks (member_id, kind, title, time, days, weight, any_time, per_week, per_month, custom_type, coins, penalty, start_date)
       VALUES (?, ?, 'Task', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      memberId, opts.kind ?? "exercise", opts.anyTime ? "" : (opts.time ?? "07:00"), opts.days ?? "0123456", opts.weight ?? 1,
      opts.anyTime ? 1 : 0, opts.perWeek ?? null, opts.perMonth ?? null, opts.customType ?? null, opts.coins ?? null, opts.penalty ?? 0, opts.start,
    )
  ).lastRowId;
}

export async function onBreak(memberId: number, from: string, to: string) {
  const { run } = await db();
  await run("INSERT INTO away_periods (member_id, start_date, end_date, reason) VALUES (?, ?, ?, 'sick')", memberId, from, to);
}

export async function tick(taskId: number, memberId: number, date: string, onTime = true) {
  const { run } = await db();
  await run("INSERT INTO checkins (task_id, member_id, date, done_at, on_time) VALUES (?, ?, ?, '07:00', ?)", taskId, memberId, date, onTime ? 1 : 0);
}

export async function setting(key: string, value: unknown) {
  const { run } = await db();
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, typeof value === "string" ? value : JSON.stringify(value));
}

export async function rulesFrom(date: string, rules: Record<string, number>) {
  const { run } = await db();
  await run("INSERT INTO game_rules (effective_date, rules) VALUES (?, ?)", date, JSON.stringify(rules));
}
