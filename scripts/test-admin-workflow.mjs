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
if (!process.env.TEST_DATABASE_URL)
  throw new Error("Set TEST_DATABASE_URL to the isolated local database.");
const url = new URL(process.env.TEST_DATABASE_URL);
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55439",
);
Object.assign(process.env, {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  APP_SECRET: "platform-local-test-secret-only",
  APP_BASE_URL: "http://127.0.0.1:3100",
});
const { prisma } = require("../lib/db.ts");
const {
  updateCalendarRange,
} = require("../lib/platform/calendar-management.ts");
const { availability } = require("../lib/platform/capacity.ts");
const { bookingDecisionActions } = require("../lib/admin/booking-actions.ts");
const {
  createSubmissionRecord,
} = require("../lib/services/submission-service.ts");
const {
  initialFormValues,
  prescreenQuestions,
  secondPrescreenQuestions,
} = require("../lib/form-config.ts");
let sent = 0;
require("../lib/decision-emails.ts").sendDecisionEmail = async () => {
  sent++;
};
const { processAdminSubmissionDecision } = require("../lib/admin/decision.ts");
const start = "2092-04-29",
  end = "2092-05-02";
let customerId;
try {
  assert.deepEqual(bookingDecisionActions("PENDING"), [
    "accept",
    "reject",
    "meet_greet",
  ]);
  assert.deepEqual(bookingDecisionActions("NEEDS_REVIEW"), [
    "accept",
    "reject",
    "meet_greet",
  ]);
  assert.deepEqual(bookingDecisionActions("MEET_GREET_REQUESTED"), [
    "accept",
    "reject",
  ]);
  for (const status of ["ACCEPTED", "REJECTED", "CANCELLED"])
    assert.deepEqual(bookingDecisionActions(status), []);
  const values = {
    ...initialFormValues,
    firstTimeBooking: "yes",
    firstName: "Calendar",
    lastName: "Test",
    email: `calendar-${Date.now()}@example.test`,
    phone: "+15555550101",
    backupContact: "email",
    emergencyContactName: "Test",
    emergencyContactPhone: "+15555550102",
    petName: "Test dog",
    petBreed: "Poodle",
    petWeightLb: "20",
    petAgeYears: "2",
    dropoffDate: start,
    pickupDate: end,
    dropoffTime: "10:00",
    pickupTime: "10:00",
    signature: "test-only",
    agreed: true,
    ...Object.fromEntries(
      [...prescreenQuestions, ...secondPrescreenQuestions].map((q) => [
        q.name,
        "no",
      ]),
    ),
  };
  const record = await createSubmissionRecord(values);
  customerId = record.customer.id;
  await updateCalendarRange({ start, end, mode: "capacity", capacity: 5 });
  await updateCalendarRange({
    start,
    end,
    mode: "block",
    note: "Test vacation",
  });
  let result = await availability(start, end);
  assert.equal(result.days.length, 4, "Cross-month endpoints included");
  assert.ok(
    result.days.every(
      (d) =>
        d.closed && d.remaining === 0 && d.capacity === 5 && d.occupied === 1,
    ),
  );
  await assert.rejects(createSubmissionRecord(values), /not enough space/);
  await updateCalendarRange({ start, end, mode: "capacity", capacity: 6 });
  assert.ok(
    (await availability(start, end)).days.every((d) => d.closed),
    "Capacity edits preserve blocks",
  );
  await updateCalendarRange({ start, end, mode: "unblock" });
  assert.ok(
    (await availability(start, end)).days.every(
      (d) => !d.closed && d.capacity === 6 && d.occupied === 1,
    ),
  );
  await updateCalendarRange({ start, end, mode: "capacity", capacity: 1 });
  await updateCalendarRange({ start, end, mode: "block" });
  await updateCalendarRange({ start, end, mode: "unblock" });
  assert.ok(
    (await availability(start, end)).days.every(
      (d) => !d.closed && d.remaining === 0,
    ),
    "Unblocking does not open full dates",
  );
  await assert.rejects(
    updateCalendarRange({ start: end, end: start, mode: "block" }),
    /valid date/,
  );
  await assert.rejects(
    updateCalendarRange({ start, end, mode: "capacity", capacity: 0 }),
    /Block dates/,
  );
  const options = {
    submissionId: record.submission.id,
    action: "accept",
    adminEmail: "admin@example.test",
    expectedStatus: "PENDING",
    expectedRevision: record.submission.revision,
  };
  await assert.rejects(
    processAdminSubmissionDecision({ ...options, expectedRevision: 99 }),
    /booking changed/,
  );
  const race = await Promise.allSettled([
    processAdminSubmissionDecision(options),
    processAdminSubmissionDecision(options),
  ]);
  assert.equal(
    race.filter((r) => r.status === "fulfilled").length,
    1,
    "Only one decision wins",
  );
  assert.equal(sent, 1, "Only one decision email sent");
  await assert.rejects(
    processAdminSubmissionDecision(options),
    /already recorded/,
  );
  await assert.rejects(
    processAdminSubmissionDecision({ ...options, action: "reject" }),
    /already recorded/,
  );
  assert.equal(sent, 1);
  assert.equal(
    await prisma.decisionEvent.count({
      where: { submissionId: record.submission.id },
    }),
    1,
  );
  await prisma.submission.update({
    where: { id: record.submission.id },
    data: { status: "MEET_GREET_REQUESTED" },
  });
  await assert.rejects(
    processAdminSubmissionDecision({
      ...options,
      action: "meet_greet",
      meetGreetAt: "2092-04-01T10:00",
      expectedStatus: "MEET_GREET_REQUESTED",
    }),
    /already recorded/,
  );
  await processAdminSubmissionDecision({
    ...options,
    expectedStatus: "MEET_GREET_REQUESTED",
  });
  assert.equal(sent, 2, "Meet & greet may progress to acceptance");
  await updateCalendarRange({ start, end, mode: "reset" });
  assert.equal(
    await prisma.dailyCapacity.count({
      where: { date: { gte: start, lte: end } },
    }),
    0,
  );
  console.log(
    "PASS inclusive cross-month blocks, preserved reservations and limits, full-day unblocking, invalid ranges, decision transitions, stale revisions and concurrent/double-click protection. No real email sent.",
  );
} finally {
  await prisma.dailyCapacity.deleteMany({
    where: { date: { gte: start, lte: end } },
  });
  if (customerId) {
    await prisma.emailLog.deleteMany({ where: { submission: { customerId } } });
    await prisma.submission.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
  }
  await prisma.$disconnect();
}
