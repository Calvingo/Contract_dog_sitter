import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to the isolated PostgreSQL database on port 55439.");
const url = new URL(process.env.TEST_DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55439", "Local test database only");
Object.assign(process.env, { DATABASE_URL: url.href, DIRECT_URL: url.href, APP_SECRET: "waitlist-tests-only-secret", APP_BASE_URL: "http://127.0.0.1:3100", GMAIL_USER: "sender@example.test" });
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
const background = [], sent = [], decisions = [], pdfCalls = [];
let admin = true, failRecipient = "", failSchedule = false;
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === "nodemailer") throw new Error("Real SMTP is forbidden in waiting-list tests");
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "next/navigation") return { redirect: path => { throw new Error(`REDIRECT:${path}`); } };
  if (request === "next/server") return { ...nextServer, after: callback => {
    if (failSchedule) throw new Error("Simulated scheduling failure");
    background.push(callback);
  } };
  const path = Module._resolveFilename(request, parent);
  if (path === resolve(root, "lib/auth/admin-session.ts")) return { getAdminSession: async () => admin ? { email: "admin@example.test" } : null };
  if (path === resolve(root, "lib/auth/customer-session.ts")) return { ...originalLoad.call(this, request, parent, ...args), getCustomerSession: async () => null, setCustomerSession: async () => true };
  if (path === resolve(root, "lib/platform/rate-limit.ts")) return { allowRequest: async () => true, requestIp: () => "127.0.0.1" };
  if (path === resolve(root, "lib/decision-emails.ts")) return {
    decisionActionLabel: action => action, sendDecisionEmail: async (...args) => { decisions.push(args); },
  };
  if (path === resolve(root, "lib/pdf-receipt.ts")) return {
    generateSubmissionPdf: async (...args) => { pdfCalls.push(args); return Buffer.from("test-pdf"); }, pdfFilename: () => "test.pdf",
  };
  if (path === resolve(root, "lib/mailer.ts")) return {
    BRAND_NAME: "Silicon Paws Retreat", getEnv: name => process.env[name],
    parseAdminEmails: () => ["admin@example.test", "second@example.test", "ADMIN@example.test"],
    sendMail: async message => { sent.push(message); if (message.to === failRecipient) throw new Error("Simulated SMTP failure"); },
  };
  return originalLoad.call(this, request, parent, ...args);
};
const { prisma } = require("../lib/db.ts");
const { createSubmissionRecord, updateSubmissionRecord } = require("../lib/services/submission-service.ts");
const { availability, prepareStatusChange, acceptanceImpact } = require("../lib/platform/capacity.ts");
const { cancelAdminBooking, saveCancellationRequest } = require("../lib/services/cancellation.ts");
const { processAdminSubmissionDecision } = require("../lib/admin/decision.ts");
const { processDecision } = require("../lib/decision-handler.ts");
const { createDecisionToken } = require("../lib/token.ts");
const { updateCalendarRange } = require("../lib/platform/calendar-management.ts");
const { sendWaitlistNotification, waitingListWhere } = require("../lib/services/waitlist-alerts.ts");
const { listBookingRequests } = require("../lib/admin/booking-requests.ts");
const { acknowledgeWaitlistAlert } = require("../app/admin/waitlist-actions.ts");
const { saveSettings } = require("../app/admin/platform-actions.ts");
const { decideSubmissionActionWithState, updateSubmissionActionWithState } = require("../app/admin/actions.ts");
const { POST: submit } = require("../app/api/submit/route.ts");
const { POST: edit } = require("../app/api/submission/edit/route.ts");
const { createSubmissionEditToken } = require("../lib/submission-edit-token.ts");
const { initialFormValues, prescreenQuestions, secondPrescreenQuestions } = require("../lib/form-config.ts");
const { isWaitlisted } = require("../lib/waitlist.ts");
const { bookingLabel } = require("../lib/platform/rules.ts");
const prefix = `waitlist-${Date.now()}-`;
let sequence = 0;
const start = "2095-06-10", end = "2095-06-12";
const values = (more = {}) => ({
  ...initialFormValues, ...Object.fromEntries([...prescreenQuestions, ...secondPrescreenQuestions].map(q => [q.name, "no"])),
  email: `${prefix}${++sequence}@example.test`, firstName: "Waitlist", lastName: prefix, phone: "5550100101", backupContact: "email",
  emergencyContactName: "Emergency", emergencyContactPhone: "5550100102", firstTimeBooking: "yes",
  petName: "Coco", petBreed: "Mix", petWeightLb: "20", petAgeYears: "3",
  secondPetName: "Milo", secondPetBreed: "Mix", secondPetWeightLb: "30", secondPetAgeYears: "4",
  dropoffDate: start, pickupDate: end, dropoffTime: "10:00", pickupTime: "10:00",
  agreed: true, signature: "data:image/png;base64,dGVzdA==", ...more,
});
const load = id => prisma.submission.findUniqueOrThrow({ where: { id }, include: { submissionPets: true, revisions: true } });
const strictAccept = id => prisma.$transaction(async tx => {
  const data = await prepareStatusChange(tx, id, "ACCEPTED");
  return tx.submission.update({ where: { id }, data: { status: "ACCEPTED", ...data } });
});
const decide = async (id, action = "accept") => {
  const row = await load(id);
  return processAdminSubmissionDecision({ submissionId: id, action, adminEmail: "admin@example.test", expectedRevision: row.revision, expectedStatus: row.status, ...(action === "meet_greet" ? { meetGreetAt: "2095-05-01T10:00" } : {}) });
};
const cancel = async id => { const row = await load(id); return cancelAdminBooking(id, row.revision, row.status); };
const request = body => new Request("http://localhost/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const form = values => { const form = new FormData(); Object.entries(values).forEach(([key, value]) => form.set(key, String(value))); return form; };
const alertCount = () => prisma.waitlistAlert.count();
const oldSettings = await prisma.platformSettings.findUnique({ where: { id: "default" } });
const oldAlerts = (await prisma.waitlistAlert.findMany({ select: { id: true } })).map(row => row.id);
const originalError = console.error;
try {
  await prisma.platformSettings.upsert({ where: { id: "default" }, create: { id: "default", defaultCapacity: 17 }, update: { defaultCapacity: 17, includePickupDay: true } });
  const confirmed = [];
  for (let i = 0; i < 17; i++) {
    const row = await createSubmissionRecord(values());
    confirmed.push(await strictAccept(row.submission.id));
  }
  const waitValues = values();
  const first = await createSubmissionRecord(waitValues);
  const second = await createSubmissionRecord(values());
  const crossMonth = await createSubmissionRecord(values({ dropoffDate: "2095-05-31", pickupDate: "2095-06-11" }));
  assert.ok(isWaitlisted(first.submission));
  assert.deepEqual(first.submission.waitlistDates, [start, "2095-06-11", end]);
  assert.ok(isWaitlisted(crossMonth.submission), "One full date makes the whole stay a waiting-list request");
  assert.ok((await availability(start, end)).days.every(day => day.occupied === 17 && day.capacity === 17 && day.remaining === 0));
  await prisma.submission.update({ where: { id: first.submission.id }, data: { holdExpiresAt: new Date(0) } });
  assert.ok(isWaitlisted(await load(first.submission.id)), "An expired operation window never expires the waiting list");
  assert.match(bookingLabel(await load(first.submission.id)), /Waiting list/);

  const apiValues = values();
  const response = await submit(request(apiValues));
  assert.equal(response.status, 200);
  const api = await response.json();
  assert.equal(api.waitlisted, true);
  assert.equal((await load(api.submissionId)).customerSnapshot.phone, apiValues.phone);
  const token = await createSubmissionEditToken(api.submissionId);
  const edited = await edit(request({ token, revision: 1, values: { ...apiValues, phone: "5550100199" } }));
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).waitlisted, true);
  while (background.length) await background.shift()();
  const receipt = sent.find(message => message.to === apiValues.email);
  assert.match(receipt.subject, /Waiting list — not confirmed/);
  assert.match(receipt.html, /before paying a deposit/);
  assert.doesNotMatch(receipt.html, /required deposit|Payment required/i);
  assert.ok(pdfCalls.every(call => call[4] === true), "Waiting-list PDF is explicitly labelled");
  const adminMail = sent.find(message => Array.isArray(message.to));
  assert.match(adminMail.html, /Review waiting-list request/);
  assert.doesNotMatch(adminMail.html, /action=accept/);
  const link = createDecisionToken({ submissionId: first.submission.id, revision: 1, action: "accept", email: waitValues.email, firstName: "Waitlist", lastName: "Test", petName: "Coco" });
  const linkResult = await processDecision(link, "accept");
  assert.equal(linkResult.ok, false);
  assert.equal(linkResult.reviewUrl, `/admin/submissions/${first.submission.id}`);
  assert.ok(isWaitlisted(await load(first.submission.id)), "Legacy email links do not silently overbook");
  console.log("PASS full/cross-month submissions, API create/edit, durable membership, customer/admin email and PDF status, safe legacy decision links.");

  const q = await listBookingRequests({ view: "waitlist", date: "2095-06-11", q: prefix });
  assert.equal(q.total, 4);
  assert.equal(q.submissions[0].id, first.submission.id);
  assert.match(q.submissions[0].capacitySummary, /17 \/ 17 → 18 \/ 17/);
  assert.equal(q.submissions.find(row => row.id === api.submissionId).contactPhone, "5550100199");
  const firstRow = await load(first.submission.id);
  admin = false;
  await assert.rejects(decideSubmissionActionWithState({}, form({ submissionId: firstRow.id, revision: firstRow.revision, expectedStatus: firstRow.status, action: "accept" })), /REDIRECT/);
  admin = true;
  const accidentalAccept = await updateSubmissionActionWithState(null, form({ submissionId: firstRow.id, revision: firstRow.revision, expectedStatus: firstRow.status, status: "ACCEPTED", dropoffAt: `${start}T10:00`, pickupAt: `${end}T10:00` }));
  assert.match(accidentalAccept.error, /Use the Accept button/);
  const beforeDecisions = decisions.length;
  const race = await Promise.allSettled([decide(firstRow.id), decide(firstRow.id)]);
  assert.equal(race.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(decisions.length, beforeDecisions + 1);
  assert.equal((await load(firstRow.id)).waitlistedAt, null);
  assert.ok((await availability(start, end)).days.every(day => day.occupied === 18 && day.capacity === 17 && day.overCapacity));
  const event = await prisma.decisionEvent.findFirstOrThrow({ where: { submissionId: firstRow.id, action: "ACCEPT" } });
  assert.equal(event.actorEmail, "admin@example.test");
  assert.match(event.message, /17 \/ 17 → 18 \/ 17/);
  await decide(second.submission.id);
  assert.equal((await availability(start, end)).days[0].occupied, 19);
  const count = await alertCount();
  await cancel(firstRow.id);
  await cancel(second.submission.id);
  assert.equal(await alertCount(), count, "19→18→17 releases no bookable space");
  assert.equal(await saveCancellationRequest(confirmed[0].id, confirmed[0].customerId, "Plans changed"), true);
  assert.equal(await alertCount(), count, "A cancellation request does not release confirmed capacity");
  assert.equal((await availability(start, end)).days[0].occupied, 17);
  const released = await cancel(confirmed[0].id);
  assert.ok(released.waitlistAlertId);
  assert.equal(await alertCount(), count + 1);
  assert.ok(isWaitlisted(await load(api.submissionId)), "A newly opened space never accepts candidates");
  const pair = await createSubmissionRecord(values({ hasSecondDog: true }));
  assert.ok(isWaitlisted(pair.submission), "One available space is insufficient for two dogs");
  const pairImpact = await prisma.$transaction(tx => acceptanceImpact(tx, { ...pair.submission, submissionPets: [{}, {}] }));
  assert.equal(pairImpact[0].after, 18);
  console.log("PASS admin authorization, explicit acceptance, 18/17 occupancy, audit, double-click protection, cancellation request vs release, and multi-dog shortages.");

  failRecipient = "admin@example.test";
  const beforeSend = sent.length;
  await Promise.all([sendWaitlistNotification(released.waitlistAlertId), sendWaitlistNotification(released.waitlistAlertId)]);
  assert.equal(sent.length, beforeSend + 2, "Each distinct administrator gets exactly one attempt, even after a recipient failure");
  const alert = await prisma.waitlistAlert.findUniqueOrThrow({ where: { id: released.waitlistAlertId } });
  assert.equal(alert.emailFailed, true);
  assert.equal(alert.acknowledgedAt, null);
  assert.deepEqual(alert.remaining, { [start]: 1, "2095-06-11": 1, [end]: 1 });
  assert.ok(await prisma.emailLog.findFirst({ where: { subject: { contains: alert.id }, status: "FAILED" } }));
  failRecipient = "";
  while (background.length) await background.shift()();
  assert.equal(sent.length, beforeSend + 2, "Scheduled duplicate does not resend the alert");
  admin = false;
  await assert.rejects(acknowledgeWaitlistAlert({}, form({ id: alert.id })), /REDIRECT/);
  admin = true;
  await acknowledgeWaitlistAlert({}, form({ id: alert.id }));
  assert.ok((await prisma.waitlistAlert.findUniqueOrThrow({ where: { id: alert.id } })).acknowledgedAt);
  assert.ok(isWaitlisted(await load(api.submissionId)));

  const membership = await load(api.submissionId);
  await updateSubmissionRecord({ submissionId: api.submissionId, expectedRevision: membership.revision, data: { ...apiValues, dropoffDate: "2095-08-01", pickupDate: "2095-08-03" } });
  const moved = await load(api.submissionId);
  assert.equal(+moved.waitlistedAt, +membership.waitlistedAt, "Changing to open dates preserves queue membership and order");
  assert.deepEqual(moved.waitlistDates, []);
  await decide(api.submissionId, "meet_greet");
  assert.ok(isWaitlisted(await load(api.submissionId)), "Meet & greet does not remove a request from the waiting list");
  assert.equal((await listBookingRequests({ view: "waitlist", date: "2095-08-02", q: prefix })).total, 1);
  await decide(api.submissionId, "reject");
  assert.equal((await load(api.submissionId)).waitlistedAt, null);
  assert.ok((await load(api.submissionId)).revisions.some(row => row.waitlistedAt));
  console.log("PASS persisted reminders, per-recipient failures/deduplication, authorized acknowledgement, sticky edits/meet-and-greet, and explicit closure.");

  await updateCalendarRange({ start: "2095-07-01", end: "2095-07-03", mode: "capacity", capacity: 1 });
  const originalValues = values({ dropoffDate: "2095-07-01", pickupDate: "2095-07-03" });
  const original = await createSubmissionRecord(originalValues);
  await strictAccept(original.submission.id);
  const oldDateWaiter = await createSubmissionRecord(values({ dropoffDate: "2095-07-01", pickupDate: "2095-07-03" }));
  // Restore June to 17 so the proposed new dates are full.
  const refill = await createSubmissionRecord(values());
  await strictAccept(refill.submission.id);
  await updateSubmissionRecord({ submissionId: original.submission.id, data: { ...originalValues, dropoffDate: start, pickupDate: end } });
  assert.ok(isWaitlisted(await load(original.submission.id)));
  assert.equal((await availability("2095-07-01", "2095-07-03")).days[0].occupied, 1);
  assert.match(bookingLabel(await load(original.submission.id)), /Confirmed stay.*waiting list/);
  await decide(original.submission.id, "reject");
  assert.equal((await load(original.submission.id)).waitlistedAt, null);
  assert.equal((await availability("2095-07-01", "2095-07-03")).days[0].occupied, 1, "Rejecting waitlisted changes retains the original confirmed stay");
  await updateSubmissionRecord({ submissionId: original.submission.id, data: { ...originalValues, dropoffDate: start, pickupDate: end } });
  const beforeMove = await alertCount();
  await decide(original.submission.id);
  assert.equal((await availability("2095-07-01", "2095-07-03")).days[0].occupied, 0);
  assert.equal(await alertCount(), beforeMove + 1, "Accepting new dates alerts candidates for released old dates");
  assert.ok(isWaitlisted(await load(oldDateWaiter.submission.id)));

  const beforeLimit = await alertCount();
  await updateCalendarRange({ start, end, mode: "capacity", capacity: 20 });
  assert.equal(await alertCount(), beforeLimit + 1);
  await updateCalendarRange({ start, end, mode: "capacity", capacity: 20 });
  assert.equal(await alertCount(), beforeLimit + 1, "No notification when capacity did not change");
  await updateCalendarRange({ start, end, mode: "block" });
  await assert.rejects(createSubmissionRecord(values()), /closed/);
  await assert.rejects(decide(pair.submission.id), /closed/);
  await updateCalendarRange({ start, end, mode: "unblock" });
  assert.equal(await alertCount(), beforeLimit + 2);
  await updateCalendarRange({ start, end, mode: "reset" });
  const settings = form({ defaultCapacity: 20, holdHours: 72, includePickupDay: "on" });
  const beforeSettings = await alertCount();
  assert.ok((await saveSettings({}, settings)).message);
  assert.equal(await alertCount(), beforeSettings + 1, "Default capacity changes also notify");
  settings.set("defaultCapacity", "17");
  settings.delete("includePickupDay");
  await saveSettings({}, settings);
  const pickupOnly = await createSubmissionRecord(values({ dropoffDate: "2095-06-09", pickupDate: start }));
  assert.equal(pickupOnly.submission.waitlistedAt, null, "Night-based capacity excludes pickup day");
  const sameDay = await createSubmissionRecord(values({ pickupDate: start, pickupTime: "12:00" }));
  assert.ok(isWaitlisted(sameDay.submission), "Same-day stays still consume one date");
  const pickupFilter = await listBookingRequests({ view: "waitlist", date: end, q: prefix });
  assert.equal(pickupFilter.total, 0, "Night-based waiting-list filters exclude pickup-only matches");
  console.log("PASS accepted-stay retention/replacement, date-range and default-capacity changes, closed dates, reopening, night counting, and same-day visits.");

  console.error = () => {};
  failSchedule = true;
  await updateCalendarRange({ start, end, mode: "capacity", capacity: 21 });
  const scheduleFailure = await prisma.waitlistAlert.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  assert.equal(scheduleFailure.emailFailed, true);
  assert.ok((await availability(start, start)).days[0].remaining > 0);
  assert.ok((await prisma.submission.count({ where: waitingListWhere })) > 0);
  console.log("PASS scheduling failure preserves capacity changes, queued requests and the dashboard reminder. No real email sent.");
  console.error = originalError;
  failSchedule = false;
  await updateCalendarRange({ start: "2095-09-01", end: "2095-09-03", mode: "capacity", capacity: 1 });
  const concurrentValues = { dropoffDate: "2095-09-01", pickupDate: "2095-09-03" };
  const occupying = await createSubmissionRecord(values(concurrentValues));
  await strictAccept(occupying.submission.id);
  const concurrentA = await createSubmissionRecord(values(concurrentValues));
  const concurrentB = await createSubmissionRecord(values(concurrentValues));
  await Promise.all([decide(concurrentA.submission.id), decide(concurrentB.submission.id)]);
  assert.equal((await availability("2095-09-01", "2095-09-02")).days[0].occupied, 3);
  assert.equal((await availability("2095-09-01", "2095-09-02")).days[0].capacity, 1);
  assert.equal((await load(concurrentA.submission.id)).waitlistedAt, null);
  assert.equal((await load(concurrentB.submission.id)).waitlistedAt, null);
  console.log("PASS concurrent manual acceptance of distinct waiting-list requests counts both accurately without changing the limit.");
} finally {
  console.error = originalError;
  const newAlerts = await prisma.waitlistAlert.findMany({ where: { id: { notIn: oldAlerts } }, select: { id: true } });
  await prisma.emailLog.deleteMany({ where: { OR: [
    { submission: { customer: { email: { startsWith: prefix } } } },
    ...newAlerts.map(alert => ({ subject: { contains: alert.id } })),
  ] } });
  await prisma.waitlistAlert.deleteMany({ where: { id: { in: newAlerts.map(row => row.id) } } });
  await prisma.submission.deleteMany({ where: { customer: { email: { startsWith: prefix } } } });
  await prisma.loginToken.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.customer.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.dailyCapacity.deleteMany({ where: { date: { gte: "2095-01-01", lte: "2095-12-31" } } });
  if (oldSettings) await prisma.platformSettings.upsert({ where: { id: "default" }, create: oldSettings, update: oldSettings });
  else await prisma.platformSettings.deleteMany({ where: { id: "default" } });
  await prisma.$disconnect();
}
