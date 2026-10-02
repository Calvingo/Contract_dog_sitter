import { prisma } from "@/lib/db";
export function marketingConfig(
  settings?: { postalAddress: string; enabled: boolean } | null,
) {
  const from =
    process.env.MARKETING_FROM?.trim() ||
    (process.env.GMAIL_USER
      ? `Silicon Paws Retreat <${process.env.GMAIL_USER.trim()}>`
      : "");
  const address =
    settings?.postalAddress.trim() ||
    process.env.MARKETING_POSTAL_ADDRESS?.trim() ||
    "";
  const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/$/, "") || "";
  const missing: string[] = [];
  if (!process.env.GMAIL_USER) missing.push("GMAIL_USER");
  if (!process.env.GMAIL_APP_PASSWORD) missing.push("GMAIL_APP_PASSWORD");
  if (
    !from ||
    /[\r\n]/.test(from) ||
    !/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/.test(from)
  )
    missing.push("MARKETING_FROM");
  if (!address) missing.push("MARKETING_POSTAL_ADDRESS");
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error();
  } catch {
    missing.push("APP_BASE_URL (public HTTPS origin)");
  }
  const mailReady = missing.length === 0;
  if ((process.env.MARKETING_TOKEN_SECRET || "").length < 32)
    missing.push("MARKETING_TOKEN_SECRET (32+ characters)");
  if ((process.env.CRON_SECRET || "").length < 32)
    missing.push("CRON_SECRET (32+ characters)");
  return {
    from,
    address,
    baseUrl,
    missing,
    mailReady,
    environmentPaused: process.env.MARKETING_ENABLED === "false",
    enabled:
      process.env.MARKETING_ENABLED === "false"
        ? false
        : (settings?.enabled ?? process.env.MARKETING_ENABLED === "true"),
    ready: missing.length === 0,
  };
}

export async function getMarketingConfig() {
  return marketingConfig(
    await prisma.marketingSettings.findUnique({ where: { id: "default" } }),
  );
}
