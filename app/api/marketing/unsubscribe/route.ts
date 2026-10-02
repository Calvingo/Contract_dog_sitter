import { unsubscribe } from "@/lib/marketing/unsubscribe";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!(await unsubscribe(token)))
    return new Response("Invalid unsubscribe link.", { status: 400 });
  return new Response("You have unsubscribed from promotional emails.", {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
// A crawler/prefetch GET never changes consent.
export async function GET(request: Request) {
  const target = new URL("/unsubscribe", request.url);
  target.searchParams.set(
    "token",
    new URL(request.url).searchParams.get("token") || "",
  );
  return Response.redirect(target, 303);
}
