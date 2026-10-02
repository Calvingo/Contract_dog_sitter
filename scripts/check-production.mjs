import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const failures = [],
  warnings = [];
const required = [
  "DATABASE_URL",
  "DIRECT_URL",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "ADMIN_EMAIL",
];
for (const key of required)
  if (!process.env[key]?.trim()) failures.push(`${key} is missing`);
for (const key of ["APP_SECRET", "ADMIN_PASSWORD"])
  if ((process.env[key] || "").length < 16)
    failures.push(`${key} must contain at least 16 characters`);
try {
  const u = new URL(process.env.APP_BASE_URL || "");
  if (
    u.protocol !== "https:" ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.username ||
    u.password ||
    ["localhost", "127.0.0.1"].includes(u.hostname)
  )
    throw new Error();
} catch {
  failures.push("APP_BASE_URL must be the public HTTPS origin");
}
for (const key of ["DATABASE_URL", "DIRECT_URL"])
  try {
    const u = new URL(process.env[key]);
    if (
      !["postgres:", "postgresql:"].includes(u.protocol) ||
      ["localhost", "127.0.0.1"].includes(u.hostname)
    )
      throw new Error();
  } catch {
    failures.push(
      `${key} must point to the intended production PostgreSQL database`,
    );
  }
const marketingRequired = ["MARKETING_POSTAL_ADDRESS"];
for (const key of marketingRequired)
  if (!process.env[key]?.trim())
    (process.env.MARKETING_ENABLED === "true" ? failures : warnings).push(
      `${key} is required to enable promotions`,
    );
for (const key of ["MARKETING_TOKEN_SECRET", "CRON_SECRET"])
  if ((process.env[key] || "").length < 32)
    (process.env.MARKETING_ENABLED === "true" ? failures : warnings).push(
      `${key} requires 32+ characters before enabling promotions`,
    );
console.log(
  `Production configuration: ${failures.length ? "NOT READY" : "core booking configuration present"}`,
);
console.log(
  `Promotional delivery: ${process.env.MARKETING_ENABLED === "true" ? "enabled" : "disabled"}`,
);
for (const value of failures) console.log(`FAIL ${value}`);
for (const value of warnings) console.log(`NOTE ${value}`);
console.log(
  "This check does not connect to the database, verify the mailbox, send email, or deploy anything.",
);
process.exitCode = failures.length ? 1 : 0;
