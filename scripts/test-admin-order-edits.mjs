import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to the isolated local database on port 55439.");
const url = new URL(process.env.TEST_DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55439");
Object.assign(process.env, {
  DATABASE_URL: url.href, DIRECT_URL: url.href, APP_SECRET: "admin-order-test-only",
  APP_BASE_URL: "http://127.0.0.1:3100", GMAIL_USER: "sender@example.test",
});
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url), ts = require("typescript");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith("@/") ? resolve(root, request.slice(2)) : request, ...args);
};
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
let admin = true, failMail = false, failSchedule = false, waitForMail;
const background = [], sent = [], receipts = [], revalidated = [];
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === "nodemailer") throw new Error("Real SMTP is forbidden in this test");
  if (request === "next/cache") return { revalidatePath: path => revalidated.push(path) };
  if (request === "next/navigation") return { redirect: path => { throw new Error(`REDIRECT:${path}`); } };
  if (request === "next/server") return { after: callback => {
    if (failSchedule) throw new Error("Simulated scheduling failure");
    background.push(callback);
  } };
  const path = Module._resolveFilename(request, parent);
  if (path === resolve(root, "lib/auth/customer-session.ts")) return { getCustomerSession: async () => ({ customerId }) };
  if (path === resolve(root, "lib/auth/admin-session.ts")) return { getAdminSession: async () => admin ? { email: "admin@example.test" } : null };
  if (path === resolve(root, "lib/email.ts")) return { sendSubmissionEmails: async (...args) => { receipts.push(args); } };
  if (path === resolve(root, "lib/mailer.ts")) return {
    BRAND_NAME: "Test Boarding", getEnv: name => process.env[name], parseAdminEmails: () => [],
    sendMail: async message => {
      if (waitForMail) await waitForMail;
      if (failMail) throw new Error("Simulated SMTP failure");
      sent.push(message);
    },
  };
  return originalLoad.call(this, request, parent, ...args);
};
const { prisma } = require("../lib/db.ts");
const { createSubmissionRecord, updateSubmissionRecord } = require("../lib/services/submission-service.ts");
const { availability, prepareStatusChange } = require("../lib/platform/capacity.ts");
const { initialFormValues, prescreenQuestions, secondPrescreenQuestions } = require("../lib/form-config.ts");
const { getSubmissionQuote, formValuesFromSubmission } = require("../lib/submission-data.ts");
const { updateSubmissionActionWithState, updateCustomerPetActionWithState, cancelSubmissionActionWithState } = require("../app/admin/actions.ts");
const form = values => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, String(value));
  return data;
};
const values = {
  ...initialFormValues, ...Object.fromEntries([...prescreenQuestions, ...secondPrescreenQuestions].map(q => [q.name, "no"])),
  email: `admin-edits-${Date.now()}@example.test`, firstName: "Admin", lastName: "Test", phone: "5550100101",
  backupContact: "email", emergencyContactName: "Emergency", emergencyContactPhone: "5550100102",
  petName: "Coco", petBreed: "Mix", petWeightLb: "20", petAgeYears: "3", firstTimeBooking: "yes",
  hasSecondDog: true, secondPetName: "Milo", secondPetBreed: "Mix", secondPetWeightLb: "30", secondPetAgeYears: "4",
  dropoffDate: "2093-12-24", pickupDate: "2093-12-26", dropoffTime: "10:00", pickupTime: "10:00",
  agreed: true, signature: "data:image/png;base64,dGVzdA==",
};
const load = id => prisma.submission.findUniqueOrThrow({
  where: { id }, include: { submissionPets: { orderBy: { position: "asc" } }, revisions: true, payments: true },
});
const orderForm = (booking, overrides = {}) => form({
  submissionId: booking.id, revision: booking.revision, expectedStatus: booking.status, status: booking.status,
  dropoffAt: booking.dropoffAt.toISOString().slice(0, 16), pickupAt: booking.pickupAt.toISOString().slice(0, 16),
  quotedTotal: "0.01", ...overrides,
});
const petForm = (booking, overrides = {}) => form({
  ...formValuesFromSubmission(booking), submissionId: booking.id, revision: booking.revision,
  customerId: booking.customerId, petId: booking.petId,
  secondPetId: booking.submissionPets.find(p => p.position === 2)?.petId || "", ...overrides,
});
const cancelForm = (booking, overrides = {}) => form({
  submissionId: booking.id, revision: booking.revision, expectedStatus: booking.status, confirmCancellation: "on", ...overrides,
});
const accept = id => prisma.$transaction(async tx => {
  const snapshot = await prepareStatusChange(tx, id, "ACCEPTED");
  await tx.submission.update({ where: { id }, data: { status: "ACCEPTED", ...snapshot } });
});
function assertQuote(booking) {
  const expected = getSubmissionQuote(formValuesFromSubmission(booking));
  assert.equal(Number(booking.quotedTotal), expected.totalPrice);
  assert.deepEqual(booking.quotedBreakdown, expected);
  for (const pet of booking.submissionPets) {
    assert.equal(Number(pet.quotedTotal), expected.dogs[pet.position - 1].totalPrice);
    assert.deepEqual(pet.quotedBreakdown, expected.dogs[pet.position - 1]);
  }
  assert.equal(booking.depositPolicySnapshot.nonRefundableAmount, expected.depositAmount);
  if (booking.status === "ACCEPTED") {
    assert.equal(booking.acceptedRevision, booking.revision);
    assert.deepEqual(booking.acceptedDepositPolicySnapshot, booking.depositPolicySnapshot);
  }
}
let customerId;
try {
  const record = await createSubmissionRecord(values);
  customerId = record.customer.id;
  await accept(record.submission.id);
  const original = await load(record.submission.id);
  const other = await createSubmissionRecord({ ...values, dropoffDate: "2094-01-03", pickupDate: "2094-01-05" });
  const unchangedOther = await load(other.submission.id);
  const edit = orderForm(original, { pickupAt: "2093-12-27T14:00" });
  const result = await updateSubmissionActionWithState(null, edit);
  assert.ok(result.ok, result.error);
  let current = await load(original.id);
  assertQuote(current);
  assert.notEqual(Number(current.quotedTotal), Number(original.quotedTotal));
  assert.equal(current.revisions[0].quotedTotal.toString(), original.quotedTotal.toString());
  assert.equal(receipts.at(-1)[3].quote.totalPrice, Number(current.quotedTotal));
  assert.match((await updateSubmissionActionWithState(null, edit)).error, /changed/);

  const updatedPets = petForm(current, { petWeightLb: "95", petAgeYears: "0.5", secondPetWeightLb: "75", secondPetAgeYears: "11", firstName: "Corrected" });
  const petsResult = await updateCustomerPetActionWithState({}, updatedPets);
  assert.ok(petsResult.message, petsResult.error);
  current = await load(current.id);
  assertQuote(current);
  assert.equal(current.petSnapshot.weightLb, 95);
  assert.equal(current.submissionPets[1].petSnapshot.ageYears, 11);
  assert.equal(current.customerSnapshot.firstName, "Corrected");
  assert.equal((await prisma.pet.findUniqueOrThrow({ where: { id: current.petId } })).weightLb, 95);
  assert.equal(receipts.at(-1)[0].firstName, "Corrected");
  assert.equal(receipts.at(-1)[3].quote.totalPrice, Number(current.quotedTotal));
  assert.deepEqual(await load(other.submission.id), unchangedOther, "Editing profiles must not reprice another booking");
  assert.match((await updateCustomerPetActionWithState({}, updatedPets)).error, /changed/);
  assert.match((await updateCustomerPetActionWithState({}, petForm(current, { secondPetId: "wrong-dog" }))).error, /do not match/);
  assert.match((await updateCustomerPetActionWithState({}, petForm(current, { petWeightLb: "NaN" }))).error, /Invalid/);
  assert.match((await updateCustomerPetActionWithState({}, petForm(current, { petAgeYears: "" }))).error, /Invalid/);
  assert.equal((await load(current.id)).revision, current.revision, "Invalid edits are atomic");
  const editRace = await Promise.all([
    updateSubmissionActionWithState(null, orderForm(current)),
    updateCustomerPetActionWithState({}, petForm(current, { petAgeYears: "3" })),
  ]);
  assert.equal(editRace.filter(result => result.ok || result.message).length, 1, "Only one editor can save a given revision");
  current = await load(current.id);
  assertQuote(current);
  console.log("PASS both admin editors: server quotes, two dogs, weight/age fees, per-dog details, signed policy, receipts, preserved history/other bookings and conflicting saves.");

  await prisma.payment.create({ data: { submissionId: current.id, method: "zelle", amount: 100, payerName: "Test", reference: "offline", status: "VERIFIED", reviewNote: "Keep this history" } });
  current = await load(current.id);
  const beforeCapacity = await availability("2093-12-24", "2093-12-27");
  const setTotal = (booking, amount) => updateSubmissionActionWithState(null, orderForm(booking, { priceMode: "manual", manualTotal: amount }));
  const beforePrice = current;
  for (const value of ["", "-1", "12.345", "100000000", "not money"]) {
    assert.match((await setTotal(current, value)).error, /Enter a price/);
  }
  admin = false;
  assert.match((await setTotal(current, "0")).error, /admin\/login/);
  admin = true;
  assert.equal((await load(current.id)).revision, current.revision);
  assert.ok((await setTotal(current, "123.45")).ok);
  current = await load(current.id);
  assert.equal(Number(current.quotedTotal), 123.45);
  assert.deepEqual(current.quotedBreakdown.dogs, beforePrice.quotedBreakdown.dogs);
  assert.deepEqual(current.payments, beforePrice.payments);
  assert.equal(current.acceptedDepositPolicySnapshot.deposit, 24.69);
  assert.equal(receipts.at(-1)[3].quote.totalPrice, 123.45);
  assert.equal(receipts.at(-1)[3].quote.depositAmount, 24.69);
  assert.equal(Number(current.revisions.find(row => row.revision === beforePrice.revision).quotedTotal), Number(beforePrice.quotedTotal));
  assert.match((await setTotal(beforePrice, "12")).error, /changed/);
  assert.ok((await updateCustomerPetActionWithState({}, petForm(current, { petName: "Coco" }))).message);
  current = await load(current.id);
  assert.equal(Number(current.quotedTotal), 123.45, "Non-pricing edits retain this order's final price");
  assert.ok((await setTotal(current, "0")).ok);
  current = await load(current.id);
  assert.equal(Number(current.quotedTotal), 0);
  assert.equal(current.acceptedDepositPolicySnapshot.deposit, 0);
  assert.ok((await updateSubmissionActionWithState(null, orderForm(current, { priceMode: "automatic" }))).ok);
  current = await load(current.id);
  assertQuote(current);
  assert.deepEqual(await load(other.submission.id), unchangedOther);
  console.log("PASS manual final prices, zero, validation, admin authorization, stale saves, automatic reset and unchanged payments.");
  assert.ok(beforeCapacity.days.every(day => day.occupied === 2));
  assert.match((await cancelSubmissionActionWithState({}, cancelForm(current, { confirmCancellation: "" }))).error, /Confirm/);
  assert.match((await cancelSubmissionActionWithState({}, cancelForm(current, { revision: current.revision - 1 }))).error, /changed/);
  assert.match((await cancelSubmissionActionWithState({}, cancelForm(current, { expectedStatus: "PENDING" }))).error, /changed/);
  admin = false;
  await assert.rejects(cancelSubmissionActionWithState({}, cancelForm(current)), /REDIRECT/);
  await assert.rejects(updateCustomerPetActionWithState({}, petForm(current)), /REDIRECT/);
  assert.equal((await load(current.id)).status, "ACCEPTED");
  admin = true;
  let releaseMail;
  waitForMail = new Promise(resolve => { releaseMail = resolve; });
  const started = performance.now();
  const cancelRace = await Promise.all([
    cancelSubmissionActionWithState({}, cancelForm(current)),
    cancelSubmissionActionWithState({}, cancelForm(current)),
  ]);
  const elapsed = performance.now() - started;
  assert.equal(cancelRace.filter(result => result.message).length, 1);
  assert.ok(elapsed < 2000, `Cancellation took ${elapsed.toFixed(0)}ms`);
  assert.equal(background.length, 1, "Exactly one background email is scheduled");
  assert.equal(sent.length, 0, "The response does not wait for SMTP");
  const cancelled = await load(current.id);
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.revision, current.revision + 1);
  assert.equal(cancelled.holdExpiresAt, null);
  assert.equal(cancelled.quotedTotal.toString(), current.quotedTotal.toString());
  assert.deepEqual(cancelled.payments, current.payments);
  assert.deepEqual(cancelled.acceptedDepositPolicySnapshot, current.acceptedDepositPolicySnapshot);
  const afterCapacity = await availability("2093-12-24", "2093-12-27");
  afterCapacity.days.forEach((day, index) => {
    assert.equal(day.occupied, 0);
    assert.equal(day.remaining, beforeCapacity.days[index].remaining + 2);
  });
  const mailing = background.shift()();
  assert.equal(sent.length, 0);
  releaseMail();
  await mailing;
  waitForMail = undefined;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, values.email);
  assert.match(sent[0].subject, /cancelled/);
  assert.match(sent[0].html, /no longer active/);
  assert.doesNotMatch(sent[0].html, /signature|Submit.*booking/i);
  assert.equal((await prisma.emailLog.findFirst({ where: { submissionId: current.id } })).status, "SENT");
  assert.match((await cancelSubmissionActionWithState({}, cancelForm(cancelled))).error, /already cancelled/);
  assert.match((await updateSubmissionActionWithState(null, orderForm(cancelled, { status: "ACCEPTED" }))).error, /cancelled/);
  assert.match((await updateCustomerPetActionWithState({}, petForm(cancelled))).error, /cancelled/);
  console.log(`PASS cancellation returned in ${elapsed.toFixed(0)}ms before mail; concurrent clicks send once, release two spaces, preserve payments/terms and prevent reopening.`);

  const single = await createSubmissionRecord({ ...values, hasSecondDog: false, dropoffDate: "2093-11-01", pickupDate: "2093-11-03" });
  await accept(single.submission.id);
  assert.ok((await setTotal(await load(single.submission.id), "400")).ok);
  const signed = await load(single.submission.id);
  const customerEdit = { ...formValuesFromSubmission(signed), agreed: true, signature: values.signature, manualTotal: "0", priceMode: "manual" };
  const contactOnly = await updateSubmissionRecord({ submissionId: signed.id, data: { ...customerEdit, firstName: "Updated" } });
  assert.equal(contactOnly.quote.totalPrice, 400, "Customer edits may not set a price");
  await updateSubmissionRecord({ submissionId: single.submission.id, data: { ...values, dropoffDate: "2093-11-05", pickupDate: "2093-11-07" } });
  const edited = await load(single.submission.id);
  assert.equal(edited.quotedBreakdown.manualPrice, undefined);
  assert.equal(Number(edited.quotedTotal), getSubmissionQuote(formValuesFromSubmission(edited)).totalPrice);
  assert.equal(edited.acceptedDogs, 1);
  assert.equal(edited.submissionPets.length, 2);
  const singleBefore = await availability("2093-11-01", "2093-11-03");
  failMail = true;
  assert.ok((await cancelSubmissionActionWithState({}, cancelForm(edited))).message);
  const singleAfter = await availability("2093-11-01", "2093-11-03");
  singleAfter.days.forEach((day, index) => assert.equal(day.remaining, singleBefore.days[index].remaining + 1, "Release the accepted count, not the proposed two dogs"));
  await background.shift()();
  assert.equal((await load(edited.id)).status, "CANCELLED");
  const failure = await prisma.emailLog.findFirst({ where: { submissionId: edited.id } });
  assert.equal(failure.status, "FAILED");
  assert.match(failure.error, /Simulated SMTP failure/);
  failMail = false;
  failSchedule = true;
  assert.match((await cancelSubmissionActionWithState({}, cancelForm(unchangedOther))).error, /could not be scheduled/);
  assert.equal((await load(other.submission.id)).status, "CANCELLED");
  assert.equal((await prisma.emailLog.findFirst({ where: { submissionId: other.submission.id } })).status, "FAILED");
  for (const path of ["/admin", "/admin/requests", "/admin/calendar", "/admin/reports", "/account", `/account/bookings/${current.id}`]) assert.ok(revalidated.includes(path));
  console.log("PASS one accepted dog releases exactly one space despite proposed changes; SMTP/scheduling failures preserve cancellation and are logged; all affected pages revalidate. No real emails sent.");

  failSchedule = false;
  const { loadRewards } = require("../lib/platform/loyalty.ts");
  const { netReceiptCents } = require("../lib/platform/rules.ts");
  const { recordOfflinePayment } = require("../app/admin/receipt-actions.ts");
  const { confirmRevisedPrice } = require("../app/account/actions.ts");
  const balance = async () => (await loadRewards(prisma, customerId)).balance;
  const history = await createSubmissionRecord({ ...values, dropoffDate: "2001-01-01", pickupDate: "2001-02-20" });
  assert.equal((await balance()).days, 0);
  await accept(history.submission.id);
  assert.deepEqual(await balance(), { days: 100, available: 1, daysToNext: 100 });
  const redeem = { ...values, useReward: true };
  const request = { ...redeem, rewardRequestId: crypto.randomUUID() };
  await assert.rejects(createSubmissionRecord(redeem), /unavailable/);
  const race = await Promise.allSettled([createSubmissionRecord(request, customerId), createSubmissionRecord({ ...request, rewardRequestId: crypto.randomUUID() }, customerId)]);
  const held = race.filter(result => result.status === "fulfilled");
  assert.equal(held.length, 1);
  assert.match(race.find(result => result.status === "rejected").reason.message, /unavailable/);
  const rewardId = held[0].value.submission.id;
  const retry = await createSubmissionRecord({ ...redeem, rewardRequestId: held[0].value.submission.rewardRequestId }, customerId);
  assert.ok(retry.replayed);
  assert.equal(retry.submission.id, rewardId);
  const fullPrice = getSubmissionQuote(values).totalPrice;
  const discounted = await load(rewardId);
  assert.ok(Number(discounted.quotedTotal) < fullPrice);
  assert.equal(Number(discounted.quotedTotal), fullPrice - 26);
  assert.ok((await setTotal(discounted, "99")).ok);
  const correctPickup = async earlyPickup1 => {
    const h = await load(history.submission.id);
    const result = await updateSubmissionActionWithState(null, orderForm(h, { earlyPickup1 }));
    assert.ok(result.ok, result.error);
  };
  await correctPickup("2001-02-15T10:00");
  assert.deepEqual(await balance(), { days: 95, available: 0, daysToNext: 5 });
  const revised = await load(rewardId);
  assert.equal(revised.rewardState, "RECONFIRM");
  assert.equal(revised.quotedBreakdown.manualPrice, undefined);
  assert.equal(Number(revised.quotedTotal), fullPrice);
  assert.equal(revised.submissionPets.reduce((sum, dog) => sum + Number(dog.quotedTotal), 0), fullPrice);
  await assert.rejects(accept(rewardId), /confirm/);
  assert.match((await updateSubmissionActionWithState(null, orderForm(revised, { status: "ACCEPTED" }))).error, /confirm/);
  const confirmation = { id: rewardId, revision: revised.revision, amount: revised.quotedTotal };
  assert.ok((await confirmRevisedPrice({}, form({ ...confirmation, amount: "0.01" }))).error);
  assert.ok((await confirmRevisedPrice({}, form(confirmation))).message);
  await accept(rewardId);
  assert.equal((await load(rewardId)).rewardState, "NONE");
  await correctPickup("");
  const used = await createSubmissionRecord(redeem, customerId);
  await accept(used.submission.id);
  await correctPickup("2001-02-15T10:00");
  assert.deepEqual(await balance(), { days: 95, available: 0, daysToNext: 105 });
  assert.equal(Number((await load(used.submission.id)).quotedTotal), used.quote.totalPrice);
  await correctPickup("");
  assert.equal((await balance()).available, 0);
  assert.ok((await cancelSubmissionActionWithState({}, cancelForm(await load(used.submission.id)))).message);
  assert.equal((await balance()).available, 1);
  const receiptForm = form({ id: history.submission.id, operation: "receipt", reference: "test-transfer", amount: "95.25" });
  assert.ok((await recordOfflinePayment({}, receiptForm)).message);
  assert.ok((await recordOfflinePayment({}, receiptForm)).message);
  let recorded = await load(history.submission.id);
  assert.equal(recorded.payments.length, 1);
  const refund = form({ id: recorded.id, paymentId: recorded.payments[0].id, operation: "refund", reference: "test-refund",
    amount: "15.50", previousRefund: 0 });
  assert.ok((await recordOfflinePayment({}, refund)).message);
  assert.ok((await recordOfflinePayment({}, refund)).message);
  refund.set("reference", "another-transfer");
  assert.match((await recordOfflinePayment({}, refund)).error, /changed/);
  recorded = await load(recorded.id);
  assert.equal(netReceiptCents(recorded.payments), 7975);
  assert.equal((await balance()).days, 100);
  assert.ok((await cancelSubmissionActionWithState({}, cancelForm(recorded))).message);
  assert.deepEqual(await balance(), { days: 0, available: 0, daysToNext: 100 });
  console.log("PASS historical rewards, two-dog checkout correction, concurrent reservations, verified ownership, signed repricing, protected redemptions, cancellation and idempotent partial refunds.");
} finally {
  if (customerId) {
    const where = { submission: { customerId } };
    await prisma.emailLog.deleteMany({ where });
    await prisma.payment.deleteMany({ where });
    await prisma.submission.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
  }
  await prisma.$disconnect();
}
