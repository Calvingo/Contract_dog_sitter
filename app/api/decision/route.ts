import { NextResponse } from "next/server";
import {
  decisionResultMessage,
  processDecision,
} from "@/lib/decision-handler";
import { resultPage, schedulePage } from "@/lib/decision-result-html";

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

    if (result.ok && result.requiresScheduling) {
      return new NextResponse(
        schedulePage({
          title,
          message,
          token: result.token,
          alreadySent: result.alreadySent,
        }),
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
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
