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
  return originalResolve.call(this, request.startsWith("@/") ? resolve(root, request.slice(2)) : request, ...args);
};
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
let booking, settings, saved, locked, capacityChecked, capacityAvailable;
const reset = () => {
  booking = {
    id: "booking-a", customerId: "customer-a", status: "ACCEPTED",
    holdExpiresAt: new Date(Date.now() + 3600000), quotedTotal: 100,
    dropoffAt: new Date("2027-04-01"), pickupAt: new Date("2027-04-02"),
    payments: [], submissionPets: [{}],
  };
  settings = { zelleRecipient: "6692694827", zelleName: "Qi ZHANG", venmoUsername: "", venmoName: "", holdHours: 24 };
  saved = null;
  locked = capacityChecked = false;
  capacityAvailable = true;
};
const tx = {
  submission: {
    findFirst: async ({ where }) => {
      assert.equal(locked, true, "Reports must lock before checking for duplicates");
      return where.id === booking.id && where.customerId === booking.customerId ? booking : null;
    },
    update: async ({ data }) => Object.assign(booking, data),
  },
  payment: {
    create: async ({ data }) => {
      assert.equal(capacityChecked, false, "Payment reporting never checks or changes capacity");
      saved = { ...data, status: "REPORTED" };
      booking.payments.push(saved);
      return saved;
    },
  },
};
const stubs = new Map([
  [resolve(root, "lib/db.ts"), { prisma: { $transaction: async (fn) => fn(tx) } }],
  [resolve(root, "lib/platform/auth.ts"), { requireCustomer: async () => ({ id: "customer-a" }) }],
  [resolve(root, "lib/platform/capacity.ts"), {
    lockCapacity: async () => { locked = true; },
    getSettings: async () => settings,
    assertCapacity: async () => {
      capacityChecked = true;
      if (!capacityAvailable) throw new Error("No capacity available");
    },
  }],
]);
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === "next/cache") return { revalidatePath: () => {} };
  return stubs.get(Module._resolveFilename(request, parent)) || originalLoad.call(this, request, parent, ...args);
};
const { reportPayment } = require("../app/account/actions.ts");
const form = new FormData();
form.set("id", "booking-a");
reset();
booking.payments.push({ amount: 5, status: "VERIFIED" });
assert.ok((await reportPayment({}, form)).message, "Only a booking ID is required");
assert.equal(saved.amount, 15, "Amount is the remaining deposit calculated on the server");
assert.equal(saved.method, "TRANSFER");
assert.equal(saved.payerName, "", "Do not invent transfer details");
assert.equal(saved.reference, "");
assert.equal(saved.status, "REPORTED", "Reporting never verifies funds");
assert.match((await reportPayment({}, form)).error, /already recorded/);
assert.equal(booking.payments.length, 2, "Duplicate clicks cannot create another report");

for (const [change, error] of [
  [() => { booking.customerId = "another-customer"; }, /approved/],
  [() => { booking.status = "PENDING"; }, /approved/],
  [() => { booking.status = "CANCELLED"; }, /approved/],
  [() => { booking.payments = [{ amount: 20, status: "VERIFIED" }]; }, /already been recorded/],
  [() => { settings.zelleRecipient = settings.zelleName = ""; }, /not currently available/],
]) {
  reset();
  change();
  assert.match((await reportPayment({}, form)).error, error);
  assert.equal(saved, null, "Invalid reports must not create payments");
}
reset();
settings = { ...settings, zelleName: "", zelleRecipient: "", venmoName: "Recipient", venmoUsername: "recipient" };
assert.ok((await reportPayment({}, form)).message, "A Venmo-only configuration works too");
assert.ok((await reportPayment({}, new FormData())).error);
console.log("PASS one-click payment reporting, server-calculated amount, non-blocking notifications, duplicate prevention, ownership, approval, expiry/capacity independence and configured recipients. No database writes or transfers performed.");

for (const deadline of [null, new Date(0)]) {
  reset(); booking.holdExpiresAt = deadline; capacityAvailable = false;
  assert.ok((await reportPayment({}, form)).message, "Accepted stay can report payment after expiry, even if limit was lowered");
  assert.equal(booking.holdExpiresAt, deadline);
}

// The admin payment report is read-only and separates unverified claims from history.
const { paymentSummary, recordedPaymentAmount } = require("../lib/platform/rules.ts");
assert.deepEqual(paymentSummary([]), { reportedCount: 0, reportedAmount: 0, historicalVerifiedAmount: 0, historicalRefundedAmount: 0 });
const reportRows = Object.freeze([
  { id: "reported", status: "REPORTED", amount: 20, reference: "reported-reference" },
  { id: "verified", status: "VERIFIED", amount: 30, reference: "verified-reference" },
  { id: "refunded", status: "REFUNDED", amount: 40, reference: "refund-reference" },
  { id: "rejected", status: "REJECTED", amount: 50, reference: "rejected-reference" },
].map(row => Object.freeze({
  ...row, method: "TRANSFER", payerName: "", createdAt: new Date("2026-01-01T12:00:00Z"), reviewNote: "Historical note", submissionId: "booking-a",
  submission: { id: "booking-a", status: "ACCEPTED", acceptedRevision: 1, acceptedDepositPolicySnapshot: { nonRefundable: true, nonRefundableAmount: 20 }, customer: { firstName: "Report", lastName: "Test" } },
})));
assert.deepEqual(paymentSummary(reportRows), { reportedCount: 1, reportedAmount: 20, historicalVerifiedAmount: 30, historicalRefundedAmount: 40 });
assert.equal(recordedPaymentAmount({ payments: reportRows }), 50, "Refunded and rejected entries do not count as reported deposits");
assert.equal(paymentSummary([{ status: "REPORTED", amount: 0.1 }, { status: "REPORTED", amount: 0.2 }]).reportedAmount, 0.3);
require.extensions[".tsx"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
let adminAllowed = true, reportReads = 0;
stubs.set(resolve(root, "lib/platform/auth.ts"), { requirePlatformAdmin: async () => {
  if (!adminAllowed) throw new Error("Unauthorized");
  return { email: "admin@example.test" };
} });
stubs.set(resolve(root, "lib/db.ts"), { prisma: { payment: { findMany: async () => { reportReads++; return reportRows; } } } });
stubs.set(resolve(root, "app/admin/admin-ui.tsx"), {
  AdminShell: ({ title, subtitle, children }) => React.createElement("section", null, title, subtitle, children),
  Stat: ({ label, value }) => React.createElement("p", null, label, " ", value),
  money: amount => `$${Number(amount).toFixed(2)}`,
});
const PaymentsPage = require("../app/admin/payments/page.tsx").default;
const reportHtml = renderToStaticMarkup(await PaymentsPage());
assert.match(reportHtml, /All payments and refunds are handled offline/);
assert.match(reportHtml, /Reported amount · unverified[^<]*\$20.00/);
assert.match(reportHtml, /Historical verified amount[^<]*\$30.00/);
assert.match(reportHtml, /Historical refunded amount[^<]*\$40.00/);
assert.match(reportHtml, /Historical note/);
assert.match(reportHtml, /refund-reference/);
assert.doesNotMatch(reportHtml, /Record refund|Verify [Dd]eposit|<form|<input|<button/, "The payment report exposes no financial mutation controls");
adminAllowed = false;
await assert.rejects(PaymentsPage(), /Unauthorized/);
assert.equal(reportReads, 1, "An unauthorized viewer cannot read payment records");
console.log("PASS read-only admin report: distinct notification/history totals, cent rounding, retained notes/references, no payment/refund controls and admin authorization.");
