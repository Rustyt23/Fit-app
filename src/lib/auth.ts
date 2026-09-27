import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run } from "./db";
import { getMember, type Member } from "./data";
import { b64url, fromB64url, sameBytes } from "./pin";

const COOKIE = "ff_session";
const MAX_AGE_DAYS = 60;
const enc = new TextEncoder();

async function secret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const existing = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'session_secret'");
  if (existing) return existing.value;
  const value = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await run("INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)", value);
  return (await get<{ value: string }>("SELECT value FROM settings WHERE key = 'session_secret'"))!.value;
}

async function sign(payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(await secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export async function startSession(memberId: number) {
  const expires = Date.now() + MAX_AGE_DAYS * 86400_000;
  const payload = `${memberId}.${expires}`;
  (await cookies()).set(COOKIE, `${payload}.${b64url(await sign(payload))}`, {
    httpOnly: true,
    sameSite: "lax",
    // Off by default so the app works over plain http on the home network.
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: MAX_AGE_DAYS * 86400,
    path: "/",
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The logged-in member (checked once per request). */
export const currentMember = cache(async (): Promise<Member | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, expires, sig] = raw.split(".");
  if (!id || !expires || !sig) return null;
  try {
    if (!sameBytes(fromB64url(sig), await sign(`${id}.${expires}`))) return null;
  } catch {
    return null; // malformed cookie (e.g. from the old hex format): just log in again
  }
  if (Number(expires) < Date.now()) return null;
  const member = await getMember(Number(id));
  return member?.active ? member : null;
});

export async function requireMember(): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect("/login");
  return member;
}

export async function requireAdmin(): Promise<Member> {
  const member = await requireMember();
  if (!member.is_admin) redirect("/today");
  return member;
}

// Brute-force guard for 4-digit PINs: 5 wrong tries locks that member for 2 minutes.
// Kept in the database so it holds across restarts and Cloudflare Worker instances.
const MAX_FAILURES = 5;
const LOCK_MS = 2 * 60_000;

export async function lockedFor(memberId: number): Promise<number> {
  const row = await get<{ locked_until: number }>("SELECT locked_until FROM login_attempts WHERE member_id = ?", memberId);
  return row && row.locked_until > Date.now() ? Math.ceil((row.locked_until - Date.now()) / 1000) : 0;
}

export async function recordFailure(memberId: number) {
  await run(
    `INSERT INTO login_attempts (member_id, failures, locked_until) VALUES (?, 1, 0)
     ON CONFLICT(member_id) DO UPDATE SET failures = failures + 1`,
    memberId,
  );
  await run(
    "UPDATE login_attempts SET failures = 0, locked_until = ? WHERE member_id = ? AND failures >= ?",
    Date.now() + LOCK_MS, memberId, MAX_FAILURES,
  );
}

export async function clearFailures(memberId: number) {
  await run("DELETE FROM login_attempts WHERE member_id = ?", memberId);
}
