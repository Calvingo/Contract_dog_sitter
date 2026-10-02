import { getAppBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { createRawLoginToken, hashLoginToken } from "./customer-session";

const EMAIL_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const EMAIL_LINK_HASH_PREFIX = "customer-email:";

export function isCustomerEmailDestination(path: string): boolean {
  return (
    ["/account", "/account/profile", "/account/dogs", "/book"].includes(path) ||
    /^\/account\/bookings\/[a-zA-Z0-9_-]+$/.test(path) ||
    /^\/book\?editToken=[a-zA-Z0-9_-]+$/.test(path)
  );
}

function emailLinkHash(token: string, next: string): string {
  // Separate reusable email links from the one-time, short-lived login flow.
  // Bind the destination too, so modifying a link invalidates it.
  return EMAIL_LINK_HASH_PREFIX + hashLoginToken(JSON.stringify([token, next]));
}

export async function createCustomerEmailUrl(email: string, destination: string) {
  const base = getAppBaseUrl();
  const target = new URL(destination, base);
  const next = target.pathname + target.search;
  if (
    target.origin !== new URL(base).origin ||
    target.hash ||
    !isCustomerEmailDestination(next)
  ) {
    throw new Error("Invalid customer email destination");
  }
  const token = createRawLoginToken();
  await prisma.loginToken.create({
    data: {
      email: email.trim().toLowerCase(),
      tokenHash: emailLinkHash(token, next),
      expiresAt: new Date(Date.now() + EMAIL_LINK_TTL_MS),
    },
  });
  const params = new URLSearchParams({ token, next });
  return `${base}/api/auth/email-entry?${params}`;
}

export async function findCustomerEmailLink(token: string, next: string) {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(token) || !isCustomerEmailDestination(next))
    return null;
  const link = await prisma.loginToken.findUnique({
    where: { tokenHash: emailLinkHash(token, next) },
  });
  if (!link || link.usedAt || link.expiresAt.getTime() <= Date.now()) return null;
  return link;
}
