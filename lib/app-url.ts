/**
 * Base URL for links in emails. Prefer APP_BASE_URL on Vercel (server-only, not baked at build).
 */
export function getAppBaseUrl(): string {
  const candidates = [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];

  for (const raw of candidates) {
    if (raw?.trim()) {
      return raw.trim().replace(/\/$/, "");
    }
  }

  return "http://localhost:3000";
}
