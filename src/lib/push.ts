import "server-only";
import { all, get, run } from "./db";
import { generateVapidKeys, sendPush, type VapidKeys } from "./webpush";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** VAPID keys identify this server to the browsers' push services. Generated once and kept in the database. */
export async function vapidKeys(): Promise<VapidKeys> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'vapid_keys'");
  if (row) return JSON.parse(row.value);
  await run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid_keys', ?)", JSON.stringify(await generateVapidKeys()));
  return JSON.parse((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'vapid_keys'"))!.value);
}

type Sub = { endpoint: string; p256dh: string; auth: string };

/** Sends to every device the member has turned reminders on for. Returns how many got it. */
export async function sendToMember(memberId: number, payload: PushPayload): Promise<number> {
  const subs = await all<Sub>("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ?", memberId);
  if (!subs.length) return 0;
  const keys = await vapidKeys();
  const subject = process.env.VAPID_SUBJECT ?? "mailto:family-fit@example.com";
  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        const status = await sendPush(s, JSON.stringify(payload), keys, subject);
        // The browser unsubscribed or the app was uninstalled: forget this device.
        if (status === 404 || status === 410) await run("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint);
        else if (status >= 300) console.error("[push] push service answered", status);
        return status < 300;
      } catch (e) {
        console.error("[push] send failed", e);
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}
