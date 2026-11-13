import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url), ts = require("typescript");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith("@/") ? resolve(root, request.slice(2)) : request, ...args);
};
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const { initialFormValues, prescreenQuestions, secondPrescreenQuestions } = require("../lib/form-config.ts");
const { getBookingFieldErrors, bookingFieldLabels } = require("../lib/booking-validation.ts");
const { validateSubmission, validateSubmissionDetails } = require("../lib/validate.ts");
const valid = {
  ...initialFormValues,
  ...Object.fromEntries(prescreenQuestions.map(q => [q.name, "no"])),
  firstName: "Test", lastName: "Owner", email: "test@example.com", phone: "+1 (650) 555-0100",
  backupContact: "email", emergencyContactName: "Emergency", emergencyContactPhone: "650-555-0101 ext. 12",
  petName: "Puppy", petBreed: "Mix", petWeightLb: "4.5", petAgeYears: "0.5",
  dropoffDate: "2090-04-10", pickupDate: "2090-04-11", dropoffTime: "10:00", pickupTime: "11:00",
  agreed: true, signature: "data:image/png;base64,dGVzdA==",
};
assert.deepEqual(getBookingFieldErrors(valid), {});
assert.equal(validateSubmission(valid), null);
const empty = getBookingFieldErrors(initialFormValues, { hasReadAgreement: false });
for (const key of ["email", "firstName", "phone", "dropoffDate", "dropoffTime", "petName", "petAgeYears", "prescreenAggression", "agreed", "signature"]) {
  assert.ok(empty[key], `${key} has actionable feedback`);
  assert.ok(bookingFieldLabels[key], `${key} has a readable summary label`);
}
assert.equal(empty.secondPetName, undefined, "Hidden second dog is optional");
assert.equal(empty.wechatId, undefined, "WeChat is only required when selected");
assert.ok(getBookingFieldErrors({ ...valid, backupContact: "wechat" }).wechatId);
assert.equal(getBookingFieldErrors({ ...valid, backupContact: "wechat", wechatId: "owner" }).wechatId, undefined);

for (const [key, value] of [
  ["firstName", "  "], ["email", "owner@"], ["phone", "abc"], ["emergencyContactPhone", "123"],
  ["petWeightLb", "0"], ["petWeightLb", "-2"], ["petWeightLb", "Infinity"], ["petAgeYears", "-1"],
  ["dropoffDate", "2090-02-30"], ["pickupDate", "2090-99-01"], ["dropoffTime", "25:30"],
  ["pickupTime", "22:00"], ["backupContact", "unknown"], ["prescreenAggression", "maybe"],
  ["agreed", false], ["signature", "invalid"],
]) assert.ok(getBookingFieldErrors({ ...valid, [key]: value })[key], `${key} rejects ${value}`);
assert.equal(getBookingFieldErrors({ ...valid, petAgeYears: "0" }).petAgeYears, undefined);
assert.ok(getBookingFieldErrors(valid, { minimumDate: "2090-04-11" }).dropoffDate);
assert.ok(getBookingFieldErrors({ ...valid, pickupDate: valid.dropoffDate, pickupTime: "09:00" }).pickupTime);
assert.match(getBookingFieldErrors({ ...valid, pickupDate: "2092-04-11" }).pickupDate, /one year/);
assert.match(getBookingFieldErrors({ ...valid, dropoffDate: "2090-04-09", dropoffTime: "15:00" }).dropoffTime, /Sundays/);
assert.match(getBookingFieldErrors(valid, { hasReadAgreement: false }).agreed, /read/);

const twoDogs = {
  ...valid, hasSecondDog: true, secondPetName: "Older dog", secondPetBreed: "Mix", secondPetWeightLb: "20", secondPetAgeYears: "3",
  ...Object.fromEntries(secondPrescreenQuestions.map(q => [q.name, "yes"])),
};
assert.deepEqual(getBookingFieldErrors(twoDogs), {});
assert.ok(getBookingFieldErrors({ ...twoDogs, secondPetName: " puppy " }).secondPetName);
assert.ok(getBookingFieldErrors({ ...twoDogs, secondPrescreenBitten: "" }).secondPrescreenBitten);
assert.ok(getBookingFieldErrors({ ...twoDogs, secondPetAgeYears: "" }).secondPetAgeYears);
assert.match(bookingFieldLabels.secondPetName, /Dog 2/);
assert.equal(validateSubmissionDetails({ ...valid, honeypot: "spam" }).error, "Invalid submission");

// Exercise both real HTTP handlers without any database writes or email sends.
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  const path = request.startsWith("@/") ? request.slice(2) : "";
  if (path === "lib/auth/customer-session") return { getCustomerSession: async () => null };
  if (path === "lib/db") return { prisma: {} };
  if (path === "lib/platform/capacity") return { BookingConflict: class extends Error {} };
  if (path === "lib/submission-edit-token") return { findValidSubmissionEditToken: async () => ({ submission: { status: "PENDING" } }) };
  if (["lib/services/submission-service", "lib/services/submission-notification", "lib/platform/rate-limit"].includes(path))
    return new Proxy({}, { get: (_, name) => () => { throw new Error(`Unexpected side effect: ${String(name)}`); } });
  return originalLoad.call(this, request, parent, ...args);
};
const { POST: submit } = require("../app/api/submit/route.ts");
const { POST: edit } = require("../app/api/submission/edit/route.ts");
for (const handler of [submit, edit]) {
  const invalid = { ...valid, email: "invalid", firstName: "", phone: "abc", signature: "" };
  const response = await handler(new Request("http://localhost/api/submit", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(handler === edit ? { token: "test", values: invalid } : invalid),
  }));
  assert.equal(response.status, 400);
  const { error, fieldErrors } = await response.json();
  assert.ok(error);
  for (const key of ["email", "firstName", "phone", "signature"]) assert.ok(fieldErrors[key]);
  const past = { ...valid, dropoffDate: "2000-01-01", pickupDate: "2000-01-02" };
  const pastResponse = await handler(new Request("http://localhost/api/submit", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(handler === edit ? { token: "test", values: past } : past),
  }));
  assert.equal(pastResponse.status, 400);
  assert.ok((await pastResponse.json()).fieldErrors.dropoffDate);
}
console.log("PASS booking validation: all missing fields, formats, conditional dogs/WeChat, dates, agreement/signature, and structured errors from new/edit HTTP handlers. No database or email side effects.");
