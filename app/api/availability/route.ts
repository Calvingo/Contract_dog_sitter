import { findValidSubmissionEditToken } from "@/lib/submission-edit-token";
import { NextResponse } from "next/server";
import { availability } from "@/lib/platform/capacity";
import { dateRange, todayKey } from "@/lib/platform/rules";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start") || todayKey();
  const end = url.searchParams.get("end") || start;
  try {
    dateRange(start, end);
  } catch {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  try {
    const token = url.searchParams.get("editToken");
    const edit = token ? await findValidSubmissionEditToken(token) : null;
    if (token && !edit)
      return NextResponse.json(
        { error: "Edit link expired. Open a new link from your account." },
        { status: 403 },
      );
    const result = await availability(
      start,
      end,
      undefined,
      edit?.submissionId,
    );
    return NextResponse.json(
      {
        includePickupDay: result.includePickupDay,
        days: result.days.map(({ date, remaining, closed }) => ({
          date,
          remaining,
          closed,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Availability is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
