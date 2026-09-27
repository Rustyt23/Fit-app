// PINs and web push, checked against independent implementations.
import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error: no type definitions for http_ece (the reference RFC 8291 implementation)
import ece from "http_ece";
import { hashPin, needsRehash, verifyPin } from "@/lib/pin";
import { encryptPayload, generateVapidKeys, sendPush } from "@/lib/webpush";

afterEach(() => vi.unstubAllGlobals());

describe("PINs", () => {
  it("verifies the right PIN and rejects a wrong one", async () => {
    const h = await hashPin("0000");
    expect(await verifyPin("0000", h)).toBe(true);
    expect(await verifyPin("0001", h)).toBe(false);
  });
  it("never stores the PIN itself, and salts every hash", async () => {
    const [a, b] = [await hashPin("4826"), await hashPin("4826")];
    expect(a).not.toContain("4826");
    expect(a).not.toBe(b);
  });
  it("still accepts PINs saved by older versions, and flags them for upgrade", async () => {
    const salt = crypto.randomBytes(16).toString("hex");
    const legacy = `${salt}:${crypto.scryptSync("5931", salt, 32).toString("hex")}`;
    expect(await verifyPin("5931", legacy)).toBe(true);
    expect(await verifyPin("5930", legacy)).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
    expect(needsRehash(await hashPin("5931"))).toBe(false);
  });
});

describe("web push", () => {
  const browser = crypto.createECDH("prime256v1");
  browser.generateKeys();
  const auth = crypto.randomBytes(16);
  const sub = { endpoint: "https://push.example.com/abc", p256dh: browser.getPublicKey("base64url"), auth: auth.toString("base64url") };

  it("encrypts so a standard implementation can decrypt it (RFC 8291)", async () => {
    const msg = JSON.stringify({ title: "💊 दवा का समय", body: "BP tablet" });
    const body = await encryptPayload(sub, msg);
    const plain = ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: browser, authSecret: auth.toString("base64url") });
    expect(plain.toString()).toBe(msg);
  });

  it("signs a valid VAPID token for the push service (RFC 8292)", async () => {
    const keys = await generateVapidKeys();
    let headers = new Headers();
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      headers = new Headers(init.headers);
      return new Response(null, { status: 201 });
    });
    expect(await sendPush(sub, "hi", keys, "mailto:test@example.com")).toBe(201);

    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(headers.get("authorization")!)!;
    const [h, c, s] = token.split(".");
    const pub = Buffer.from(k, "base64url");
    const key = crypto.createPublicKey({
      key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") },
      format: "jwk",
    });
    expect(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(c, "base64url").toString()).aud).toBe("https://push.example.com");
    expect(headers.get("content-encoding")).toBe("aes128gcm");
  });
});
