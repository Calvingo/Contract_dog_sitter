import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
export async function allowRequest(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = createHash("sha256")
    .update(`${scope}:${identity}:${bucket}`)
    .digest("hex");
  const entry = await prisma.requestRateLimit.upsert({
    where: { key },
    create: { key, expiresAt: new Date((bucket + 2) * windowSeconds * 1000) },
    update: { count: { increment: 1 } },
  });
  return entry.count <= limit;
}
export function requestIp(request: Request) {
  // Vercel overwrites this header at its proxy boundary. Do not trust arbitrary forwarding headers.
  return process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
    : "local";
}
