import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const CUSTOMER_SESSION_COOKIE = "spr_customer_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEP = ".";

type CustomerSessionPayload = {
  customerId: string;
  exp: number;
};

function getSessionSecret(): string {
  const secret = process.env.CUSTOMER_SESSION_SECRET || process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("CUSTOMER_SESSION_SECRET or APP_SECRET must be set");
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
}

function createCustomerSessionToken(customerId: string): string {
  const payload: CustomerSessionPayload = {
    customerId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}${SEP}${sign(data)}`;
}

function verifyCustomerSessionToken(token: string): CustomerSessionPayload | null {
  try {
    const sepIndex = token.lastIndexOf(SEP);
    if (sepIndex <= 0) return null;

    const data = token.slice(0, sepIndex);
    const signature = token.slice(sepIndex + 1);
    const expected = sign(data);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    ) as CustomerSessionPayload;

    if (!payload.customerId || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setCustomerSession(customerId: string) {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, createCustomerSessionToken(customerId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearCustomerSession() {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
}

export async function getCustomerSession(): Promise<CustomerSessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  return raw ? verifyCustomerSessionToken(raw) : null;
}

export function createRawLoginToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashLoginToken(token: string): string {
  return createHmac("sha256", getSessionSecret()).update(token).digest("base64url");
}
