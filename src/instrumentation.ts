// Runs once when the server starts: kicks off the every-minute scheduler on your
// own computer / VPS. On Cloudflare Workers there's no long-running server, so a
// Cron Trigger calls /api/cron instead (see cloudflare/worker.ts).
export async function register() {
  const onCloudflare = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
  if (process.env.NEXT_RUNTIME === "nodejs" && !onCloudflare) {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
