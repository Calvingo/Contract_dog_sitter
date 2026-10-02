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

Object.assign(process.env, {
  APP_SECRET: "customer-email-link-test-secret-only",
  CUSTOMER_SESSION_SECRET: "customer-email-link-test-secret-only",
  APP_BASE_URL: "https://boarding.example.test",
});
const tokens = new Map(), editTokens = new Map(), cookies = new Map(), messages = [];
const customers = new Map([
  ["alice@example.test", { id: "alice", email: "alice@example.test" }],
  ["bob@example.test", { id: "bob", email: "bob@example.test" }],
]);
const db = {
  platformSettings: { findUnique: async () => ({ zelleName: "Qi Zhang", zelleRecipient: "zelle@example.test" }) },
  submissionEditToken: {
    create: async ({ data }) => {
      editTokens.set(data.tokenHash, data);
      return data;
    },
    findUnique: async ({ where }) => editTokens.get(where.tokenHash) || null,
  },
  loginToken: {
    create: async ({ data }) => {
      const record = { ...data, usedAt: null };
      tokens.set(data.tokenHash, record);
      return record;
    },
    findUnique: async ({ where }) => tokens.get(where.tokenHash) || null,
  },
  customer: {
    upsert: async ({ where, create }) => {
      if (!customers.has(where.email)) customers.set(where.email, { ...create, id: "new-customer" });
      return customers.get(where.email);
    },
  },
  submission: {
    findUniqueOrThrow: async () => ({ id: "booking-alice", customer: customers.get("alice@example.test") }),
  },
};
const stubs = new Map([
  [resolve(root, "lib/db.ts"), { prisma: db }],
  [resolve(root, "lib/mailer.ts"), {
    BRAND_NAME: "Silicon Paws Retreat", getEnv: () => "sender@example.test",
    sendMail: async (message) => messages.push(message), parseAdminEmails: () => [],
  }],
  [resolve(root, "lib/email-log.ts"), { logEmail: async () => {} }],
  [resolve(root, "lib/pdf-receipt.ts"), { generateSubmissionPdf: async () => Buffer.from("test"), pdfFilename: () => "receipt.pdf" }],
]);
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === "next/headers") return {
    cookies: async () => ({
      set: (name, value, options) => cookies.set(name, { value, options }),
      get: (name) => cookies.get(name),
      delete: (name) => cookies.delete(name),
    }),
  };
  const filename = Module._resolveFilename(request, parent);
  return stubs.get(filename) || originalLoad.call(this, request, parent, ...args);
};

const { createCustomerEmailUrl, findCustomerEmailLink } = require("../lib/auth/customer-email-link.ts");
const { getCustomerSession, setCustomerSession, hashLoginToken } = require("../lib/auth/customer-session.ts");
const { GET } = require("../app/api/auth/email-entry/route.ts");
const open = (url) => GET(new Request(url));
const destination = "/account/bookings/booking-alice";
const url = await createCustomerEmailUrl(" Alice@example.test ", destination);
const parsed = new URL(url), raw = parsed.searchParams.get("token");
assert.equal(tokens.size, 1);
assert.equal(tokens.has(hashLoginToken(raw)), false, "Email tokens cannot enter the one-time login verifier");
assert.ok([...tokens.keys()].every((key) => !key.includes(raw)), "Only hashes are stored");

for (let i = 0; i < 2; i++) {
  cookies.clear();
  const response = await open(url);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), destination);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal((await getCustomerSession()).customerId, "alice", "Repeated clicks authenticate the email recipient");
  const session = cookies.get("spr_customer_session");
  assert.equal(session.options.httpOnly, true);
  assert.equal(session.options.sameSite, "lax");
}
await setCustomerSession("bob");
await open(url);
assert.equal((await getCustomerSession()).customerId, "alice", "The link switches an existing session to its recipient");

for (const next of ["/account", "https://evil.example", "//evil.example", "/admin", "/account/../admin", "/book?editToken=another-token"]) {
  const altered = new URL(url);
  altered.searchParams.set("next", next);
  cookies.clear();
  assert.equal((await open(altered)).headers.get("location"), "/login?error=expired");
  assert.equal(await getCustomerSession(), null);
}
for (const bad of ["", "invalid", raw.slice(0, -1) + (raw.endsWith("a") ? "b" : "a")]) {
  assert.equal(await findCustomerEmailLink(bad, destination), null);
}
for (const next of ["https://evil.example/account", "//evil.example/book", "/admin", "/account#secret"]) {
  await assert.rejects(createCustomerEmailUrl("alice@example.test", next));
}
const record = [...tokens.values()][0];
record.usedAt = new Date();
assert.equal(await findCustomerEmailLink(raw, destination), null, "Revoked links fail");
record.usedAt = null;
const expiry = record.expiresAt;
record.expiresAt = new Date(Date.now() - 1);
assert.equal((await open(url)).headers.get("location"), "/login?error=expired");
record.expiresAt = expiry;
tokens.delete([...tokens.keys()][0]);
assert.equal(await findCustomerEmailLink(raw, destination), null, "Deleted tokens fail");

const { sendDecisionEmail } = require("../lib/decision-emails.ts");
const { sendPaymentConfirmation } = require("../lib/platform/payment-email.ts");
const editUrl = "https://boarding.example.test/book?editToken=valid-edit-token";
const payload = { email: "alice@example.test", firstName: "Alice", lastName: "Test", petName: "Dog", submissionId: "booking-alice" };
await sendDecisionEmail(payload, "accept", { editUrl });
await sendDecisionEmail(payload, "meet_greet", { editUrl });
await sendPaymentConfirmation("booking-alice");
const expectedDestinations = [[destination, "/book?editToken=valid-edit-token"], ["/book?editToken=valid-edit-token"], [destination]];
for (const [index, message] of messages.entries()) {
  assert.equal(message.to, "alice@example.test");
  const links = [...message.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&")).filter((link) => link.startsWith("https://boarding.example.test/"));
  assert.equal(links.length, expectedDestinations[index].length);
  for (const [i, link] of links.entries()) {
    cookies.clear();
    assert.equal((await open(link)).headers.get("location"), expectedDestinations[index][i]);
    assert.equal((await getCustomerSession()).customerId, "alice");
  }
}
assert.match(messages.find((m) => m.subject.includes("Payments Requirements")).html, /zelle@example.test/);
const { buildDecisionEmail } = require("../lib/decision-emails.ts");
const decisionPayload = { email: "alice@example.test", firstName: "Alice", lastName: "Test", petName: "<Dog>", exp: 123 };
for (const action of ["accept", "meet_greet"]) {
  const content = buildDecisionEmail(decisionPayload, action, { accountUrl: "https://example.test/account", zelleName: "Qi <Zhang>", zelleRecipient: "pay@example.test" });
  assert.match(content.html, /front yard/);
  assert.match(content.html, /don’t offer tours of the indoor or backyard/);
  assert.match(content.html, /LYSX6989/);
  assert.ok(!content.html.includes("<Dog>"));
  if (action === "accept") {
    assert.match(content.subject, /Payments Requirements$/);
    assert.match(content.html, /font-size:26px[^;]*;.*color:#b91c1c/);
    assert.match(content.html, /pay your 20% deposit/);
    assert.match(content.html, /not yet confirmed/);
    assert.match(content.html, /Qi &lt;Zhang&gt;/);
  }
}
const { sendSubmissionEmails } = require("../lib/email.ts");
const { initialFormValues } = require("../lib/form-config.ts");
await sendSubmissionEmails({
  ...initialFormValues, email: "alice@example.test", firstName: "Alice", petName: "Dog",
  petWeightLb: "20", petAgeYears: "2", prescreenSpayedNeutered: "yes",
  dropoffDate: "2027-04-01", dropoffTime: "10:00", pickupDate: "2027-04-02", pickupTime: "10:00",
}, Buffer.from("test"), "booking-alice", { sendAdminNotification: false });
const receipt = messages.at(-1);
const receiptLink = receipt.html.match(/href="([^"]+)"[^>]*>Edit your submission/)[1].replaceAll("&amp;", "&");
cookies.clear();
const receiptResponse = await open(receiptLink);
assert.match(receiptResponse.headers.get("location"), /^\/book\?editToken=/);
assert.equal((await getCustomerSession()).customerId, "alice");

// Old edit links bypass the new entry route, but must still support account navigation.
const { GET: editGET } = require("../app/api/submission/edit/route.ts");
const editRecord = [...editTokens.values()][0];
editRecord.submission = {
  customerId: "alice", status: "ACCEPTED", revision: 1,
  firstTimeBooking: "yes", dropoffAt: new Date("2027-04-01T10:00:00Z"), pickupAt: new Date("2027-04-02T10:00:00Z"),
  prescreenAnswers: {}, customerSnapshot: { email: "alice@example.test" }, petSnapshot: {},
};
const oldToken = new URL(receiptResponse.headers.get("location"), process.env.APP_BASE_URL).searchParams.get("editToken");
cookies.clear();
const editResponse = await editGET(new Request(`https://boarding.example.test/api/submission/edit?token=${oldToken}`));
assert.equal(editResponse.status, 200);
assert.equal((await getCustomerSession()).customerId, "alice");
assert.equal(editResponse.headers.get("cache-control"), "no-store");
editRecord.expiresAt = new Date(0);
cookies.clear();
assert.equal((await editGET(new Request(`https://boarding.example.test/api/submission/edit?token=${oldToken}`))).status, 403);
assert.equal(await getCustomerSession(), null);
console.log("PASS customer email links: hashed storage, direct destination, repeat clicks, recipient session, tampering, expiry, revocation, unsafe redirects, receipt/acceptance/meet-and-greet/payment emails and legacy edit links. No database or real emails used.");
