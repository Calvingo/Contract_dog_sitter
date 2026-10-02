import { createRequire } from "node:module";
import dns from "node:dns";
import nodemailer from "nodemailer";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
dns.setDefaultResultOrder("ipv4first");
if (process.env.DNS_SERVERS)
  dns.setServers(process.env.DNS_SERVERS.split(",").map((s) => s.trim()));
const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
const port = Number(process.env.SMTP_PORT || "587");
const secure = process.env.SMTP_SECURE === "true" || port === 465;
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.error("SMTP credentials are missing.");
  process.exit(1);
}
const transport = nodemailer.createTransport({
  host,
  port,
  secure,
  requireTLS: !secure && port === 587,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000,
  tls: { servername: host, minVersion: "TLSv1.2" },
});
try {
  await transport.verify();
  console.log(
    "SMTP connection and authentication verified. No email was sent.",
  );
} catch (error) {
  console.error(
    `SMTP verification failed (${error.code || "connection/authentication error"}). Check the existing mailbox credentials and network access.`,
  );
  process.exitCode = 1;
} finally {
  transport.close();
}
