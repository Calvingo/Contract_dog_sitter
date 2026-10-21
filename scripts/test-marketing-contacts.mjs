import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.TEST_DATABASE_URL) {
  console.log("SKIP marketing contact integration checks (set TEST_DATABASE_URL)");
  process.exit(0);
}
const url = new URL(process.env.TEST_DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55439", "Use the isolated local test database on port 55439 only");
Object.assign(process.env, { DATABASE_URL: url.href, DIRECT_URL: url.href });
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith("@/") ? resolve(root, request.slice(2)) : request, ...args);
};
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
let isAdmin = true;
const revalidated = [];
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === "next/cache") return { revalidatePath: (path) => revalidated.push(path) };
  if (request === "nodemailer") return { createTransport: () => assert.fail("No real email in this test") };
  if (Module._resolveFilename(request, parent) === resolve(root, "lib/platform/auth.ts")) return {
    requirePlatformAdmin: async () => {
      if (!isAdmin) throw new Error("ADMIN_REQUIRED");
      return { email: "admin@example.test" };
    },
  };
  return originalLoad.call(this, request, parent, ...args);
};
const { prisma } = require("../lib/db.ts");
const { manageMarketingContact } = require("../app/admin/marketing/contacts/actions.ts");
const { marketingContacts } = require("../lib/marketing/contacts.ts");
const { customerAudience } = require("../lib/platform/customers.ts");
const { canReceiveMarketing } = require("../lib/marketing/audience.ts");
const stamp = `contact-test-${Date.now()}`;
const ids = [];
let campaign;
const form = (id, action) => {
  const data = new FormData();
  data.set("customerId", id);
  data.set("action", action);
  return data;
};
async function customer(label, extra = {}) {
  const value = await prisma.customer.create({ data: {
    firstName: label, lastName: stamp, email: `${stamp}-${label}@example.test`, phone: "5551234567", backupContact: "email", ...extra,
  } });
  ids.push(value.id);
  return value;
}
try {
  const legacy = await customer("legacy");
  const optedOut = await customer("optout", { marketingConsentUpdatedAt: new Date() });
  const inactive = await customer("inactive", { deactivatedAt: new Date() });
  const suppressed = await customer("suppressed", { emailMarketingOptIn: true });
  await prisma.marketingSuppression.create({ data: { email: suppressed.email, reason: "Test bounce" } });
  let contacts = await marketingContacts();
  assert.equal(contacts.find((c) => c.id === legacy.id).status, "Promotion on");
  assert.equal(contacts.find((c) => c.id === optedOut.id).status, "Unsubscribed");
  assert.equal(contacts.find((c) => c.id === inactive.id).status, "Account inactive");
  assert.equal(contacts.find((c) => c.id === suppressed.id).status, "Blocked");

  const pet = await prisma.pet.create({ data: { customerId: legacy.id, name: "Milo", breed: "Poodle", weightLb: 20 } });
  await prisma.submission.create({ data: {
    customerId: legacy.id, petId: pet.id, firstTimeBooking: "no",
    dropoffAt: new Date("2090-11-15"), pickupAt: new Date("2090-11-18"),
    quotedTotal: 100, quotedBreakdown: {}, prescreenAnswers: {}, agreedAt: new Date(), signatureData: "test",
    customerSnapshot: { email: legacy.email }, petSnapshot: { name: "Milo" },
  } });
  campaign = await prisma.marketingCampaign.create({ data: {
    name: stamp, subject: "Test", body: "Test only", allCustomers: true, excludeStart: "", excludeEnd: "",
    scheduledAt: new Date(), createdBy: "admin@example.test",
  } });
  const queued = await prisma.marketingDelivery.create({ data: { campaignId: campaign.id, customerId: legacy.id, email: legacy.email } });

  isAdmin = false;
  await assert.rejects(manageMarketingContact({}, form(legacy.id, "delete")), /ADMIN_REQUIRED/);
  assert.equal((await prisma.customer.findUnique({ where: { id: legacy.id } })).marketingEmailDeletedAt, null);
  isAdmin = true;
  assert.ok((await manageMarketingContact({}, form(legacy.id, "invalid"))).error);
  assert.ok((await manageMarketingContact({}, form("missing-id", "block"))).error);
  assert.ok((await manageMarketingContact({}, form(inactive.id, "enable"))).error);

  assert.ok((await manageMarketingContact({}, form(legacy.id, "block"))).message);
  let record = await prisma.customer.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.equal(canReceiveMarketing(record, true), false);
  assert.ok(await prisma.marketingSuppression.findUnique({ where: { email: legacy.email } }));
  assert.equal((await prisma.marketingDelivery.findUnique({ where: { id: queued.id } })).status, "SKIPPED");
  assert.ok((await manageMarketingContact({}, form(legacy.id, "enable"))).message);
  record = await prisma.customer.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.equal(canReceiveMarketing(record, true), true);
  assert.equal(await prisma.marketingSuppression.findUnique({ where: { email: legacy.email } }), null);
  assert.equal((await prisma.marketingDelivery.findUnique({ where: { id: queued.id } })).status, "SKIPPED", "Enabling must not replay skipped emails");

  assert.ok((await manageMarketingContact({}, form(legacy.id, "delete"))).message);
  record = await prisma.customer.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.ok(record.marketingEmailDeletedAt);
  assert.equal(record.email, legacy.email, "Account identity must be kept");
  assert.equal(record.sessionVersion, legacy.sessionVersion);
  assert.equal(record.deactivatedAt, null);
  assert.equal(await prisma.pet.count({ where: { customerId: legacy.id } }), 1);
  assert.equal(await prisma.submission.count({ where: { customerId: legacy.id } }), 1, "Deleting a marketing email must preserve bookings");
  assert.ok((await manageMarketingContact({}, form(legacy.id, "enable"))).error, "Deleted addresses need explicit restoration");
  // Even a subsequent account preference update cannot re-add a deleted email.
  await prisma.customer.update({ where: { id: legacy.id }, data: { emailMarketingOptIn: true } });
  for (const channel of ["saved", "email"])
    assert.ok(!(await customerAudience({ q: stamp, channel })).customers.some((c) => c.id === legacy.id));
  assert.ok((await customerAudience({ q: stamp, channel: "all" })).customers.some((c) => c.id === legacy.id));

  assert.ok((await manageMarketingContact({}, form(legacy.id, "restore"))).message);
  contacts = await marketingContacts();
  assert.equal(contacts.find((c) => c.id === legacy.id).status, "Blocked");
  assert.ok((await manageMarketingContact({}, form(legacy.id, "enable"))).message);
  assert.ok((await customerAudience({ q: stamp, channel: "saved" })).customers.some((c) => c.id === legacy.id));
  const events = await prisma.marketingConsentEvent.findMany({ where: { customerId: legacy.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(events.map((event) => event.source.split(":").at(-1)), ["block", "enable", "delete", "restore", "enable"]);
  assert.ok(revalidated.includes("/admin/customers") && revalidated.includes("/admin/marketing"));
  console.log("PASS admin authorization, email listing/status, promotion toggle, queue suppression, deletion/restoration, retained bookings, audience exclusion and audit history");
} finally {
  if (campaign) await prisma.marketingCampaign.delete({ where: { id: campaign.id } });
  await prisma.submission.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  await prisma.marketingSuppression.deleteMany({ where: { email: { startsWith: stamp } } });
  await prisma.$disconnect();
}
