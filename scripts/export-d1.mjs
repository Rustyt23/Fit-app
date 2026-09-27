// Exports your local database (data/family.db) as a SQL file that Cloudflare D1 can import,
// for when you move from your own computer to Cloudflare Workers.
//
//   npm run cf:export                  -> data/d1-export.sql
//   npx wrangler d1 execute family-fit --remote --file=data/d1-export.sql
//
// Import it into a NEW, EMPTY D1 database (don't run the migrations there first:
// the export already contains the tables and the record of applied migrations).
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const source = path.resolve(process.env.DB_PATH ?? "data/family.db");
const target = path.resolve(process.argv[2] ?? "data/d1-export.sql");
if (!fs.existsSync(source)) {
  console.error(`No database at ${source}`);
  process.exit(1);
}

const db = new DatabaseSync(source, { readOnly: true });
const quote = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString("hex")}'`;
  return `'${String(v).replaceAll("'", "''")}'`;
};

// Parents before children, so foreign keys are satisfied as rows arrive.
const ORDER = [
  "d1_migrations", "settings", "members", "tasks", "checkins", "audit_log", "away_periods", "rewards",
  "redemptions", "game_rules", "event_periods", "event_results", "push_subscriptions", "reminders_sent", "login_attempts",
];
const objects = db
  .prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")
  .all();
const tables = objects.filter((o) => o.type === "table").sort((a, b) => {
  const ia = ORDER.indexOf(a.name), ib = ORDER.indexOf(b.name);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});

const out = ["-- Family Fit export for Cloudflare D1", "PRAGMA defer_foreign_keys = true;"];
for (const t of tables) out.push(`${t.sql.replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")};`);
for (const o of objects.filter((o) => o.type === "index")) out.push(`${o.sql.replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")};`);
let rows = 0;
for (const t of tables) {
  for (const row of db.prepare(`SELECT * FROM "${t.name}"`).all()) {
    const cols = Object.keys(row);
    out.push(`INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((c) => quote(row[c])).join(", ")});`);
    rows++;
  }
}
fs.writeFileSync(target, out.join("\n") + "\n");
console.log(`Exported ${tables.length} tables, ${rows} rows to ${target}`);
