"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, batch, dbPath, get, nowStamp, onCloudflare, run, sql, type Statement } from "@/lib/db";
import { hashPin, isValidPin, needsRehash, verifyPin } from "@/lib/pin";
import {
  clearFailures,
  endSession,
  lockedFor,
  recordFailure,
  requireAdmin,
  requireMember,
  startSession,
} from "@/lib/auth";
import {
  AVATAR_COLORS,
  BREAK_REASONS,
  KINDS,
  REPORT_DAYS,
  STARTER_REWARDS,
  activeMembers,
  getMember,
  isOnTime,
  isScheduledOn,
  memberCount,
  type Break,
  type HelpRequest,
  type Redemption,
  type Report,
  type Reward,
  type Task,
} from "@/lib/data";
import {
  DEFAULT_RULES,
  MAX_COINS_PER_RULE,
  MAX_WEIGHT,
  PLACES,
  cleanPrizes,
  cleanRules,
  currentRules,
  eventPrizes,
  eventThemes,
  isWeightKey,
  type EventKind,
  type GameRules,
} from "@/lib/rules";
import { EVENTS, achievementsFor } from "@/lib/stats";
import { sendToMember } from "@/lib/push";
import { removePhoto, savePhoto } from "@/lib/photos";
import { readPrefs, writePrefs } from "@/lib/prefs";
import { isLang, translator } from "@/lib/i18n";
import { adminText, type AT } from "@/lib/i18n-admin";
import { isThemeSetting } from "@/lib/themes";
import { canTick } from "@/lib/tick-window";
import { addDays, formatDate, formatMonth, startOfWeek, today, zonedDateTime } from "@/lib/dates";

export type FormState = { error?: string; message?: string; n?: number } | undefined;

const ok = (message: string): FormState => ({ message, n: Date.now() });
const fail = (error: string): FormState => ({ error });

function str(fd: FormData, key: string, max = 100): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

async function audit(actorId: number | null, action: string) {
  await run("INSERT INTO audit_log (actor_id, action, at) VALUES (?, ?, ?)", actorId, action, nowStamp());
}

/** Photos arrive as a small JPEG data URL, already cropped and resized in the browser. */
function parsePhoto(fd: FormData): Uint8Array | null {
  const value = String(fd.get("photo") ?? "");
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
  return bytes.length > 0 && bytes.length <= 400_000 ? bytes : null;
}

/** Every new member starts with this PIN until an admin (or they) choose another. */
const DEFAULT_PIN = "0000";

async function nextColor(): Promise<string> {
  return AVATAR_COLORS[(await memberCount()) % AVATAR_COLORS.length];
}

async function otherActiveAdmins(adminId: number): Promise<number> {
  return (await get<{ n: number }>("SELECT COUNT(*) AS n FROM members WHERE active = 1 AND is_admin = 1 AND id != ?", adminId))!.n;
}

function refresh() {
  revalidatePath("/", "layout");
}

// ---------- First-run setup & login ----------

export async function setupFamily(_: FormState, fd: FormData): Promise<FormState> {
  if ((await memberCount()) > 0) return fail("This family is already set up. Please log in.");
  const family = str(fd, "family", 60) || "Our Family";
  const name = str(fd, "name", 40);
  const pin = str(fd, "pin", 6) || DEFAULT_PIN;
  if (!name) return fail("Please enter your name.");
  if (!isValidPin(pin)) return fail("PIN must be 4 to 6 digits.");
  if (pin !== (str(fd, "pin2", 6) || DEFAULT_PIN)) return fail("The two PINs don't match.");

  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('family_name', ?)", family);
  const { lastRowId: id } = await run(
    "INSERT INTO members (name, pin_hash, default_pin, is_admin, photo_version, color) VALUES (?, ?, ?, 1, ?, ?)",
    name, await hashPin(pin), pin === DEFAULT_PIN ? 1 : 0, Date.now(), AVATAR_COLORS[0],
  );
  const photo = parsePhoto(fd);
  if (photo) await savePhoto(id, photo);
  await audit(id, `${name} created the family "${family}"`);
  await startSession(id);
  redirect("/admin");
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const id = Number(fd.get("memberId"));
  const pin = str(fd, "pin", 6);
  const t = translator((await readPrefs()).lang);
  const row = await get<{ pin_hash: string; active: number; lang: string; text_size: string }>(
    "SELECT pin_hash, active, lang, text_size FROM members WHERE id = ?",
    id,
  );
  if (!row?.active) return fail(t("login.pickPhoto"));
  const wait = await lockedFor(id);
  if (wait) return fail(t("login.locked", { n: wait }));
  if (!(await verifyPin(pin, row.pin_hash))) {
    await recordFailure(id);
    return fail(t("login.wrongPin"));
  }
  await clearFailures(id);
  // Quietly upgrade PINs saved in the older format.
  if (needsRehash(row.pin_hash)) await run("UPDATE members SET pin_hash = ? WHERE id = ?", await hashPin(pin), id);
  await writePrefs(row.lang, row.text_size);
  await startSession(id);
  redirect("/today");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

// ---------- Daily check-ins ----------

export type TickRequest = { taskId: number; date: string; done: boolean; tappedAt?: string };

/**
 * Sets whether a task is done on a day. Members can only tick their own tasks, for
 * today, or for yesterday until 10 AM. Ticks made offline are replayed later with the
 * time they were tapped (`tappedAt`), which decides the window and "on time".
 */
export async function setCheckin(req: TickRequest): Promise<{ ok: boolean }> {
  const me = await requireMember();
  const taskId = Number(req?.taskId);
  const date = String(req?.date ?? "");
  const now = Date.now();
  // A tap time from the phone is trusted only within the last 3 days and not in the future.
  const tapped = req?.tappedAt ? Date.parse(req.tappedAt) : NaN;
  const at = Number.isFinite(tapped) && tapped <= now + 60_000 && tapped >= now - 3 * 86400_000 ? tapped : now;
  const tap = zonedDateTime(at);
  if (!canTick(date, tap.date, tap.time)) return { ok: false };

  const task = await get<Task>("SELECT * FROM tasks WHERE id = ? AND member_id = ?", taskId, me.id);
  if (!task || !isScheduledOn(task, date)) return { ok: false };

  if (!req.done) {
    await run("DELETE FROM checkins WHERE task_id = ? AND date = ?", taskId, date);
  } else {
    // Ticked on the day itself: on time or late by the clock. Ticked the next morning: late.
    // "Any time" items are always on time when ticked on the day itself.
    const onTime = tap.date === date && (task.any_time || isOnTime(task.time, tap.time)) ? 1 : 0;
    await run(
      "INSERT OR IGNORE INTO checkins (task_id, member_id, date, done_at, on_time) VALUES (?, ?, ?, ?, ?)",
      taskId, me.id, date, tap.time, onTime,
    );
  }
  refresh();
  return { ok: true };
}

/** Kept for older open pages: flips today's tick. */
export async function toggleCheckin(taskId: number) {
  const me = await requireMember();
  const date = today();
  const done = await get("SELECT 1 FROM checkins WHERE task_id = ? AND date = ? AND member_id = ?", taskId, date, me.id);
  await setCheckin({ taskId, date, done: !done });
}

// ---------- Admin: members ----------

export async function saveMember(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const id = Number(fd.get("id")) || null;
  const name = str(fd, "name", 40);
  const pin = str(fd, "pin", 6);
  const resetPin = fd.get("reset_pin") === "on";
  const isAdmin = fd.get("is_admin") === "on" ? 1 : 0;
  const photo = parsePhoto(fd);
  const dropPhoto = fd.get("remove_photo") === "on";
  const lang = isLang(fd.get("lang")) ? String(fd.get("lang")) : null;
  const textSize = fd.get("text_size") === "large" ? "large" : fd.get("text_size") === "normal" ? "normal" : null;
  if (!name) return fail(at("x.nameRequired"));

  if (!id) {
    const newPin = pin || DEFAULT_PIN;
    if (!isValidPin(newPin)) return fail(at("x.pinDigitsNew"));
    const { lastRowId } = await run(
      "INSERT INTO members (name, pin_hash, default_pin, is_admin, photo_version, color, lang, text_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      name, await hashPin(newPin), newPin === DEFAULT_PIN ? 1 : 0, isAdmin, Date.now(), await nextColor(), lang ?? "en", textSize ?? "normal",
    );
    if (photo) await savePhoto(lastRowId, photo);
    await audit(admin.id, `Added ${name}${isAdmin ? " as an admin" : ""}`);
    refresh();
    return ok(at("x.joined", { name, pin: newPin === DEFAULT_PIN ? " (PIN 0000)" : "" }));
  }

  const member = await getMember(id);
  if (!member?.active) return fail(at("x.memberNotFound"));
  if (pin && !isValidPin(pin)) return fail(at("x.pinDigits"));
  if (member.is_admin && !isAdmin && (await otherActiveAdmins(id)) === 0) return fail(at("x.needAdmin"));

  const newPin = pin || (resetPin ? DEFAULT_PIN : "");
  await batch(
    sql("UPDATE members SET name = ?, is_admin = ? WHERE id = ?", name, isAdmin, id),
    ...(newPin ? [sql("UPDATE members SET pin_hash = ?, default_pin = ? WHERE id = ?", await hashPin(newPin), newPin === DEFAULT_PIN ? 1 : 0, id)] : []),
    ...(lang ? [sql("UPDATE members SET lang = ? WHERE id = ?", lang, id)] : []),
    ...(textSize ? [sql("UPDATE members SET text_size = ? WHERE id = ?", textSize, id)] : []),
  );
  if (photo) await savePhoto(id, photo);
  else if (dropPhoto) await removePhoto(id);
  const changes = [
    name !== member.name && `renamed ${member.name} to ${name}`,
    newPin && (newPin === DEFAULT_PIN ? `reset ${name}'s PIN to 0000` : `set a new PIN for ${name}`),
    photo && `changed ${name}'s photo`,
    !photo && dropPhoto && `removed ${name}'s photo`,
    lang && lang !== member.lang && `set ${name}'s language to ${lang === "hi" ? "Hindi" : "English"}`,
    textSize && textSize !== member.text_size && `set ${name}'s text size to ${textSize}`,
    isAdmin !== member.is_admin && (isAdmin ? `made ${name} an admin` : `removed ${name}'s admin rights`),
  ].filter(Boolean);
  if (changes.length) await audit(admin.id, changes.join(", ").replace(/^./, (c) => c.toUpperCase()));
  refresh();
  return ok(at("x.saved"));
}

export async function removeMember(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const id = Number(fd.get("id"));
  if (id === admin.id) return fail(at("x.notYourself"));
  const member = await getMember(id);
  if (!member?.active) return fail(at("x.memberNotFound"));
  const date = today();
  await batch(
    sql("UPDATE members SET active = 0 WHERE id = ?", id),
    sql("UPDATE tasks SET end_date = ? WHERE member_id = ? AND (end_date IS NULL OR end_date > ?)", date, id, date),
  );
  await audit(admin.id, `Removed ${member.name} from the family`);
  refresh();
  redirect("/admin");
}

export async function saveFamilyName(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const family = str(fd, "family", 60);
  if (!family) return fail(at("x.familyEmpty"));
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('family_name', ?)", family);
  await audit(admin.id, `Renamed the family to "${family}"`);
  refresh();
  return ok(at("x.saved"));
}

// ---------- Admin: routines ----------

type TaskSettings = Pick<
  Task,
  "kind" | "title" | "details" | "time" | "days" | "weight" | "any_time" | "per_week" | "per_month" | "repeat_every_days" | "month_days" | "custom_type" | "custom_emoji" | "coins" | "penalty"
>;

function insertTask(memberId: number, v: TaskSettings, start: string, end: string | null = null) {
  return sql(
    `INSERT INTO tasks (member_id, kind, title, details, time, days, weight, any_time, per_week, per_month, repeat_every_days, month_days, custom_type, custom_emoji, coins, penalty, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    memberId, v.kind, v.title, v.details, v.time, v.days, v.weight, v.any_time, v.per_week, v.per_month, v.repeat_every_days, v.month_days,
    v.custom_type, v.custom_emoji, v.coins, v.penalty, start, end,
  );
}

/** "Mom", "Mom and Neha", "Mom, Neha and Vicky" */
function nameList(names: string[], and = "and"): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}` : (names[0] ?? "");
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** A routine item form, read and checked. `start` is null when the form doesn't set one; `lastDay` is the inclusive end. */
type TaskForm = { settings: TaskSettings; start: string | null; lastDay: string | null };

function readTaskForm(fd: FormData, at: AT): TaskForm | { error: string } {
  const kind = str(fd, "kind", 20);
  const title = str(fd, "title", 80);
  const details = str(fd, "details", 160);
  const anyTime = fd.get("time_mode") === "any" ? 1 : 0;
  const time = anyTime ? "" : str(fd, "time", 5);
  const daysMode = String(fd.get("days_mode") ?? "days");
  const perWeek = daysMode === "weekly" ? Math.round(Number(fd.get("per_week"))) : null;
  const perMonth = daysMode === "monthly" ? Math.round(Number(fd.get("per_month"))) : null;
  const repeatEveryDays = daysMode === "interval" ? Math.round(Number(fd.get("repeat_every_days"))) : null;
  const monthDays = daysMode === "month_dates"
    ? [...new Set(fd.getAll("month_days").map(Number))].filter((day) => Number.isInteger(day) && day >= 1 && day <= 31).sort((a, b) => a - b).join(",")
    : null;
  const days =
    perWeek || perMonth || repeatEveryDays || monthDays ? "0123456" : [...new Set(fd.getAll("days").map(String))].filter((d) => /^[0-6]$/.test(d)).sort().join("");
  // "Your own" types carry their own name and emoji.
  const customType = kind === "other" ? str(fd, "custom_type", 30) : null;
  const customEmoji = kind === "other" ? str(fd, "custom_emoji", 8) || "✨" : null;
  const weight = Math.round(Number(fd.get("weight") ?? 1));
  const coinsText = str(fd, "coins", 4);
  const coins = coinsText === "" ? null : Number(coinsText);
  const penalty = Number(str(fd, "penalty", 4) || 0);
  const date = today();
  const startText = str(fd, "start_date", 10);
  const start = isDate(startText) && startText >= date && startText <= addDays(date, 366) ? startText : null;
  const lastText = str(fd, "last_day", 10);

  if (!KINDS.some((k) => k.value === kind)) return { error: at("x.pickType") };
  if (!title) return { error: at("x.giveName") };
  if (!anyTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: at("x.pickTime") };
  if (kind === "other" && !customType) return { error: at("x.ownTypeName") };
  if (daysMode === "weekly" && !(perWeek! >= 1 && perWeek! <= 6)) return { error: at("x.perWeek") };
  if (daysMode === "monthly" && !(perMonth! >= 1 && perMonth! <= 4)) return { error: at("x.perMonth") };
  if (daysMode === "interval" && !(repeatEveryDays! >= 1 && repeatEveryDays! <= 365)) return { error: at("x.interval") };
  if (daysMode === "month_dates" && !monthDays) return { error: at("x.monthDate") };
  if (!days) return { error: at("x.oneDay") };
  if (!(weight >= 1 && weight <= 3)) return { error: at("x.importance") };
  if (coins !== null && !(Number.isInteger(coins) && coins >= 0 && coins <= MAX_COINS_PER_RULE)) {
    return { error: at("x.coinsRange", { max: MAX_COINS_PER_RULE }) };
  }
  if (!(Number.isInteger(penalty) && penalty >= 0 && penalty <= MAX_COINS_PER_RULE)) {
    return { error: at("x.penaltyRange", { max: MAX_COINS_PER_RULE }) };
  }
  if (lastText && (!isDate(lastText) || lastText < date)) return { error: at("x.lastDayPast") };
  if (lastText && start && lastText < start) return { error: at("x.lastBeforeStart") };

  return {
    settings: {
      kind: kind as Task["kind"],
      title,
      details,
      time,
      days,
      weight,
      any_time: anyTime,
      per_week: perWeek,
      per_month: perMonth,
      repeat_every_days: repeatEveryDays,
      month_days: monthDays,
      custom_type: customType,
      custom_emoji: customEmoji,
      coins,
      penalty,
    },
    start,
    lastDay: lastText || null,
  };
}

/**
 * Adds the same item to several people's routines at once. Each person gets their own copy
 * (so it can be changed for one person later), and anyone who already has it is skipped.
 */
async function addToRoutines(
  adminId: number,
  at: AT,
  v: TaskSettings,
  memberIds: number[],
  start = today(),
  end: string | null = null,
): Promise<FormState> {
  const ids = [...new Set(memberIds)];
  if (!ids.length) return fail(at("x.pickPerson"));
  const members = (await activeMembers()).filter((m) => ids.includes(m.id));
  if (members.length !== ids.length) return fail(at("x.memberNotFound"));
  const date = today();
  const has = new Set(
    (
      await all<{ member_id: number }>(
        "SELECT DISTINCT member_id FROM tasks WHERE lower(title) = lower(?) AND (end_date IS NULL OR end_date > ?)",
        v.title, date,
      )
    ).map((r) => r.member_id),
  );
  const adding = members.filter((m) => !has.has(m.id));
  const skipped = nameList(members.filter((m) => has.has(m.id)).map((m) => m.name), at("bk.and"));
  if (!adding.length) {
    return fail(at(members.length === 1 ? "x.alreadyHasOne" : "x.alreadyHasMany", { names: skipped, title: v.title }));
  }

  await batch(...adding.map((m) => insertTask(m.id, v, start, end)));
  const names = nameList(adding.map((m) => m.name), at("bk.and"));
  await audit(adminId, `Added ${v.kind} "${v.title}" for ${nameList(adding.map((m) => m.name))}`);
  refresh();
  const added = adding.length === 1 ? at("x.addedTo", { title: v.title, name: names }) : at("x.addedFor", { title: v.title, names });
  return ok(skipped ? `${added} ${at(members.length - adding.length === 1 ? "x.alsoHasOne" : "x.alsoHasMany", { names: skipped })}` : added);
}

/**
 * The changes that turn an existing item into `form`. Anything that affects scores or coins
 * would rewrite the past if edited in place, so then the old version ends today and a new
 * one continues (today's tick moves across). Items that haven't started yet are just edited.
 */
function editTask(task: Task, form: TaskForm, date: string, at: AT): Statement[] | { error: string } {
  const v = form.settings;
  const notStarted = task.start_date > date;
  const start = notStarted ? (form.start ?? task.start_date) : task.start_date;
  const end = form.lastDay ? addDays(form.lastDay, 1) : null;
  if (end && end <= start) return { error: at("x.lastBeforeStart") };
  const scoringChanged =
    task.days !== v.days ||
    task.kind !== v.kind ||
    task.weight !== v.weight ||
    task.any_time !== v.any_time ||
    task.per_week !== v.per_week ||
    task.per_month !== v.per_month ||
    task.repeat_every_days !== v.repeat_every_days ||
    task.month_days !== v.month_days ||
    task.coins !== v.coins ||
    task.penalty !== v.penalty ||
    (task.time !== v.time && !v.any_time);
  if (scoringChanged && task.start_date < date) {
    return [
      sql("UPDATE tasks SET end_date = ? WHERE id = ?", date, task.id),
      insertTask(task.member_id, v, date, end),
      sql(
        "UPDATE checkins SET task_id = (SELECT MAX(id) FROM tasks WHERE member_id = ?) WHERE task_id = ? AND date = ?",
        task.member_id, task.id, date,
      ),
    ];
  }
  return [
    sql(
      `UPDATE tasks SET kind = ?, title = ?, details = ?, time = ?, days = ?, weight = ?, any_time = ?, per_week = ?, per_month = ?,
       repeat_every_days = ?, month_days = ?, custom_type = ?, custom_emoji = ?, coins = ?, penalty = ?, start_date = ?, end_date = ? WHERE id = ?`,
      v.kind, v.title, v.details, v.time, v.days, v.weight, v.any_time, v.per_week, v.per_month, v.repeat_every_days, v.month_days,
      v.custom_type, v.custom_emoji, v.coins, v.penalty, start, end, task.id,
    ),
  ];
}

export async function saveTask(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const id = Number(fd.get("id")) || null;
  const memberId = Number(fd.get("member_id"));
  // The add form lets you pick several people; editing is always for one.
  const memberIds = !id && fd.has("pick_members") ? fd.getAll("member_ids").map(Number) : [memberId];
  const form = readTaskForm(fd, at);
  if ("error" in form) return fail(form.error);

  if (!id) {
    const start = form.start ?? today();
    return addToRoutines(admin.id, at, form.settings, memberIds, start, form.lastDay ? addDays(form.lastDay, 1) : null);
  }

  const member = await getMember(memberId);
  if (!member?.active) return fail(at("x.memberNotFound"));
  const date = today();
  const task = await get<Task>("SELECT * FROM tasks WHERE id = ? AND member_id = ?", id, memberId);
  if (!task || (task.end_date && task.end_date <= date)) return fail(at("x.itemNotFound"));
  const changes = editTask(task, form, date, at);
  if ("error" in changes) return fail(changes.error);
  await batch(...changes);
  await audit(admin.id, `Updated ${member.name}'s "${form.settings.title}"`);
  refresh();
  return ok(at("x.saved"));
}

/**
 * Bulk edit: applies one set of settings to an item (matched by name) in several people's
 * routines at once, e.g. "Protein shake" for everyone now at 8 AM.
 */
export async function bulkEditTasks(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const match = str(fd, "match_title", 80);
  const memberIds = [...new Set(fd.getAll("member_ids").map(Number))];
  if (!memberIds.length) return fail(at("x.pickPerson"));
  if (!match) return fail(at("x.pickItem"));
  const form = readTaskForm(fd, at);
  if ("error" in form) return fail(form.error);
  const date = today();
  const tasks = (
    await all<Task>("SELECT * FROM tasks WHERE lower(title) = lower(?) AND (end_date IS NULL OR end_date > ?) ORDER BY member_id, id", match, date)
  ).filter((t) => memberIds.includes(t.member_id));
  if (!tasks.length) return fail(at("x.nobodyHas", { title: match }));
  // Renaming onto a name someone already has would give them two of the same.
  if (form.settings.title.toLowerCase() !== match.toLowerCase()) {
    const clash = await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tasks WHERE lower(title) = lower(?) AND (end_date IS NULL OR end_date > ?) AND member_id IN (${tasks.map(() => "?").join(", ")})`,
      form.settings.title, date, ...tasks.map((t) => t.member_id),
    );
    if (clash!.n) return fail(at("x.clash", { title: form.settings.title }));
  }
  const changes: Statement[] = [];
  for (const t of tasks) {
    const c = editTask(t, form, date, at);
    if ("error" in c) return fail(c.error);
    changes.push(...c);
  }
  await batch(...changes);
  const members = await activeMembers();
  const who = [...new Set(tasks.map((t) => members.find((m) => m.id === t.member_id)?.name ?? "?"))];
  const names = nameList(who, at("bk.and"));
  await audit(admin.id, `Changed "${match}" for ${nameList(who)}`);
  refresh();
  return ok(at("x.savedFor", { title: form.settings.title, names }));
}

/** Bulk remove: takes the ticked items (by name) out of the picked people's routines. */
export async function bulkRemoveTasks(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const memberIds = [...new Set(fd.getAll("member_ids").map(Number))];
  const titles = [...new Set(fd.getAll("titles").map((t) => String(t).toLowerCase()))];
  if (!memberIds.length) return fail(at("x.pickPerson"));
  if (!titles.length) return fail(at("x.tickRemove"));
  const date = today();
  const ids = (
    await all<{ id: number; member_id: number; title: string }>(
      "SELECT id, member_id, title FROM tasks WHERE end_date IS NULL OR end_date > ?",
      date,
    )
  )
    .filter((t) => memberIds.includes(t.member_id) && titles.includes(t.title.toLowerCase()))
    .map((t) => t.id);
  if (!ids.length) return fail(at("x.nobodyHasThose"));
  const removed = await endTasks(ids);
  if (!removed) return fail(at("x.alreadyRemoved"));
  for (const [name, list] of removed) await audit(admin.id, `Removed ${nameList(list)} from ${name}'s routine`);
  refresh();
  return ok(at("x.removedFrom", { count: ids.length === 1 ? at("rm.oneItem") : at("rm.nItems", { n: ids.length }), names: nameList([...removed.keys()], at("bk.and")) }));
}

/** "Give this to others too": copies an existing item, exactly as it is, to other people's routines. */
export async function copyTask(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const task = await get<Task>("SELECT * FROM tasks WHERE id = ? AND (end_date IS NULL OR end_date > ?)", Number(fd.get("id")), today());
  if (!task) return fail(at("x.itemNotFound"));
  const ids = fd.getAll("member_ids").map(Number).filter((m) => m !== task.member_id);
  return addToRoutines(admin.id, at, task, ids);
}

/** Takes items out of routines, returning what was removed per person (null if any were not found). */
async function endTasks(ids: number[]): Promise<Map<string, string[]> | null> {
  const date = today();
  const tasks = await all<{ id: number; title: string; member_name: string; used: number }>(
    `SELECT t.id, t.title, m.name AS member_name, EXISTS (SELECT 1 FROM checkins c WHERE c.task_id = t.id) AS used
     FROM tasks t JOIN members m ON m.id = t.member_id
     WHERE t.id IN (${ids.map(() => "?").join(", ")}) AND (t.end_date IS NULL OR t.end_date > ?)`,
    ...ids, date,
  );
  if (!ids.length || tasks.length !== ids.length) return null;
  // Keep items that already have history (so past scores don't change); just stop them from today.
  await batch(
    ...tasks.map((t) => (t.used ? sql("UPDATE tasks SET end_date = ? WHERE id = ?", date, t.id) : sql("DELETE FROM tasks WHERE id = ?", t.id))),
  );
  const removed = new Map<string, string[]>();
  for (const t of tasks) removed.set(t.member_name, [...(removed.get(t.member_name) ?? []), `"${t.title}"`]);
  return removed;
}

export async function removeTask(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const removed = await endTasks([Number(fd.get("id"))]);
  if (!removed) return fail(at("x.itemNotFound"));
  for (const [name, titles] of removed) await audit(admin.id, `Removed ${titles[0]} from ${name}'s routine`);
  refresh();
  return ok(at("x.removed"));
}

/** Removes several routine items at once (e.g. a finished course of tablets). */
export async function removeTasks(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const ids = [...new Set(fd.getAll("ids").map(Number))];
  if (!ids.length) return fail(at("x.tickRemove"));
  const removed = await endTasks(ids);
  if (!removed) return fail(at("x.alreadyRemoved"));
  for (const [name, titles] of removed) await audit(admin.id, `Removed ${nameList(titles)} from ${name}'s routine`);
  refresh();
  return ok(at("x.removedN", { count: ids.length === 1 ? at("rm.oneItem") : at("rm.nItems", { n: ids.length }) }));
}

// ---------- My profile ----------

export async function updateMyPhoto(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const t = translator(me.lang);
  const photo = parsePhoto(fd);
  if (!photo) return fail(t("photo.choose"));
  await savePhoto(me.id, photo);
  refresh();
  return ok(t("photo.updated"));
}

export async function savePrefs(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const lang = isLang(fd.get("lang")) ? String(fd.get("lang")) : me.lang;
  const textSize = fd.get("text_size") === "large" ? "large" : "normal";
  await run("UPDATE members SET lang = ?, text_size = ? WHERE id = ?", lang, textSize, me.id);
  await writePrefs(lang, textSize);
  refresh();
  return ok(translator(lang)("me.saved"));
}

export async function changeMyPin(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const t = translator(me.lang);
  const current = str(fd, "current", 6);
  const pin = str(fd, "pin", 6);
  const row = (await get<{ pin_hash: string }>("SELECT pin_hash FROM members WHERE id = ?", me.id))!;
  if (!(await verifyPin(current, row.pin_hash))) return fail(t("pin.wrongCurrent"));
  if (!isValidPin(pin)) return fail(t("pin.invalid"));
  if (pin !== str(fd, "pin2", 6)) return fail(t("pin.mismatch"));
  await run("UPDATE members SET pin_hash = ?, default_pin = ? WHERE id = ?", await hashPin(pin), pin === DEFAULT_PIN ? 1 : 0, me.id);
  refresh();
  return ok(t("pin.changed"));
}

// ---------- Sick / travel breaks ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function startBreak(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const tr = translator(me.lang);
  const memberId = Number(fd.get("member_id")) || me.id;
  const member = await getMember(memberId);
  if (!member?.active) return fail(adminText(me.lang)("x.memberNotFound"));
  // Admins can plan or back-date a break for someone else (e.g. "Grandma was in hospital last week").
  // For your own breaks everyone, admins included, can only start from today.
  const canBackdate = !!me.is_admin && memberId !== me.id;
  if (!canBackdate && memberId !== me.id) return fail("Only an admin can set a break for someone else.");

  const reason = str(fd, "reason", 10);
  if (!(reason in BREAK_REASONS)) return fail(tr("break.pickReason"));
  const t = today();
  const from = canBackdate ? str(fd, "from", 10) : t;
  const to = str(fd, "to", 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return fail(tr("break.pickDates"));
  if (to < from) return fail(tr("break.endBeforeStart"));
  if (!canBackdate && to > addDays(t, 30)) return fail(tr("break.tooLong"));
  if (canBackdate && (to > addDays(from, 90) || from < addDays(t, -365))) return fail("That break is too long.");
  if (await get("SELECT 1 FROM away_periods WHERE member_id = ? AND start_date <= ? AND end_date >= ?", memberId, to, from)) {
    return fail(tr("break.overlap"));
  }

  await run(
    "INSERT INTO away_periods (member_id, start_date, end_date, reason, created_by) VALUES (?, ?, ?, ?, ?)",
    memberId, from, to, reason, me.id,
  );
  const r = BREAK_REASONS[reason as keyof typeof BREAK_REASONS];
  const short = (d: string) => formatDate(d, { day: "numeric", month: "short" });
  await audit(me.id, `${r.emoji} ${member.name} on a ${reason} break, ${from === to ? short(from) : `${short(from)} – ${short(to)}`}`);
  refresh();
  return ok(memberId === me.id ? tr(reason === "sick" ? "break.getWell" : "break.goodTrip") : "Break saved.");
}

export async function endBreak(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const brk = await get<Break>("SELECT * FROM away_periods WHERE id = ?", Number(fd.get("id")));
  if (!brk) return fail("Break not found.");
  const own = brk.member_id === me.id;
  if (!own && !me.is_admin) return fail("You can only end your own break.");
  const t = today();
  const member = (await getMember(brk.member_id))!;

  if ((!own && fd.get("delete") === "1") || brk.start_date >= t) {
    await run("DELETE FROM away_periods WHERE id = ?", brk.id);
    await audit(me.id, `Removed ${member.name}'s break (${brk.start_date} to ${brk.end_date})`);
  } else {
    // Already started: keep the past days as a break, count from today again.
    await run("UPDATE away_periods SET end_date = ? WHERE id = ?", addDays(t, -1), brk.id);
    await audit(me.id, `Ended ${member.name}'s break early`);
  }
  refresh();
  return ok(own ? translator(me.lang)("break.welcomeBack") : "Break updated.");
}

// ---------- Coin shop ----------

export async function redeemReward(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const t = translator(me.lang);
  const reward = await get<Reward>("SELECT id, emoji, title, cost, hidden FROM rewards WHERE id = ? AND active = 1", Number(fd.get("id")));
  if (!reward) return fail(t("shop.gone"));
  const { coins } = await achievementsFor(me.id);
  if (coins < reward.cost) return fail(t("shop.needMore", { n: reward.cost - coins }));
  await run(
    "INSERT INTO redemptions (member_id, reward_id, emoji, title, cost, requested_at) VALUES (?, ?, ?, ?, ?, ?)",
    me.id, reward.id, reward.emoji, reward.title, reward.cost, nowStamp(),
  );
  await audit(me.id, `Asked for ${reward.hidden ? "a mystery reward: " : ""}${reward.emoji} ${reward.title} (${reward.cost} coins)`);
  refresh();
  return ok(reward.hidden ? t("shop.revealed", { emoji: reward.emoji, title: reward.title }) : t("shop.requestedMsg", { title: reward.title }));
}

export async function cancelRedemption(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const t = translator(me.lang);
  const res = await run("DELETE FROM redemptions WHERE id = ? AND member_id = ? AND status = 'requested'", Number(fd.get("id")), me.id);
  if (!res.changes) return fail(t("shop.cantCancel"));
  refresh();
  return ok(t("shop.cancelled"));
}

export async function resolveRedemption(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const status = str(fd, "status", 10);
  if (status !== "given" && status !== "declined") return fail(at("x.unknown"));
  const r = await get<Redemption>("SELECT * FROM redemptions WHERE id = ? AND status = 'requested'", Number(fd.get("id")));
  if (!r) return fail(at("x.handled"));
  if (r.member_id === admin.id && (await otherActiveAdmins(admin.id)) > 0) return fail(at("x.otherApprove"));
  await run(
    "UPDATE redemptions SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?",
    status, nowStamp(), admin.id, r.id,
  );
  const name = (await getMember(r.member_id))?.name ?? "someone";
  await audit(admin.id, `${status === "given" ? "Gave" : "Declined"} ${r.emoji} ${r.title} for ${name}`);
  if (status === "given") {
    await sendToMember(r.member_id, { title: `${r.emoji} Reward approved!`, body: `Enjoy: ${r.title}`, url: "/shop" }).catch(() => 0);
  }
  refresh();
  return ok(status === "given" ? "Marked as given." : "Declined, coins returned.");
}

/** Adds a reward, or edits one when an id is given. */
export async function saveReward(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const id = Number(fd.get("id")) || null;
  const emoji = str(fd, "emoji", 8) || "🎁";
  const title = str(fd, "title", 60);
  const cost = Math.round(Number(fd.get("cost")));
  const hidden = fd.get("hidden") === "on" ? 1 : 0;
  if (!title) return fail(at("x.whatReward"));
  if (!(cost >= 1 && cost <= 10000)) return fail(at("x.costRange"));
  const label = `${hidden ? "mystery " : ""}reward ${emoji} ${title} (${cost} coins)`;
  if (!id) {
    await run("INSERT INTO rewards (emoji, title, cost, hidden) VALUES (?, ?, ?, ?)", emoji, title, cost, hidden);
    await audit(admin.id, `Added ${label}`);
    refresh();
    return ok(at("x.addedShop"));
  }
  const res = await run("UPDATE rewards SET emoji = ?, title = ?, cost = ?, hidden = ? WHERE id = ? AND active = 1", emoji, title, cost, hidden, id);
  if (!res.changes) return fail(at("x.rewardNotFound"));
  await audit(admin.id, `Updated ${label}`);
  refresh();
  return ok(at("x.savedPrice"));
}

export async function removeReward(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const reward = await get<Reward>("SELECT id, emoji, title, cost, hidden FROM rewards WHERE id = ?", Number(fd.get("id")));
  if (!reward) return fail(at("x.rewardNotFound"));
  await run("UPDATE rewards SET active = 0 WHERE id = ?", reward.id);
  await audit(admin.id, `Removed reward ${reward.emoji} ${reward.title}`);
  refresh();
  return ok(at("x.removed"));
}

export async function addStarterRewards(): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  await batch(
    ...STARTER_REWARDS.map((r) =>
      sql(
        `INSERT INTO rewards (emoji, title, cost, hidden)
         SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM rewards WHERE title = ? AND active = 1)`,
        r.emoji, r.title, r.cost, r.hidden, r.title,
      ),
    ),
  );
  await audit(admin.id, "Added the starter rewards to the shop");
  refresh();
  return ok(at("x.starterAdded"));
}

// ---------- Weekly / monthly event prizes ----------

export async function saveEventPrizes(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const kind = str(fd, "event", 5) as EventKind;
  if (!(kind in EVENTS)) return fail(at("x.unknownEvent"));
  const places = Array.from({ length: PLACES }, (_, i) => ({
    coins: String(fd.get(`coins_${i}`) ?? "0").trim() || "0",
    prize: str(fd, `prize_${i}`, 80),
    secret: fd.get(`secret_${i}`) === "on",
  }));
  if (places.some((p) => !/^\d+$/.test(p.coins) || Number(p.coins) > MAX_COINS_PER_RULE * 10)) {
    return fail(at("x.prizeRange", { max: MAX_COINS_PER_RULE * 10 }));
  }
  const theme = fd.get("theme");
  if (!isThemeSetting(theme)) return fail(at("x.pickTheme"));
  const [current, themes] = await Promise.all([eventPrizes(), eventThemes()]);
  const next = cleanPrizes({ ...current, [kind]: places.map((p) => ({ ...p, coins: Number(p.coins) })) });
  await batch(
    sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('event_prizes', ?)", JSON.stringify(next)),
    sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('event_themes', ?)", JSON.stringify({ ...themes, [kind]: theme })),
  );
  await audit(admin.id, `Updated the ${EVENTS[kind].label.toLowerCase()} (theme: ${theme})`);
  refresh();
  return ok(at("x.prizesSaved"));
}

export async function markPrizeDelivered(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const kind = str(fd, "event", 5) as EventKind;
  const period = str(fd, "period", 10);
  const memberId = Number(fd.get("member_id"));
  const note = str(fd, "note", 120);
  const res = await run(
    "UPDATE event_results SET delivered_at = ?, delivered_by = ?, note = ? WHERE event = ? AND period = ? AND member_id = ? AND delivered_at IS NULL",
    nowStamp(), admin.id, note, kind, period, memberId,
  );
  if (!res.changes) return fail(at("x.alreadyDelivered"));
  const name = (await getMember(memberId))?.name ?? "someone";
  const when = kind === "month" ? formatMonth(period) : `the week of ${formatDate(period, { day: "numeric", month: "short" })}`;
  await audit(admin.id, `🎁 Delivered ${name}'s prize for ${when}${note ? `: ${note}` : ""}`);
  refresh();
  return ok(at("x.delivered"));
}

// ---------- Reminders (web push) ----------

type BrowserSub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function savePushSubscription(sub: BrowserSub): Promise<{ ok: boolean }> {
  const me = await requireMember();
  const { endpoint, keys } = sub ?? {};
  if (!endpoint?.startsWith("https://") || !keys?.p256dh || !keys?.auth) return { ok: false };
  await run(
    `INSERT INTO push_subscriptions (endpoint, member_id, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    endpoint.slice(0, 1000), me.id, keys.p256dh.slice(0, 200), keys.auth.slice(0, 200),
  );
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const me = await requireMember();
  await run("DELETE FROM push_subscriptions WHERE endpoint = ? AND member_id = ?", String(endpoint), me.id);
}

export async function sendTestPush(): Promise<{ sent: number }> {
  const me = await requireMember();
  const sent = await sendToMember(me.id, {
    title: "👋 Reminders are working!",
    body: `Hi ${me.name}, you'll get a nudge when it's time for each item in your routine.`,
    url: "/today",
  });
  return { sent };
}

// ---------- Game rules: score weights + coins ----------

const RULE_NAMES: Record<keyof GameRules, string> = {
  weight_exercise: "exercise weight",
  weight_supplement: "supplement weight",
  weight_medicine: "medicine weight",
  weight_other: "own types weight",
  exercise_on_time: "exercise on time",
  exercise_late: "exercise late",
  supplement_on_time: "supplement on time",
  supplement_late: "supplement late",
  medicine_on_time: "medicine on time",
  medicine_late: "medicine late",
  other_on_time: "own types on time",
  other_late: "own types late",
  perfect_day: "Perfect Day",
  star_of_day: "Star of the Day",
  perfect_week: "Perfect Week",
  badge_first_step: "First Step",
  badge_streak_3: "On Fire",
  badge_streak_7: "Unstoppable",
  badge_streak_30: "Legend",
  badge_early_bird: "Early Bird",
  badge_perfect_pill: "Perfect Pill",
  badge_century: "Century",
  badge_champion: "Champion",
};

export async function saveGameRules(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const keys = Object.keys(DEFAULT_RULES) as (keyof GameRules)[];
  const invalid = keys.some((k) => {
    const v = String(fd.get(k) ?? "").trim();
    if (!/^\d+$/.test(v)) return true;
    return isWeightKey(k) ? Number(v) < 1 || Number(v) > MAX_WEIGHT : Number(v) > MAX_COINS_PER_RULE;
  });
  if (invalid) return fail(at("x.rulesRange", { w: MAX_WEIGHT, c: MAX_COINS_PER_RULE }));
  const next = cleanRules(Object.fromEntries(keys.map((k) => [k, fd.get(k)])));
  const before = await currentRules();
  const changes = keys.filter((k) => before[k] !== next[k]).map((k) => `${RULE_NAMES[k]} ${before[k]}→${next[k]}`);
  if (!changes.length) return ok(at("x.nothingChanged"));
  // Takes effect from today; scores and coins from earlier days stay as they are.
  await run(
    "INSERT OR REPLACE INTO game_rules (effective_date, rules, set_by) VALUES (?, ?, ?)",
    today(), JSON.stringify(next), admin.id,
  );
  await audit(admin.id, `Changed the rules: ${changes.join(", ")}`);
  refresh();
  return ok(at("x.rulesSaved"));
}

// ---------- Fair play: reports ----------

/** Tells every admin (except `skip`) about something waiting for them. */
async function tellAdmins(skip: number[], payload: { title: string; body: string }) {
  const admins = (await activeMembers()).filter((m) => m.is_admin && !skip.includes(m.id));
  await Promise.all(admins.map((a) => sendToMember(a.id, { ...payload, url: "/admin#attention" }).catch(() => 0)));
}

/** "They ticked it but didn't really do it": goes to the admins, who decide. */
export async function reportTick(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const t = translator(me.lang);
  const taskId = Number(fd.get("task_id"));
  const date = str(fd, "date", 10);
  const reason = str(fd, "reason", 200);
  const task = await get<Task>("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) return fail(t("report.notTicked"));
  if (task.member_id === me.id) return fail(t("report.self"));
  if (date > today() || date < addDays(today(), -REPORT_DAYS)) return fail(t("report.tooOld", { n: REPORT_DAYS }));
  if (!(await get("SELECT 1 FROM checkins WHERE task_id = ? AND date = ?", taskId, date))) return fail(t("report.notTicked"));
  const { changes } = await run(
    "INSERT OR IGNORE INTO reports (reporter_id, member_id, task_id, date, title, reason) VALUES (?, ?, ?, ?, ?, ?)",
    me.id, task.member_id, taskId, date, task.title, reason,
  );
  if (!changes) return fail(t("report.already"));
  const member = await getMember(task.member_id);
  await audit(me.id, `Reported ${member?.name ?? "someone"}'s tick of "${task.title}" (${date})`);
  await tellAdmins([task.member_id], { title: "🚩 A tick was reported", body: `${me.name} says ${member?.name ?? "someone"} didn't really do "${task.title}".` });
  refresh();
  return ok(t("report.sent"));
}

const MAX_ADJUST = 1000;

function coinsField(fd: FormData, key: string): number | null {
  const n = Number(str(fd, key, 5) || 0);
  return Number.isInteger(n) && n >= 0 && n <= MAX_ADJUST ? n : null;
}

/** An admin upholds a report (taking coins, giving the reporter some, maybe unticking it) or dismisses it. */
export async function resolveReport(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const decision = str(fd, "decision", 10);
  if (decision !== "uphold" && decision !== "dismiss") return fail(at("x.unknown"));
  const r = await get<Report>(
    "SELECT r.*, a.name AS reporter_name, b.name AS member_name FROM reports r JOIN members a ON a.id = r.reporter_id JOIN members b ON b.id = r.member_id WHERE r.id = ? AND r.status = 'open'",
    Number(fd.get("id")),
  );
  if (!r) return fail(at("x.handled"));
  if ((r.member_id === admin.id || r.reporter_id === admin.id) && (await otherActiveAdmins(admin.id)) > 0) {
    return fail(at("x.otherDecide"));
  }

  if (decision === "dismiss") {
    await run("UPDATE reports SET status = 'dismissed', resolved_at = ?, resolved_by = ? WHERE id = ?", nowStamp(), admin.id, r.id);
    await audit(admin.id, `Dismissed ${r.reporter_name}'s report about ${r.member_name}'s "${r.title}"`);
    refresh();
    return ok(at("x.dismissed"));
  }

  const penalty = coinsField(fd, "penalty");
  const reward = coinsField(fd, "reward");
  if (penalty === null || reward === null) return fail(at("x.adjustRange", { max: MAX_ADJUST }));
  const untick = fd.get("untick") === "on";
  const date = today();
  await batch(
    sql("UPDATE reports SET status = 'upheld', penalty = ?, reward = ?, resolved_at = ?, resolved_by = ? WHERE id = ?", penalty, reward, nowStamp(), admin.id, r.id),
    ...(penalty
      ? [sql("INSERT INTO coin_adjustments (member_id, amount, reason, date, created_by) VALUES (?, ?, ?, ?, ?)", r.member_id, -penalty, `Report upheld: "${r.title}" (${r.date})`, date, admin.id)]
      : []),
    ...(reward
      ? [sql("INSERT INTO coin_adjustments (member_id, amount, reason, date, created_by) VALUES (?, ?, ?, ?, ?)", r.reporter_id, reward, `Fair-play report about ${r.member_name}'s "${r.title}"`, date, admin.id)]
      : []),
    ...(untick ? [sql("DELETE FROM checkins WHERE task_id = ? AND date = ?", r.task_id, r.date)] : []),
  );
  await audit(
    admin.id,
    `Upheld ${r.reporter_name}'s report about ${r.member_name}'s "${r.title}": ${[untick && "unticked", penalty && `−${penalty} coins`, reward && `+${reward} to ${r.reporter_name}`].filter(Boolean).join(", ") || "no coin change"}`,
  );
  const member = await getMember(r.member_id);
  const mt = translator(member?.lang);
  await sendToMember(r.member_id, {
    title: mt("push.reportTitle"),
    body: mt("push.reportBody", { title: r.title, coins: penalty }),
    url: "/shop",
  }).catch(() => 0);
  if (reward) {
    const reporter = await getMember(r.reporter_id);
    await sendToMember(r.reporter_id, { title: translator(reporter?.lang)("push.thanksTitle"), body: translator(reporter?.lang)("push.coinsAdded", { n: reward }), url: "/shop" }).catch(() => 0);
  }
  refresh();
  return ok(
    at("x.reportDone", {
      what:
        [untick && at("x.unticked"), penalty && at("x.minusFor", { n: penalty, name: r.member_name }), reward && at("x.plusFor", { n: reward, name: r.reporter_name })]
          .filter(Boolean)
          .join(", ") || at("x.upheld"),
    }),
  );
}

// ---------- Helping each other ----------

/** "I helped Mom with her walk": asks the admins for a coin award. */
export async function askHelpAward(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMember();
  const t = translator(me.lang);
  const helpedId = Number(fd.get("helped_id"));
  const note = str(fd, "note", 200);
  if (helpedId === me.id) return fail(t("help.self"));
  const helped = await getMember(helpedId);
  if (!helped?.active) return fail(t("help.self"));
  if (note.length < 3) return fail(t("help.needNote"));
  const open = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM help_requests WHERE member_id = ? AND status = 'open'", me.id))!.n;
  if (open >= 5) return fail(t("help.tooMany"));
  await run("INSERT INTO help_requests (member_id, helped_id, note) VALUES (?, ?, ?)", me.id, helpedId, note);
  await audit(me.id, `Asked for a help award: helped ${helped.name} (${note})`);
  await tellAdmins([me.id], { title: "🤝 Help award request", body: `${me.name} helped ${helped.name}: ${note}` });
  refresh();
  return ok(t("help.sent"));
}

export async function resolveHelp(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const decision = str(fd, "decision", 10);
  if (decision !== "approve" && decision !== "decline") return fail(at("x.unknown"));
  const h = await get<HelpRequest>(
    "SELECT h.*, a.name AS member_name, b.name AS helped_name FROM help_requests h JOIN members a ON a.id = h.member_id JOIN members b ON b.id = h.helped_id WHERE h.id = ? AND h.status = 'open'",
    Number(fd.get("id")),
  );
  if (!h) return fail(at("x.handled"));
  if (h.member_id === admin.id && (await otherActiveAdmins(admin.id)) > 0) return fail(at("x.otherApprove"));
  if (decision === "decline") {
    await run("UPDATE help_requests SET status = 'declined', resolved_at = ?, resolved_by = ? WHERE id = ?", nowStamp(), admin.id, h.id);
    await audit(admin.id, `Declined ${h.member_name}'s help award (helped ${h.helped_name})`);
    refresh();
    return ok(at("x.declined"));
  }
  const coins = coinsField(fd, "coins");
  if (!coins) return fail(at("x.helpRange", { max: MAX_ADJUST }));
  await batch(
    sql("UPDATE help_requests SET status = 'approved', coins = ?, resolved_at = ?, resolved_by = ? WHERE id = ?", coins, nowStamp(), admin.id, h.id),
    sql("INSERT INTO coin_adjustments (member_id, amount, reason, date, created_by) VALUES (?, ?, ?, ?, ?)", h.member_id, coins, `Helped ${h.helped_name}: ${h.note}`, today(), admin.id),
  );
  await audit(admin.id, `Gave ${h.member_name} ${coins} coins for helping ${h.helped_name}`);
  const helper = await getMember(h.member_id);
  const ht = translator(helper?.lang);
  await sendToMember(h.member_id, { title: ht("push.helpTitle"), body: ht("push.coinsAdded", { n: coins }), url: "/shop" }).catch(() => 0);
  refresh();
  return ok(at("x.gave", { name: h.member_name, n: coins }));
}

// ---------- Tracking start & resets ----------

/** The day tracking starts: days before it don't count for scores, coins, streaks or badges. */
export async function setTrackingStart(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const date = str(fd, "date", 10);
  if (fd.get("clear") === "1") {
    await run("DELETE FROM settings WHERE key = 'tracking_start'");
    await audit(admin.id, "Counted everything again (no tracking start date)");
    refresh();
    return ok(at("x.countAll"));
  }
  if (!isDate(date)) return fail(at("x.pickDate"));
  if (date > addDays(today(), 366)) return fail(at("x.dateYear"));
  await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('tracking_start', ?)", date);
  await audit(admin.id, `Set tracking to start on ${date}`);
  refresh();
  return ok(at("x.trackingSet", { date: formatDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }, admin.lang) }));
}

/** On a server with a database file, keeps a copy before anything is wiped (Cloudflare D1 has its own Time Travel). */
async function backupBeforeReset(label: string): Promise<string | null> {
  if (onCloudflare()) return null;
  const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
  const path = process.getBuiltinModule("node:path") as typeof import("node:path");
  const dir = path.join(path.dirname(dbPath()), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `before-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  await run(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  return file;
}

const backedUp = (file: string | null, at: AT) => (file ? ` ${at("x.backup", { file: file.split(/[\\/]/).slice(-2).join("/") })}` : "");

/** Wipes one person's progress (ticks, coins, prizes, breaks, reports); their routine and profile stay. */
export async function resetMember(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const member = await getMember(Number(fd.get("id")));
  if (!member?.active) return fail(at("x.pickOne"));
  if (str(fd, "confirm", 40).toLowerCase() !== member.name.toLowerCase()) return fail(at("x.typeName", { name: member.name }));
  const file = await backupBeforeReset(`reset-${member.name.replace(/\W+/g, "") || member.id}`);
  const id = member.id;
  await batch(
    sql("DELETE FROM checkins WHERE member_id = ?", id),
    sql("DELETE FROM reminders_sent WHERE task_id IN (SELECT id FROM tasks WHERE member_id = ?)", id),
    sql("DELETE FROM redemptions WHERE member_id = ?", id),
    sql("DELETE FROM event_results WHERE member_id = ?", id),
    sql("DELETE FROM coin_adjustments WHERE member_id = ?", id),
    sql("DELETE FROM reports WHERE member_id = ? OR reporter_id = ?", id, id),
    sql("DELETE FROM help_requests WHERE member_id = ? OR helped_id = ?", id, id),
    sql("DELETE FROM away_periods WHERE member_id = ?", id),
    sql("UPDATE members SET tracking_start = ? WHERE id = ?", today(), id),
  );
  await audit(admin.id, `Reset ${member.name}'s progress`);
  refresh();
  return ok(at("x.resetOneDone", { name: member.name }) + backedUp(file, at));
}

/** Wipes everyone's progress; members, routines, rewards and rules stay. Tracking restarts today. */
export async function resetProgress(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  if (str(fd, "confirm", 20) !== "RESET") return fail(at("x.typeReset"));
  const file = await backupBeforeReset("reset-all");
  const date = today();
  await batch(
    sql("DELETE FROM checkins"),
    sql("DELETE FROM reminders_sent"),
    sql("DELETE FROM redemptions"),
    sql("DELETE FROM event_results"),
    sql("DELETE FROM event_periods"),
    sql("DELETE FROM coin_adjustments"),
    sql("DELETE FROM reports"),
    sql("DELETE FROM help_requests"),
    sql("DELETE FROM away_periods"),
    sql("UPDATE members SET tracking_start = NULL"),
    sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('tracking_start', ?)", date),
    sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('weekly_events_from', ?)", startOfWeek(date)),
  );
  await audit(admin.id, "Reset everyone's progress");
  refresh();
  return ok(at("x.resetAllDone") + backedUp(file, at));
}

/** Deletes everything and goes back to the first-run setup. */
export async function factoryReset(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const family = (await get<{ value: string }>("SELECT value FROM settings WHERE key = 'family_name'"))?.value ?? "";
  const typed = str(fd, "confirm", 80);
  if (!family || typed.toLowerCase() !== family.toLowerCase()) return fail(at("x.typeFamily", { family }));
  await backupBeforeReset("factory-reset");
  const members = await all<{ id: number }>("SELECT id FROM members");
  for (const m of members) await removePhoto(m.id).catch(() => {});
  await batch(
    ...[
      "checkins", "reminders_sent", "reports", "help_requests", "coin_adjustments", "redemptions", "event_results", "event_periods",
      "away_periods", "push_subscriptions", "login_attempts", "tasks", "rewards", "game_rules", "audit_log", "members",
    ].map((table) => sql(`DELETE FROM ${table}`)),
    // Keep the secrets (sign-in cookies and push keys), forget everything else.
    sql("DELETE FROM settings WHERE key NOT IN ('session_secret', 'vapid_keys')"),
  );
  await endSession();
  refresh();
  redirect("/");
}

// ---------- Gift coins ----------

/** An admin gives coins to one or more people, with a reason they'll see in their coin history. */
export async function giftCoins(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const at = adminText(admin.lang);
  const ids = [...new Set(fd.getAll("member_ids").map(Number))];
  const amount = Math.round(Number(fd.get("amount")));
  const reason = str(fd, "reason", 120);
  if (!ids.length) return fail(at("x.pickGift"));
  if (!(amount >= 1 && amount <= MAX_ADJUST)) return fail(at("x.giftRange", { max: MAX_ADJUST }));
  if (reason.length < 3) return fail(at("x.giftReason"));
  const members = (await activeMembers()).filter((m) => ids.includes(m.id));
  if (members.length !== ids.length) return fail(at("x.memberNotFound"));
  const date = today();
  await batch(
    ...members.map((m) =>
      sql("INSERT INTO coin_adjustments (member_id, amount, reason, date, created_by) VALUES (?, ?, ?, ?, ?)", m.id, amount, `🎁 ${reason}`, date, admin.id),
    ),
  );
  const names = nameList(members.map((m) => m.name), at("bk.and"));
  await audit(admin.id, `Gave ${amount} coins to ${nameList(members.map((m) => m.name))}: ${reason}`);
  await Promise.all(
    members.map((m) => {
      const mt = translator(m.lang);
      return sendToMember(m.id, { title: mt("push.giftTitle", { n: amount }), body: reason, url: "/shop" }).catch(() => 0);
    }),
  );
  refresh();
  return ok(at("x.gaveMany", { n: amount, names }));
}
