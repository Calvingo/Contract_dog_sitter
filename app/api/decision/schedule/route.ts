import { NextResponse } from "next/server";
import {
  decisionResultMessage,
  processMeetGreetSchedule,
} from "@/lib/decision-handler";
import { resultPage } from "@/lib/decision-result-html";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const scheduledAt = String(form.get("scheduledAt") || "");

  try {
    const result = await processMeetGreetSchedule({
      token,
      scheduledAt,
    });
    const { title, message, success } = decisionResultMessage(result);

    return new NextResponse(resultPage(title, message, success), {
      status: result.ok ? 200 : result.status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return new NextResponse(
      resultPage(
        "Something went wrong",
        `We could not send the meet & greet email. (${detail})`,
        false
      ),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
