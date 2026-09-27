// Creates data/demo.db with a sample family, six weeks of history (so last month has gift winners),
// a sick break and a stocked coin shop,
// so you can try the app without touching your real data (data/family.db).
//
//   npm run seed:demo   then   npm run dev:demo
//
// Safety: it only ever replaces a database it created itself (marked 'sample_data'). If the
// file holds anything else (e.g. a real family's data), it stops and changes nothing.
//
// Every demo member is on the default starting PIN, 0000. Grandma uses Hindi with large text.
import fs from "node:fs";
import path from "node:path";
import { openSqlite } from "../src/lib/db-node.ts";
import { hashPin } from "../src/lib/pin.ts";
import { addDays, daysBetween, minutes, nowHHMM, startOfWeek, today, weekday } from "../src/lib/dates.ts";

const DEMO_PIN = "0000"; // the default starting PIN
const file = path.resolve("data/demo.db");
if (fs.existsSync(file)) {
  const existing = new (process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite")).DatabaseSync(file, { readOnly: true });
  let sample = false;
  try {
    sample = !!existing.prepare("SELECT 1 FROM settings WHERE key = 'sample_data' AND value = '1'").get();
  } catch {
    // no settings table: an empty or unknown file, treat it as not ours
  }
  existing.close();
  if (!sample) {
    console.error(
      `\n${file} already exists and wasn't made by this script (it may hold real family data), so nothing was changed.\n` +
        "Move or rename it first if you really want a fresh sample family there.\n",
    );
    process.exit(1);
  }
}
for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
const db = openSqlite(file, path.resolve("migrations"));

const family = [
  { name: "Dad", admin: 1, color: "#f97316", diligence: 0.85 },
  { name: "Mom", admin: 1, color: "#10b981", diligence: 0.92 },
  { name: "Grandma", admin: 0, color: "#6366f1", diligence: 0.8, lang: "hi", large: true },
  { name: "Riya", admin: 0, color: "#ec4899", diligence: 0.65 },
];

type T = [kind: string, title: string, details: string, time: string, days: string];
const routines: Record<string, T[]> = {
  Dad: [
    ["exercise", "Morning walk", "45 minutes", "06:30", "0123456"],
    ["exercise", "Push-ups", "3 sets of 15", "07:15", "12345"],
    ["supplement", "Omega-3", "1 capsule after breakfast", "08:30", "0123456"],
    ["medicine", "BP tablet", "1 tablet", "09:00", "0123456"],
    ["exercise", "Evening stretch", "10 minutes", "21:00", "0123456"],
  ],
  Mom: [
    ["exercise", "Yoga", "30 minutes", "06:00", "0123456"],
    ["supplement", "Vitamin D3", "1 tablet", "09:00", "0123456"],
    ["supplement", "Calcium", "After lunch", "14:00", "0123456"],
    ["exercise", "Evening walk", "30 minutes", "18:30", "0123456"],
  ],
  Grandma: [
    ["medicine", "Thyroid tablet", "Empty stomach", "06:30", "0123456"],
    ["exercise", "Slow walk", "15 minutes in the park", "07:30", "0123456"],
    ["medicine", "Sugar tablet", "After breakfast", "09:30", "0123456"],
  ],
  Riya: [
    ["exercise", "Skipping rope", "200 skips", "07:00", "123456"],
    ["supplement", "Multivitamin", "With breakfast", "08:00", "0123456"],
    ["exercise", "Cycling", "20 minutes", "17:30", "0123456"],
    ["exercise", "Stretching", "Before bed", "22:00", "0123456"],
  ],
};

const end = today();
const start = addDays(end, -45);
// Weekly challenges count from the start of the history, so the demo has past winners.
db.prepare("INSERT INTO settings (key, value) VALUES ('weekly_events_from', ?)").run(startOfWeek(start));
// Grandma was ill for three days last week.
const sickFrom = addDays(end, -10), sickTo = addDays(end, -8);
const now = minutes(nowHHMM());
const pad = (n: number) => String(n).padStart(2, "0");

db.exec("BEGIN");
db.prepare("INSERT INTO settings (key, value) VALUES ('family_name', 'The Demo Family')").run();
// Marks this file as sample data, so the next run may replace it (and never a real family's).
db.prepare("INSERT INTO settings (key, value) VALUES ('sample_data', '1')").run();
const pinHash = await hashPin(DEMO_PIN);

for (const person of family) {
  const memberId = Number(
    db
      .prepare("INSERT INTO members (name, pin_hash, default_pin, is_admin, photo_version, color, lang, text_size) VALUES (?, ?, 1, ?, ?, ?, ?, ?)")
      .run(person.name, pinHash, person.admin, Date.now(), person.color, person.lang ?? "en", person.large ? "large" : "normal").lastInsertRowid,
  );
  for (const [kind, title, details, time, days] of routines[person.name]) {
    const taskId = Number(
      db
        .prepare("INSERT INTO tasks (member_id, kind, title, details, time, days, weight, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        // Medicines are marked "high importance" (×2) in the demo.
        .run(memberId, kind, title, details, time, days, kind === "medicine" ? 2 : 1, start).lastInsertRowid,
    );
    for (const date of daysBetween(start, end)) {
      if (!days.includes(String(weekday(date)))) continue;
      if (date === end && minutes(time) > now) continue; // not due yet today
      if (person.name === "Grandma" && date >= sickFrom && date <= sickTo) continue;
      if (Math.random() > person.diligence) continue;
      const late = Math.random() < 0.15;
      const at = Math.min(minutes(time) + (late ? 90 : Math.floor(Math.random() * 40) - 10), 23 * 60 + 59);
      const hhmm = `${pad(Math.floor(Math.max(at, 0) / 60))}:${pad(Math.max(at, 0) % 60)}`;
      db.prepare("INSERT INTO checkins (task_id, member_id, date, done_at, on_time) VALUES (?, ?, ?, ?, ?)").run(
        taskId, memberId, date, hhmm, late ? 0 : 1,
      );
    }
  }
}
db.prepare("INSERT INTO audit_log (actor_id, action, at) VALUES (1, 'Created the demo family', ?)").run(new Date().toISOString());

db.prepare("INSERT INTO away_periods (member_id, start_date, end_date, reason, created_by) VALUES (3, ?, ?, 'sick', 1)").run(sickFrom, sickTo);

const rewards: [string, string, number][] = [
  ["📱", "30 minutes extra screen time", 100],
  ["🎬", "Pick the Sunday movie", 150],
  ["🧽", "Skip the dishes once", 150],
  ["🍕", "Choose what's for dinner", 250],
  ["🍦", "Ice-cream treat", 300],
];
for (const [emoji, title, cost] of rewards) db.prepare("INSERT INTO rewards (emoji, title, cost) VALUES (?, ?, ?)").run(emoji, title, cost);
db.prepare("INSERT INTO rewards (emoji, title, cost, hidden) VALUES ('🎢', 'Family trip to the water park', 400, 1)").run();
// Mom already cashed in a movie pick; Riya is waiting on screen time.
db.prepare("INSERT INTO redemptions (member_id, reward_id, emoji, title, cost, status, resolved_at, resolved_by) VALUES (2, 2, '🎬', 'Pick the Sunday movie', 150, 'given', datetime('now', 'localtime'), 1)").run();
db.prepare("INSERT INTO redemptions (member_id, reward_id, emoji, title, cost) VALUES (4, 1, '📱', '30 minutes extra screen time', 100)").run();
db.exec("COMMIT");
db.close();

console.log(`Demo family written to ${file}. Run "npm run dev:demo" and log in with PIN ${DEMO_PIN}.`);
