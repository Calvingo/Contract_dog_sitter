import { timingSafeEqual } from "node:crypto";
import { runMarketing } from "@/lib/marketing/worker";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const actual = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (
    secret.length < 32 ||
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runMarketing(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Marketing worker failed; check the admin delivery log." },
      { status: 500 },
    );
  }
}
