import { createHmac } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const SECRET = process.env.APP_SECRET;
const SEP = "~";

function sign(data) {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

function createToken(payload) {
  const full = { ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${data}${SEP}${sign(data)}`;
}

const token = createToken({
  email: process.env.GMAIL_USER,
  firstName: "Local",
  lastName: "Test",
  petName: "TestDog",
});

const base = process.env.APP_BASE_URL || "http://localhost:3000";
const q = (action) =>
  `${base}/decision?action=${action}&token=${encodeURIComponent(token)}`;

console.log("\n本地决策测试链接（会发真实邮件到 token 里的客户邮箱）：\n");
for (const action of ["accept", "reject", "meet_greet"]) {
  console.log(`[${action}]`);
  console.log(q(action));
  console.log("");
}
