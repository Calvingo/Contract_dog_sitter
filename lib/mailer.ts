import nodemailer from "nodemailer";

export const BRAND_NAME = "Silicon Paws Retreat";

export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function createMailer() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: getEnv("GMAIL_USER"),
      pass: getEnv("GMAIL_APP_PASSWORD"),
    },
  });
}

export function parseAdminEmails(): string[] {
  const raw = getEnv("ADMIN_EMAIL");
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}
