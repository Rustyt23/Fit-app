// PIN hashing with Web Crypto PBKDF2, which works the same in Node and on Cloudflare Workers.
// No project imports: scripts/seed-demo.mts uses this file directly.

// Cloudflare Workers allow at most 100,000 PBKDF2 iterations.
const ITERATIONS = 100_000;
const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Compares without leaking where the first difference is. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

/** Stored as "pbkdf2$<iterations>$<salt>$<hash>". */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(await pbkdf2(pin, salt, ITERATIONS))}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (stored.startsWith("pbkdf2$")) {
    const [, iter, salt, hash] = stored.split("$");
    return sameBytes(await pbkdf2(pin, fromB64url(salt), Number(iter)), fromB64url(hash));
  }
  // Older databases (before the Cloudflare-ready version) used scrypt "salt:hash".
  const [salt, hash] = stored.split(":");
  const { scryptSync } = await import("node:crypto");
  return sameBytes(new Uint8Array(scryptSync(pin, salt, 32)), Uint8Array.from(Buffer.from(hash, "hex")));
}

/** Old-format hashes get upgraded the next time the person logs in. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`pbkdf2$${ITERATIONS}$`);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
