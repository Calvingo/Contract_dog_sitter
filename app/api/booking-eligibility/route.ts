import { NextResponse } from "next/server";
import { bookingEmailAllowed, BOOKING_UNAVAILABLE_MESSAGE } from "@/lib/platform/booking-blocklist";
import { allowRequest, requestIp } from "@/lib/platform/rate-limit";
export async function POST(request: Request) {
  if (!await allowRequest("booking-eligibility", requestIp(request), 30, 3600)) return NextResponse.json({error:"Please try again later."},{status:429});
  try {
    const {email} = await request.json();
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return NextResponse.json({error:"Enter a valid email."},{status:400});
    if (!await bookingEmailAllowed(email)) return NextResponse.json({error:BOOKING_UNAVAILABLE_MESSAGE},{status:409});
    return NextResponse.json({ok:true});
  } catch {return NextResponse.json({error:"Please try again later."},{status:503});}
}
