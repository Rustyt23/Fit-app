import { iconResponse } from "@/lib/icon";

// PNG icons for the web app manifest: /pwa-icon/192 and /pwa-icon/512.
// Generated once at build time, so hosting doesn't need to draw images.
export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  return iconResponse(size === "512" ? 512 : 192);
}
