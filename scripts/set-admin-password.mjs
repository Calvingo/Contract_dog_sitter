// Reads credentials from stdin. Never logs the password or its hash.
import { createRequire } from "node:module";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
try {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 8192) throw new Error("Input too long");
  }
  const value = JSON.parse(input);
  const email = String(value.email || "")
    .trim()
    .toLowerCase();
  const password = String(value.password || "").trim();
  const allowed = (process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  if (!email || !allowed.includes(email) || !password || password.length > 1024)
    throw new Error("Invalid credentials");
  if (process.env.ADMIN_PASSWORD)
    throw new Error("Environment override is active");
  const salt = randomBytes(16).toString("hex");
  const key = await promisify(scrypt)(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const passwordHash = `scrypt-v1:${salt}:${key.toString("hex")}`;
  await prisma.adminCredential.upsert({
    where: { email },
    create: { email, passwordHash },
    update: { passwordHash },
  });
  console.log("Admin password configured successfully.");
} catch {
  console.error(
    "Could not configure admin password. Check stdin JSON, the admin email allowlist, environment override, and database migrations.",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
