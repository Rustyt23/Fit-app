import { tick } from "@/lib/scheduler";

// Called every minute by the Cloudflare Cron Trigger (cloudflare/worker.ts).
// Protected by CRON_SECRET so nobody else can trigger it.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  await tick();
  return new Response("ok");
}
