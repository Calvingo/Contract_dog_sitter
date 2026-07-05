import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_SESSION_COOKIE = "spr_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SEP = ".";
const DEFAULT_ADMIN_PASSWORD = "Pocky&mia";

type AdminSessionPayload = {
  email: string;
  exp: number;
};

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ADMIN_SESSION_SECRET or APP_SECRET must be set");
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
}

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
}

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.trim().toLowerCase());
}

function secureCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function verifyAdminCredentials(email: string, password: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();
  if (!normalizedEmail || !normalizedPassword || !isAdminEmail(normalizedEmail)) {
    return false;
  }
  return secureCompare(normalizedPassword, getAdminPassword());
}

function createAdminSessionToken(email: string): string {
  const payload: AdminSessionPayload = {
    email: email.trim().toLowerCase(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}${SEP}${sign(data)}`;
}

function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
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
    ) as AdminSessionPayload;

    if (!payload.email || payload.exp < Date.now()) return null;
    if (!isAdminEmail(payload.email)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setAdminSession(email: string) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return raw ? verifyAdminSessionToken(raw) : null;
}
