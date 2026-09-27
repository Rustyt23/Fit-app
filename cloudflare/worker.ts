// Cloudflare Worker entry: the Next.js app (built by `opennextjs-cloudflare build`)
// plus a Cron Trigger that runs the scheduler every minute (reminders, closing
// weekly/monthly events, announcing winners).
// @ts-expect-error: created by `opennextjs-cloudflare build`
import handler from "../.open-next/worker.js";

type Env = { CRON_SECRET?: string };
type Ctx = { waitUntil(p: Promise<unknown>): void };

const worker = {
  fetch: handler.fetch,

  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const req = new Request("https://cron.internal/api/cron", {
      method: "POST",
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
    });
    ctx.waitUntil(
      handler.fetch(req, env, ctx).then(async (res: Response) => {
        if (!res.ok) console.error("[cron]", res.status, await res.text());
      }),
    );
  },
};

export default worker;
