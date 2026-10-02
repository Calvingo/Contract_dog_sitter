import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { loadCustomerPrefill } from "@/lib/services/customer-prefill";
import { CustomerProfileError, saveCustomerAndPets } from "@/lib/services/customer-profile";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function PATCH(request: Request) {
  const session = await getCustomerSession();
  if (!session)
    return NextResponse.json(
      { error: "Sign in to save your profile.", authenticated: false },
      { status: 401, headers: privateHeaders },
    );
  const origin = request.headers.get("origin");
  // Next.js can use its internal hostname in request.url behind the local server.
  // The browser's Host header identifies the actual site receiving this request.
  const requestUrl = new URL(request.url);
  const expectedOrigin = `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
  if (origin && origin !== expectedOrigin)
    return NextResponse.json(
      { error: "This request must come from the booking website." },
      { status: 403, headers: privateHeaders },
    );
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json"))
    return NextResponse.json(
      { error: "Send profile details as JSON." },
      { status: 415, headers: privateHeaders },
    );
  // Bound payloads before parsing; profile fields have tighter service-level limits.
  const raw = await request.text();
  if (raw.length > 32000)
    return NextResponse.json(
      { error: "Profile details are too long." },
      { status: 413, headers: privateHeaders },
    );
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Enter valid profile details." },
      { status: 400, headers: privateHeaders },
    );
  }
  try {
    await saveCustomerAndPets(session.customerId, body);
    const data = await loadCustomerPrefill(session.customerId);
    if (!data)
      return NextResponse.json(
        { error: "Your account is no longer active.", authenticated: false },
        { status: 401, headers: privateHeaders },
      );
    return NextResponse.json(data, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof CustomerProfileError ? error.message : "Unable to save your profile. Please try again." },
      { status: error instanceof CustomerProfileError ? error.status : 500, headers: privateHeaders },
    );
  }
}
