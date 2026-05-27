import { NextResponse } from "next/server";
import {
  decisionActionLabel,
  sendDecisionEmail,
  type DecisionAction,
} from "@/lib/decision-emails";
import { verifyDecisionToken } from "@/lib/token";

const VALID_ACTIONS: DecisionAction[] = ["accept", "reject", "meet_greet"];

function resultPage(
  title: string,
  message: string,
  success: boolean
): string {
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
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const action = url.searchParams.get("action") as DecisionAction | null;

    if (!token || !action || !VALID_ACTIONS.includes(action)) {
      return new NextResponse(
        resultPage(
          "Invalid link",
          "This decision link is invalid. Please use the buttons in the admin email.",
          false
        ),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const payload = verifyDecisionToken(token);
    if (!payload) {
      return new NextResponse(
        resultPage(
          "Link expired or invalid",
          "This link has expired or is no longer valid. Please review the submission in your inbox.",
          false
        ),
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    await sendDecisionEmail(payload, action);

    const label = decisionActionLabel(action);
    const owner = `${payload.firstName} ${payload.lastName}`.trim();

    return new NextResponse(
      resultPage(
        `${label}`,
        `A notification email has been sent to ${owner} (${payload.email}) regarding ${payload.petName}.`,
        true
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (error) {
    console.error("Decision error:", error);
    return new NextResponse(
      resultPage(
        "Something went wrong",
        "We could not send the notification email. Please try again or contact the customer directly.",
        false
      ),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
