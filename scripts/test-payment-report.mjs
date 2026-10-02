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
      assert.equal(capacityChecked, true);
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
assert.match((await reportPayment({}, form)).error, /already awaiting review/);
assert.equal(booking.payments.length, 2, "Duplicate clicks cannot create another report");

for (const [change, error] of [
  [() => { booking.customerId = "another-customer"; }, /approved/],
  [() => { booking.status = "PENDING"; }, /approved/],
  [() => { booking.status = "CANCELLED"; }, /approved/],
  [() => { booking.holdExpiresAt = null; }, /existing reservation/],
  [() => { booking.holdExpiresAt = new Date(0); }, /expired/],
  [() => { booking.payments = [{ amount: 20, status: "VERIFIED" }]; }, /already verified/],
  [() => { settings.zelleRecipient = settings.zelleName = ""; }, /not currently available/],
  [() => { capacityAvailable = false; }, /No capacity/],
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
console.log("PASS one-click payment reporting, server-calculated amount, pending verification, duplicate prevention, ownership, approval, expiry, capacity and configured recipients. No database writes or transfers performed.");
