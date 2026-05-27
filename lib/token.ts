import { createHmac, timingSafeEqual } from "crypto";

export type DecisionTokenPayload = {
  email: string;
  firstName: string;
  lastName: string;
  petName: string;
  exp: number;
};

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("APP_SECRET must be set (min 16 characters)");
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createDecisionToken(
  payload: Omit<DecisionTokenPayload, "exp">
): string {
  const full: DecisionTokenPayload = {
    ...payload,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyDecisionToken(token: string): DecisionTokenPayload | null {
  try {
    const [data, signature] = token.split(".");
    if (!data || !signature) return null;

    const expected = sign(data);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    ) as DecisionTokenPayload;

    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.email || !payload.petName) return null;

    return payload;
  } catch {
    return null;
  }
}

export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
