// Makes a consistent copy of the database (safe while the app is running) into
// data/backups/family-YYYY-MM-DD.db and keeps the newest 30 copies.
//
//   npm run backup
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const KEEP = 30;
const source = path.resolve(process.env.DB_PATH ?? "data/family.db");
const dir = path.resolve(process.env.BACKUP_DIR ?? "data/backups");

if (!fs.existsSync(source)) {
  console.error(`No database at ${source}`);
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });

const d = new Date();
const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const target = path.join(dir, `family-${day}.db`);
fs.rmSync(target, { force: true }); // VACUUM INTO won't overwrite; replace today's copy

const db = new DatabaseSync(source);
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();

const old = fs.readdirSync(dir).filter((f) => /^family-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -KEEP);
for (const f of old) fs.rmSync(path.join(dir, f));

console.log(`Backed up to ${target}${old.length ? ` (removed ${old.length} old copies)` : ""}`);
