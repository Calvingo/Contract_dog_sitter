import { prisma } from "@/lib/db";
export const runtime = "nodejs";
// Email clients load these public, opaque image URLs without a login cookie.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return new Response(null, { status: 404 });
  const image = await prisma.marketingImage.findUnique({ where: { id } });
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
