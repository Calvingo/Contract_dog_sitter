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

let signedIn = true, isAdmin = true, clearedSession = false, serviceError = "";
let profile = { id: "owner", email: "owner@example.test", emailMarketingOptIn: false, smsMarketingOptIn: true };
let events = [];
const calls = [], revalidated = [];
const services = {
  lockCustomerProfile: async (_tx, id) => assert.equal(id, "owner"),
  saveCustomerDetails: async (id, input, tx) => {
    if (serviceError) throw new Error(serviceError);
    assert.ok(tx, "Contact and marketing changes must share one transaction");
    calls.push({ action: "details", id, input });
    return tx.customer.update({ where: { id }, data: input });
  },
};
for (const action of ["saveCustomerDog", "archiveCustomerDog", "restoreCustomerDog", "deactivateCustomerAccount", "restoreCustomerAccount"])
  services[action] = async (...args) => {
    if (serviceError) throw new Error(serviceError);
    calls.push({ action, args });
  };
const db = {
  $transaction: async (run) => {
    let nextProfile = { ...profile };
    const nextEvents = [...events];
    const result = await run({
      customer: {
        findUniqueOrThrow: async () => ({ ...nextProfile }),
        update: async ({ where, data }) => {
          assert.equal(where.id, "owner");
          nextProfile = { ...nextProfile, ...data };
          return nextProfile;
        },
      },
      marketingConsentEvent: { create: async ({ data }) => nextEvents.push(data) },
    });
    profile = nextProfile;
    events = nextEvents;
    return result;
  },
};
const stubs = new Map([
  [resolve(root, "lib/db.ts"), { prisma: db }],
  [resolve(root, "lib/services/customer-profile.ts"), services],
  [resolve(root, "lib/platform/auth.ts"), {
    requireCustomer: async () => {
      if (!signedIn) throw new Error("LOGIN_REQUIRED");
      return { ...profile };
    },
    requirePlatformAdmin: async () => {
      if (!isAdmin) throw new Error("ADMIN_REQUIRED");
      return { email: "admin@example.test" };
    },
  }],
  [resolve(root, "lib/auth/customer-session.ts"), { clearCustomerSession: async () => { clearedSession = true; } }],
  [resolve(root, "lib/submission-edit-token.ts"), {}],
]);
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === "next/cache") return { revalidatePath: (path) => revalidated.push(path) };
  if (request === "next/navigation") return { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } };
  if (request === "nodemailer") return { createTransport: () => assert.fail("No real emails in this test") };
  return stubs.get(Module._resolveFilename(request, parent)) || originalLoad.call(this, request, parent, ...args);
};
const { saveProfile, saveDog, archiveDog, restoreDog, deactivateAccount } = require("../app/account/actions.ts");
const { restoreAccount } = require("../app/admin/customers/actions.ts");
const { prescreenQuestions } = require("../lib/form-config.ts");
const form = (values) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const contact = {
  firstName: "Owner", lastName: "Updated", phone: "5551234567", backupContact: "wechat",
  emergencyContactName: "Trusted Friend", emergencyContactPhone: "5559876543", wechatId: "owner-wechat",
};
const profileForm = form({ ...contact, emailOptIn: "on", email: "attacker@example.test", customerId: "someone-else" });
assert.ok((await saveProfile({}, profileForm)).message);
assert.deepEqual(calls.at(-1), { action: "details", id: "owner", input: contact });
assert.equal(profile.email, "owner@example.test", "A contact form cannot change the verified identity");
assert.equal(profile.emailMarketingOptIn, true);
assert.equal(profile.smsMarketingOptIn, false);
assert.deepEqual(events, [{ customerId: "owner", emailOptIn: true, smsOptIn: false, source: "account-email-preferences-v2" }]);
await saveProfile({}, profileForm);
assert.equal(events.length, 1, "Unchanged preferences must not add duplicate consent events");
await saveProfile({}, form(contact));
assert.equal(profile.emailMarketingOptIn, false);
assert.equal(events.length, 2);
const beforeFailure = { ...profile };
serviceError = "Enter a valid WeChat ID.";
assert.equal((await saveProfile({}, profileForm)).error, serviceError);
assert.deepEqual(profile, beforeFailure);
assert.equal(events.length, 2, "Invalid contact details must not commit consent changes");
serviceError = "";

const answers = Object.fromEntries(prescreenQuestions.map((question, index) => [question.name, index % 2 ? "yes" : "no"]));
const dogFields = { id: "dog-id", name: "Pocky", breed: "Corgi", weightLb: "20", ageYears: "0", ...answers, prescreenNotes: "Dinner at 6 pm" };
assert.ok((await saveDog({}, form({ ...dogFields, customerId: "someone-else" }))).message);
assert.deepEqual(calls.at(-1), { action: "saveCustomerDog", args: ["owner", {
  id: "dog-id", name: "Pocky", breed: "Corgi", weightLb: "20", ageYears: "0", prescreenAnswers: answers, prescreenNotes: "Dinner at 6 pm",
}] });
for (const [action, service] of [[archiveDog, "archiveCustomerDog"], [restoreDog, "restoreCustomerDog"]]) {
  assert.ok((await action({}, form({ id: "dog-id", customerId: "someone-else" }))).message);
  assert.deepEqual(calls.at(-1), { action: service, args: ["owner", "dog-id"] });
}
assert.ok(revalidated.includes("/book"), "Future booking prefill must be refreshed");

const beforeUnconfirmed = calls.length;
assert.match((await deactivateAccount({}, new FormData())).error, /Confirm/);
assert.equal(calls.length, beforeUnconfirmed);
assert.equal(clearedSession, false);
signedIn = false;
for (const action of [saveProfile, saveDog, archiveDog, restoreDog, deactivateAccount])
  await assert.rejects(action({}, form({ confirmDeactivation: "on" })), /LOGIN_REQUIRED/);
assert.equal(calls.length, beforeUnconfirmed, "Unauthenticated actions must never reach profile services");
signedIn = true;
await assert.rejects(deactivateAccount({}, form({ confirmDeactivation: "on", customerId: "someone-else" })), /REDIRECT:\/login\?deactivated=1/);
assert.deepEqual(calls.at(-1), { action: "deactivateCustomerAccount", args: ["owner"] });
assert.equal(clearedSession, true);
isAdmin = false;
const beforeAdmin = calls.length;
await assert.rejects(restoreAccount({}, form({ customerId: "owner" })), /ADMIN_REQUIRED/);
assert.equal(calls.length, beforeAdmin);
isAdmin = true;
assert.ok((await restoreAccount({}, form({ customerId: "owner" }))).message);
assert.deepEqual(calls.at(-1), { action: "restoreCustomerAccount", args: ["owner"] });
console.log("PASS account action authorization, verified identity, atomic contact/consent changes, care data mapping, scoped archive/restore, confirmed deactivation and admin-only restoration. No database or real email used.");
