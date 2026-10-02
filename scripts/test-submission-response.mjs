import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

if (!process.env.TEST_DATABASE_URL) {
  console.log("SKIP submission response integration test (set TEST_DATABASE_URL)");
  process.exit(0);
}
const url = new URL(process.env.TEST_DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55439", "Use isolated local test database only");
Object.assign(process.env, { DATABASE_URL: url.href, DIRECT_URL: url.href, APP_SECRET: "response-test-only" });
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url), ts = require("typescript");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith("@/") ? resolve(root, request.slice(2)) : request, ...args);
};
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const nextServer = require("next/server");
const pending = [], sent = [];
let mailDelay = 0, failMail = false, failSchedule = false, allow = true;
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === "nodemailer") throw new Error("Real SMTP is forbidden in this test");
  if (request === "next/server") return { ...nextServer, after: (callback) => {
    if (failSchedule) throw new Error("Simulated lifecycle scheduling failure");
    pending.push(callback);
  } };
  const path = Module._resolveFilename(request, parent);
  if (path === resolve(root, "lib/email.ts")) return { sendSubmissionEmails: async (...values) => {
    await delay(mailDelay);
    if (failMail) throw new Error("Simulated PDF/mail failure");
    sent.push(values);
  } };
  if (path === resolve(root, "lib/auth/customer-session.ts")) return { getCustomerSession: async () => null, setCustomerSession: async () => true };
  if (path === resolve(root, "lib/platform/rate-limit.ts")) return { allowRequest: async () => allow, requestIp: () => "127.0.0.1" };
  return originalLoad.call(this, request, parent, ...args);
};
const { prisma } = require("../lib/db.ts");
const { initialFormValues, prescreenQuestions } = require("../lib/form-config.ts");
const { createSubmissionEditToken } = require("../lib/submission-edit-token.ts");
const { POST: submit } = require("../app/api/submit/route.ts");
const { POST: edit } = require("../app/api/submission/edit/route.ts");
const email = `response-test-${Date.now()}@example.test`;
const values = {
  ...initialFormValues, ...Object.fromEntries(prescreenQuestions.map(q => [q.name, "no"])),
  email, firstName: "Response", lastName: "Test", phone: "5550100101", backupContact: "wechat", wechatId: "test",
  emergencyContactName: "Emergency Test", emergencyContactPhone: "5550100102",
  petName: "Test Dog", petBreed: "Corgi", petWeightLb: "20", petAgeYears: "3",
  dropoffDate: "2092-08-01", pickupDate: "2092-08-03", dropoffTime: "10:00", pickupTime: "11:00",
  agreed: true, signature: "data:image/png;base64,aGVsbG8=",
};
const request = (body) => new Request("http://localhost/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const originalError = console.error;
try {
  mailDelay = 12000;
  const started = performance.now();
  const response = await submit(request(values));
  const elapsed = performance.now() - started;
  assert.equal(response.status, 200);
  assert.ok(elapsed < 5000, `Submit took ${elapsed}ms`);
  const result = await response.json();
  assert.equal(result.emailPending, true);
  assert.equal(result.emailWarning, false);
  assert.equal(sent.length, 0, "Mail has not run before the response");
  assert.equal(pending.length, 1);
  assert.match(response.headers.get("server-timing"), /booking;dur=/);
  assert.ok(await prisma.submission.findUnique({ where: { id: result.submissionId } }), "Booking committed before success");
  const backgroundStarted = performance.now();
  await pending.shift()();
  const backgroundElapsed = performance.now() - backgroundStarted;
  assert.equal(sent.length, 1);
  assert.equal(sent[0][2], result.submissionId);
  assert.equal(sent[0][3].revision, 1);
  assert.ok(sent[0][3].quote.totalPrice > 0);
  console.log(`New submission response: ${elapsed.toFixed(0)}ms; simulated slow mail background: ${backgroundElapsed.toFixed(0)}ms`);

  mailDelay = 0;
  const token = await createSubmissionEditToken(result.submissionId);
  const editStarted = performance.now();
  const edited = await edit(request({ token, values: { ...values, firstName: "Corrected" } }));
  assert.equal(edited.status, 200);
  const editResult = await edited.json();
  assert.equal(editResult.emailPending, true);
  assert.equal(editResult.revision, 2);
  assert.equal(sent.length, 1);
  assert.ok(performance.now() - editStarted < 5000);
  await pending.shift()();
  assert.equal(sent[1][0].firstName, "Corrected");
  assert.equal(sent[1][3].revision, 2);
  assert.equal(sent[1][3].isUpdate, true);

  assert.equal((await submit(request({ ...values, agreed: false }))).status, 400);
  assert.equal((await edit(request({ token: "bad", values }))).status, 403);
  allow = false;
  assert.equal((await submit(request(values))).status, 429);
  allow = true;
  assert.equal(pending.length, 0, "Rejected requests schedule no email");

  console.error = () => {};
  failMail = true;
  const failedMail = await edit(request({ token, values }));
  assert.equal(failedMail.status, 200);
  await pending.shift()();
  assert.ok(await prisma.emailLog.findFirst({ where: { submissionId: result.submissionId, status: "FAILED" } }), "Background failure remains visible to admin");
  failSchedule = true;
  const failedSchedule = await edit(request({ token, values }));
  assert.equal(failedSchedule.status, 200, "Scheduling failure cannot undo saved booking");
  assert.equal((await failedSchedule.json()).emailWarning, true);
  assert.equal(pending.length, 0);
  console.log("PASS: new/edit responses, committed data, background receipt, failure logging, validation and scheduling fallback");
} finally {
  console.error = originalError;
  await prisma.emailLog.deleteMany({ where: { to: email } });
  await prisma.submission.deleteMany({ where: { customer: { email } } });
  await prisma.customer.deleteMany({ where: { email } });
  await prisma.$disconnect();
}
