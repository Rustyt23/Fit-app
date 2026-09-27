import { loadPhoto } from "@/lib/photos";

// Profile photos (from R2 on Cloudflare, or the database). The URL carries a version
// (?v=...) that changes with every upload, so browsers can cache forever.
export async function GET(_req: Request, ctx: RouteContext<"/api/photo/[id]">) {
  const { id } = await ctx.params;
  const photo = await loadPhoto(Number(id));
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
