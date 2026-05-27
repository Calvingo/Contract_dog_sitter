import { NextResponse } from "next/server";
import {
  decisionResultMessage,
  processDecision,
} from "@/lib/decision-handler";

function resultPage(title: string, message: string, success: boolean): string {
  const color = success ? "#16a34a" : "#dc2626";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="font-family:Arial,sans-serif;background:#fff5f0;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center;">
    <div style="font-size:48px;color:${color};margin-bottom:16px;">${success ? "✓" : "✕"}</div>
    <h1 style="font-size:22px;color:#1c1917;margin:0 0 12px;">${title}</h1>
    <p style="color:#57534e;line-height:1.6;margin:0;">${message}</p>
  </div>
</body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  console.info("[decision-api] request", {
    action,
    hasToken: Boolean(token),
    host: url.host,
  });

  try {
    const result = await processDecision(token, action);
    const { title, message, success } = decisionResultMessage(result);

    if (!result.ok) {
      console.warn("[decision-api] failed", { status: result.status, title });
    } else {
      console.info("[decision-api] success", {
        action: result.action,
        to: result.email,
      });
    }

    return new NextResponse(resultPage(title, message, success), {
      status: result.ok ? 200 : result.status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    console.error("[decision-api] error", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return new NextResponse(
      resultPage(
        "Something went wrong",
        `We could not send the notification email. (${message}) Check APP_SECRET and Gmail settings on Vercel.`,
        false
      ),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
