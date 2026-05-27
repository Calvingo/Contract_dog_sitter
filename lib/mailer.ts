import dns from "node:dns";
import { lookup as dnsLookup } from "node:dns";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export const BRAND_NAME = "Silicon Paws Retreat";

/** Prefer IPv4 — avoids ENOTFOUND on some networks with broken IPv6 DNS */
dns.setDefaultResultOrder("ipv4first");
if (!process.env.DNS_SERVERS) {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
}

export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const ipv4Lookup = (
  hostname: string,
  _options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
) => {
  dnsLookup(hostname, { family: 4, hints: dns.ADDRCONFIG }, callback);
};

export function getSmtpHost(): string {
  return process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
}

export function createMailer() {
  const user = getEnv("GMAIL_USER");
  const pass = getEnv("GMAIL_APP_PASSWORD");
  const host = getSmtpHost();
  const port = Number(process.env.SMTP_PORT || (host.includes("gmail") ? "587" : "587"));
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: { user, pass },
    lookup: ipv4Lookup,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    tls: {
      servername: host,
      minVersion: "TLSv1.2",
    },
  } as SMTPTransport.Options);
}

export type SendMailOptions = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType?: string;
  }[];
};

/** Send via Gmail SMTP; surfaces clearer errors for common DNS/network failures */
export async function sendMail(options: SendMailOptions) {
  const transporter = createMailer();
  try {
    await transporter.sendMail(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
      throw new Error(
        `Cannot reach mail server (${getSmtpHost()}). ${formatSmtpHelp(message)}`
      );
    }
    throw error;
  }
}

function formatSmtpHelp(detail: string): string {
  const hints = [
    "Check your internet connection.",
    "Run `npm run dev` in macOS Terminal (not a restricted sandbox) if testing locally.",
    "In China or on strict networks, Gmail SMTP may be blocked — try VPN or set SMTP_HOST to an reachable relay.",
  ];
  return `${detail} — ${hints.join(" ")}`;
}

export function parseAdminEmails(): string[] {
  const raw = getEnv("ADMIN_EMAIL");
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}
