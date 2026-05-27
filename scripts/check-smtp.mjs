import {
  lookup,
  resolve4,
  setDefaultResultOrder,
  setServers,
} from "node:dns/promises";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {
  console.warn("No .env.local found");
}

const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";

setDefaultResultOrder("ipv4first");
setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

console.log(`Checking SMTP host: ${host}\n`);

try {
  const ips = await resolve4(host);
  console.log("resolve4:", ips.join(", "));
} catch (err) {
  console.error("resolve4 FAILED:", err.message);
  process.exit(1);
}

try {
  const result = await lookup(host, { family: 4 });
  console.log("lookup (IPv4):", result.address);
} catch (err) {
  console.error("lookup FAILED:", err.message);
  process.exit(1);
}

console.log("\nDNS OK. If decision emails still fail, restart dev with: npm run dev");
