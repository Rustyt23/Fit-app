// The database schema: fresh installs and upgrades from older versions.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openSqlite } from "@/lib/db-node";

const MIGRATIONS = path.resolve("migrations");
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "family-fit-mig-")), "db.sqlite");
const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

describe("migrations", () => {
  it("builds a fresh database and records every migration", () => {
    const db = openSqlite(tmp(), MIGRATIONS);
    expect(db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((r) => r.name)).toEqual(files);
    db.close();
  });

  it("upgrades a database made by the first version, keeping its data", () => {
    const file = tmp();
    const old = new DatabaseSync(file);
    old.exec(fs.readFileSync(path.join(MIGRATIONS, "0001_init.sql"), "utf8"));
    old.exec(`
      INSERT INTO members (name, pin_hash, is_admin, color, photo) VALUES ('Dad', 'salt:hash', 1, '#f00', X'FFD8');
      INSERT INTO gift_months (month) VALUES ('2026-08');
      INSERT INTO gifts (month, member_id, place, score, note) VALUES ('2026-08', 1, 1, 91.5, 'Shoes');
      INSERT INTO coin_rules (effective_date, rules) VALUES ('2026-09-20', '{"exercise_on_time":5}');
      INSERT INTO tasks (member_id, kind, title, time, start_date) VALUES (1, 'exercise', 'Walk', '07:00', '2026-09-01');
    `);
    old.close();

    const db = openSqlite(file, MIGRATIONS);
    const one = (sql: string) => ({ ...(db.prepare(sql).get() as object) }) as Record<string, unknown>;
    expect(one("SELECT event, period, place, note, prize_text FROM event_results")).toEqual({
      event: "month",
      period: "2026-08-01",
      place: 1,
      note: "Shoes",
      prize_text: "Gift package",
    });
    expect(String(one("SELECT rules FROM game_rules").rules)).toContain('"exercise_on_time":5');
    expect(one("SELECT weight FROM tasks").weight).toBe(1);
    expect(one("SELECT default_pin, lang, text_size, length(photo) AS n FROM members")).toEqual({ default_pin: 0, lang: "en", text_size: "normal", n: 2 });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('gifts', 'gift_months', 'coin_rules')").all()).toEqual([]);
    db.close();

    // Opening again applies nothing twice.
    const again = openSqlite(file, MIGRATIONS);
    expect(Number(again.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get()!.n)).toBe(files.length);
    again.close();
  });
});
