import path from "node:path";
import type { Driver, Param, RunResult, Statement } from "./db-types";

export type { Param, Statement } from "./db-types";

/** True when running inside a Cloudflare Worker. */
export function onCloudflare(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

export function dbPath(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.DB_PATH ?? "data/family.db");
}

// Node: one SQLite connection per server process (survives dev-mode hot reloads).
const g = globalThis as unknown as { __familyDriver?: Promise<Driver> };

function driver(): Promise<Driver> {
  // D1 bindings belong to the current request's environment, so look it up each time.
  if (onCloudflare()) return import("./db-d1").then((m) => m.createD1Driver());
  g.__familyDriver ??= import("./db-node").then((m) =>
    m.createNodeDriver(m.openSqlite(dbPath(), path.resolve(/*turbopackIgnore: true*/ process.cwd(), "migrations"))),
  );
  return g.__familyDriver;
}

export async function all<T>(sql: string, ...params: Param[]): Promise<T[]> {
  return (await driver()).all<T>(sql, params);
}

export async function get<T>(sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await all<T>(sql, ...params))[0];
}

export async function run(sql: string, ...params: Param[]): Promise<RunResult> {
  return (await driver()).run(sql, params);
}

/** A statement for batch(). */
export function sql(text: string, ...params: Param[]): Statement {
  return { sql: text, params };
}

/** Runs statements atomically (a D1 batch, or a transaction on Node). */
export async function batch(...statements: Statement[]): Promise<void> {
  return (await driver()).batch(statements);
}

/** Timestamp stored in the database: UTC ISO, shown in the family's timezone. */
export function nowStamp(): string {
  return new Date().toISOString();
}
