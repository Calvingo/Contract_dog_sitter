import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(
    this,
    request.startsWith("@/") ? resolve(root, request.slice(2)) : request,
    ...args,
  );
};
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
if (!process.env.TEST_DATABASE_URL) {
  console.log("Set TEST_DATABASE_URL to run the isolated booking-entry tests.");
  process.exit(0);
}
const url = new URL(process.env.TEST_DATABASE_URL);
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55439",
);
Object.assign(process.env, {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  APP_SECRET: "platform-local-test-secret-only",
  ADMIN_SESSION_SECRET: "platform-local-test-secret-only",
  ADMIN_EMAIL: "admin@example.test",
  ADMIN_PASSWORD: "",
  GMAIL_USER: "admin@example.test",
});
const { prisma } = require("../lib/db.ts");
const {
  hashAdminPassword,
  verifyAdminPassword,
} = require("../lib/auth/admin-password.ts");
const { verifyAdminCredentials } = require("../lib/auth/admin-session.ts");
const {
  issueAdminCode,
  verifyAdminCode,
} = require("../lib/auth/admin-code.ts");
const {
  createSubmissionRecord,
} = require("../lib/services/submission-service.ts");
const {
  initialFormValues,
  prescreenQuestions,
  secondPrescreenQuestions,
} = require("../lib/form-config.ts");
const suffix = Date.now(),
  createdCustomers = [];
let sends = 0,
  lastCode = "";
const fakeSender = async (message) => {
  sends++;
  lastCode = message.html.match(/>(\d{6})</)[1];
};
const email = "admin@example.test";
const base = process.env.TEST_BASE_URL
  ? new URL(process.env.TEST_BASE_URL)
  : null;
if (base)
  assert.ok(
    ["localhost", "127.0.0.1"].includes(base.hostname) && base.port === "3100",
  );
try {
  const testPassword = "local-test-password-only";
  const passwordHash = await hashAdminPassword(testPassword);
  assert.notEqual(
    await hashAdminPassword(testPassword),
    passwordHash,
    "Random salt per credential",
  );
  assert.equal(await verifyAdminPassword(testPassword, passwordHash), true);
  assert.equal(await verifyAdminPassword("wrong", passwordHash), false);
  assert.equal(await verifyAdminPassword(testPassword, "malformed"), false);
  await prisma.adminCredential.upsert({
    where: { email },
    create: { email, passwordHash },
    update: { passwordHash },
  });
  assert.equal(
    await verifyAdminCredentials(email.toUpperCase(), testPassword),
    true,
  );
  assert.equal(await verifyAdminCredentials(email, "wrong"), false);
  assert.equal(
    await verifyAdminCredentials("outsider@example.test", testPassword),
    false,
  );
  process.env.ADMIN_PASSWORD = "env-override-test-only";
  assert.equal(await verifyAdminCredentials(email, testPassword), false);
  assert.equal(
    await verifyAdminCredentials(email, process.env.ADMIN_PASSWORD),
    true,
  );
  process.env.ADMIN_PASSWORD = "";
  const id = await issueAdminCode(email, fakeSender);
  assert.equal(sends, 1);
  const validCode = lastCode;
  const results = await Promise.all([
    verifyAdminCode(id, email, validCode),
    verifyAdminCode(id, email, validCode),
  ]);
  assert.equal(
    results.filter(Boolean).length,
    1,
    "Admin code consumption is atomic",
  );
  assert.equal(
    await verifyAdminCode(id, email, validCode),
    false,
    "Code cannot be reused",
  );
  const blocked = await issueAdminCode("outsider@example.test", fakeSender);
  assert.equal(sends, 1, "Unapproved email never receives a code");
  assert.equal(
    await verifyAdminCode(blocked, "outsider@example.test", validCode),
    false,
  );
  const exhausted = await issueAdminCode(email, fakeSender),
    exhaustedCode = lastCode;
  for (let i = 0; i < 5; i++)
    assert.equal(
      await verifyAdminCode(
        exhausted,
        email,
        exhaustedCode === "000000" ? "111111" : "000000",
      ),
      false,
    );
  assert.equal(
    await verifyAdminCode(exhausted, email, exhaustedCode),
    false,
    "Five guesses exhaust a code",
  );
  const expired = await issueAdminCode(email, fakeSender);
  await prisma.adminLoginChallenge.update({
    where: { id: expired },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(await verifyAdminCode(expired, email, lastCode), false);
  const old = await issueAdminCode(email, fakeSender),
    oldCode = lastCode;
  await issueAdminCode(email, fakeSender);
  assert.equal(
    await verifyAdminCode(old, email, oldCode),
    false,
    "Issuing a new code invalidates previous codes",
  );
  await assert.rejects(
    issueAdminCode(email, async () => {
      throw new Error("test SMTP failure");
    }),
    /Could not send/,
  );
  const a = await prisma.customer.create({
    data: {
      firstName: "Original",
      lastName: "Owner",
      email: `entry-${suffix}@example.test`,
      phone: "+15555550101",
      backupContact: "email",
      emergencyContactName: "Private emergency",
      emergencyContactPhone: "+15555550103",
    },
  });
  createdCustomers.push(a.id);
  const pet = await prisma.pet.create({
    data: {
      customerId: a.id,
      name: "Original dog",
      breed: "Poodle",
      weightLb: 20,
      ageYears: 3,
    },
  });
  const values = {
    ...initialFormValues,
    firstTimeBooking: "no",
    firstName: "Changed",
    lastName: "Guest",
    email: a.email,
    phone: "+15555550999",
    backupContact: "email",
    emergencyContactName: "Test",
    emergencyContactPhone: "+15555550102",
    petName: pet.name,
    petBreed: "Changed breed",
    petWeightLb: "25",
    petAgeYears: "3",
    dropoffDate: "2091-04-05",
    dropoffTime: "09:00",
    pickupDate: "2091-04-06",
    pickupTime: "10:30",
    agreed: true,
    signature:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    ...Object.fromEntries(
      [...prescreenQuestions, ...secondPrescreenQuestions].map((q) => [
        q.name,
        "no",
      ]),
    ),
  };
  const guest = await createSubmissionRecord(values);
  assert.equal(guest.customer.id, a.id);
  assert.equal(
    (await prisma.customer.findUnique({ where: { id: a.id } })).firstName,
    "Original",
    "Guest booking does not overwrite customer profile",
  );
  assert.equal(
    (await prisma.pet.findUnique({ where: { id: pet.id } })).breed,
    "Poodle",
    "Guest booking does not overwrite saved dog profile",
  );
  assert.equal(
    guest.submission.customerSnapshot.firstName,
    "Changed",
    "Submitted data is preserved in booking snapshot",
  );
  assert.equal(
    guest.submission.dropoffAt.toISOString(),
    "2091-04-05T09:00:00.000Z",
  );
  const fresh = await createSubmissionRecord({
    ...values,
    email: `entry-new-${suffix}@example.test`,
    dropoffDate: "2091-04-08",
    pickupDate: "2091-04-09",
  });
  createdCustomers.push(fresh.customer.id);
  if (base) {
    const get = (path) =>
      fetch(`${base.origin}${path}`, { redirect: "manual" });
    const post = (path, body) =>
      fetch(`${base.origin}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "manual",
      });
    assert.equal(
      (await get("/book")).status,
      200,
      "Booking no longer requires login",
    );
    const lookup = await post("/api/me/prefill", { email: a.email });
    assert.equal(lookup.status, 200);
    assert.equal(lookup.headers.get("set-cookie"), null);
    const info = await lookup.json();
    assert.equal(info.customer.firstName, "Original");
    assert.equal(info.authenticated, false);
    assert.equal(info.customer.emergencyContactPhone, "");
    assert.equal(info.pets[0].name, pet.name);
    assert.equal(info.pets[0].lastPrescreenAnswers, undefined);
    assert.equal(
      (await get("/account")).status,
      307,
      "Email lookup never signs in to account history",
    );
    const booking = await post("/api/submit", {
      ...values,
      dropoffDate: "2091-04-12",
      pickupDate: "2091-04-13",
    });
    assert.equal(booking.status, 200);
    assert.equal((await booking.json()).accountAccess, false);
    assert.equal(booking.headers.get("set-cookie"), null);
    const passwordLogin = await post("/api/admin/login", {
      email,
      password: testPassword,
    });
    assert.equal(
      passwordLogin.status,
      200,
      "Database password works without ADMIN_PASSWORD env",
    );
    assert.match(passwordLogin.headers.get("set-cookie"), /spr_admin_session=/);
    assert.equal(
      (await post("/api/admin/login", { email, password: "wrong" })).status,
      401,
    );
    assert.equal(
      (
        await post("/api/admin/login", {
          email: "outsider@example.test",
          password: testPassword,
        })
      ).status,
      401,
    );
    const challengeId = await issueAdminCode(email, fakeSender);
    const login = await post("/api/admin/login/code", {
      action: "verify",
      email,
      challengeId,
      code: lastCode,
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /spr_admin_session=/);
    const adminCookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await fetch(`${base.origin}/admin`, {
          headers: { cookie: adminCookie },
          redirect: "manual",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post("/api/admin/login/code", {
          action: "verify",
          email,
          challengeId,
          code: lastCode,
        })
      ).status,
      401,
    );
  }
  console.log(
    "PASS hashed admin password, environment override, invalid passwords and email allowlist; admin code allowlist, expiry, attempt limits, replay/race protection, SMTP failure; guest booking, preserved profiles, dates/times, public prefill without account access. No real emails sent.",
  );
} finally {
  await prisma.adminCredential.deleteMany({ where: { email } });
  await prisma.adminLoginChallenge.deleteMany({ where: { email } });
  const bookings = await prisma.submission.findMany({
    where: { customerId: { in: createdCustomers } },
    select: { id: true },
  });
  await prisma.emailLog.deleteMany({
    where: { submissionId: { in: bookings.map((b) => b.id) } },
  });
  await prisma.submission.deleteMany({
    where: { customerId: { in: createdCustomers } },
  });
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomers } } });
  await prisma.$disconnect();
}
