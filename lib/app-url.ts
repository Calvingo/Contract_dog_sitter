/**
 * Base URL for links in emails. Prefer APP_BASE_URL on Vercel (server-only, not baked at build).
 */
const PLACEHOLDER_VALUES = new Set([
  "NEXT_PUBLIC_APP_URL",
  "APP_BASE_URL",
  "your-app.vercel.app",
  "https://your-app.vercel.app",
]);

function isValidHttpUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed)) return false;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (!url.hostname || url.hostname.includes(" ")) return false;
    // Reject env var names accidentally pasted as host
    if (url.hostname.toUpperCase() === url.hostname && url.hostname.includes("_")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

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
    if (raw?.trim() && isValidHttpUrl(raw)) {
      return normalizeUrl(raw);
    }
  }

  return "http://localhost:3000";
}

/** For /api/health — surfaces misconfiguration without breaking link generation */
export function getAppBaseUrlDiagnostics(): {
  appBaseUrl: string;
  appBaseUrlSource: string;
  appBaseUrlMisconfigured: boolean;
} {
  const checks: { name: string; raw?: string }[] = [
    { name: "APP_BASE_URL", raw: process.env.APP_BASE_URL },
    { name: "NEXT_PUBLIC_APP_URL", raw: process.env.NEXT_PUBLIC_APP_URL },
    {
      name: "VERCEL_PROJECT_PRODUCTION_URL",
      raw: process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined,
    },
    {
      name: "VERCEL_URL",
      raw: process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : undefined,
    },
  ];

  for (const { name, raw } of checks) {
    if (raw?.trim() && isValidHttpUrl(raw)) {
      return {
        appBaseUrl: normalizeUrl(raw),
        appBaseUrlSource: name,
        appBaseUrlMisconfigured: false,
      };
    }
  }

  const firstRaw = process.env.APP_BASE_URL?.trim();
  const misconfigured = Boolean(
    firstRaw && (PLACEHOLDER_VALUES.has(firstRaw) || !isValidHttpUrl(firstRaw))
  );

  return {
    appBaseUrl: getAppBaseUrl(),
    appBaseUrlSource: misconfigured ? "APP_BASE_URL_INVALID" : "localhost_fallback",
    appBaseUrlMisconfigured: misconfigured,
  };
}
