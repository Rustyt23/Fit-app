import "server-only";
import { get, onCloudflare, run } from "./db";

// Profile photos. On Cloudflare they live in the R2 bucket bound as PHOTOS (see
// wrangler.jsonc). On your own computer, or if no bucket is bound, they stay in
// the database's photo column, so the database file remains a complete backup.

type R2Object = { arrayBuffer(): Promise<ArrayBuffer> };
type R2Bucket = {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
};

async function bucket(): Promise<R2Bucket | null> {
  if (!onCloudflare()) return null;
  const { cloudflareEnv } = await import("./db-d1");
  return ((await cloudflareEnv()).PHOTOS as R2Bucket | undefined) ?? null;
}

async function oldKey(memberId: number): Promise<string | null> {
  return (await get<{ photo_key: string | null }>("SELECT photo_key FROM members WHERE id = ?", memberId))?.photo_key ?? null;
}

export async function savePhoto(memberId: number, bytes: Uint8Array): Promise<void> {
  const r2 = await bucket();
  const previous = await oldKey(memberId);
  const version = Date.now();
  if (r2) {
    const key = `members/${memberId}/${version}.jpg`;
    await r2.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    await run("UPDATE members SET photo = NULL, photo_key = ?, photo_version = ? WHERE id = ?", key, version, memberId);
  } else {
    await run("UPDATE members SET photo = ?, photo_key = NULL, photo_version = ? WHERE id = ?", bytes, version, memberId);
  }
  if (previous && r2) await r2.delete(previous);
}

export async function removePhoto(memberId: number): Promise<void> {
  const previous = await oldKey(memberId);
  await run("UPDATE members SET photo = NULL, photo_key = NULL, photo_version = ? WHERE id = ?", Date.now(), memberId);
  const r2 = previous ? await bucket() : null;
  if (previous && r2) await r2.delete(previous);
}

export async function loadPhoto(memberId: number): Promise<Uint8Array | null> {
  const row = await get<{ photo: Uint8Array | null; photo_key: string | null }>(
    "SELECT photo, photo_key FROM members WHERE id = ?",
    memberId,
  );
  if (!row) return null;
  if (row.photo_key) {
    const obj = await (await bucket())?.get(row.photo_key);
    if (obj) return new Uint8Array(await obj.arrayBuffer());
  }
  return row.photo ?? null;
}
