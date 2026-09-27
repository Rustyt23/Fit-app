// SQLite file driver using Node's built-in node:sqlite (no native packages to compile).
// Also used directly by scripts/seed-demo.mts, so it only uses relative imports.
import type { DatabaseSync as Database } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Driver, Param } from "./db-types.ts";

// Loaded at runtime so bundlers (Next.js, the Cloudflare build) leave it alone.
function sqlite(): typeof import("node:sqlite") {
  return process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
}

/**
 * Applies migrations/*.sql in order, tracking them in the same `d1_migrations`
 * table Wrangler uses, so a database can move between Node and Cloudflare D1.
 */
export function applyMigrations(db: Database, dir: string) {
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  const applied = new Set(db.prepare("SELECT name FROM d1_migrations").all().map((r) => String(r.name)));

  // Databases created before migrations existed already have the initial schema.
  if (!applied.size && db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'members'").get()) {
    db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run("0001_init.sql");
    applied.add("0001_init.sql");
  }

  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
}

export function openSqlite(file: string, migrationsDir: string): Database {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new (sqlite().DatabaseSync)(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  applyMigrations(db, migrationsDir);
  return db;
}

// node:sqlite returns null-prototype rows; copy them into plain objects so they
// can be passed to client components. BLOBs come back as Uint8Array already.
const plain = <T>(row: object) => ({ ...row }) as T;

export function createNodeDriver(db: Database): Driver {
  const params = (p: Param[]) => p as import("node:sqlite").SQLInputValue[];
  return {
    async all<T>(sql: string, p: Param[]) {
      return db.prepare(sql).all(...params(p)).map((r) => plain<T>(r));
    },
    async run(sql: string, p: Param[]) {
      const r = db.prepare(sql).run(...params(p));
      return { changes: Number(r.changes), lastRowId: Number(r.lastInsertRowid) };
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        for (const s of statements) db.prepare(s.sql).run(...params(s.params));
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
