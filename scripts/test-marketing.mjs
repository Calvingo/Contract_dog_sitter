import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url),
  ts = require("typescript"),
  originalResolve = Module._resolveFilename;
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
const {
  holidaySchedule,
  emailContent,
  validateCampaign,
  returningGuestTemplate,
  BOOKING_WEBSITE,
} = require("../lib/marketing/templates.ts");
assert.equal(
  holidaySchedule("thanksgiving", 2026).scheduledAt.toISOString(),
  "2026-08-26T17:00:00.000Z",
);
assert.equal(
  holidaySchedule("thanksgiving", 2027).scheduledAt.toISOString(),
  "2027-08-25T17:00:00.000Z",
);
assert.equal(
  holidaySchedule("christmas", 2027).scheduledAt.toISOString(),
  "2027-09-25T17:00:00.000Z",
);
assert.equal(
  holidaySchedule("summer", 2027).scheduledAt.toISOString(),
  "2027-03-01T17:00:00.000Z",
);
assert.ok(
  !emailContent(
    '<script>alert("x")</script>',
    "https://example.test/book",
    "https://example.test/unsubscribe",
    "Address",
  ).html.includes("<script>"),
);
assert.throws(() =>
  validateCampaign({
    name: "Test",
    subject: "Header\r\nInjection",
    body: "Valid length",
    excludeStart: "2027-11-01",
    excludeEnd: "2027-11-30",
    scheduledAt: new Date("2027-08-01"),
  }),
);
const personalized = emailContent(returningGuestTemplate.body, BOOKING_WEBSITE, "https://example.test/unsubscribe", "Test address", {
  firstName: "Alice <script>", petName: "Milo & Luna", imageUrl: "https://example.test/image.png",
});
assert.ok(personalized.html.includes("Hi Alice &lt;script&gt;"));
assert.ok(personalized.html.includes("Reserve Milo &amp; Luna’s next stay here"));
assert.ok(personalized.html.includes(`href="${BOOKING_WEBSITE}"`));
assert.ok(personalized.html.includes('<img src="https://example.test/image.png"'));
assert.ok(!personalized.html.includes("{{"));
assert.ok(!personalized.html.includes("<script>"));
assert.ok(personalized.text.includes("Reserve Milo & Luna’s next stay here"));
assert.ok(!emailContent("custom message", BOOKING_WEBSITE, "#", "", { imageUrl: 'javascript:alert(1)' }).html.includes("<img"));
validateCampaign({ name: "All", subject: "Hello", body: "Hello everyone", allCustomers: true, excludeStart: "", excludeEnd: "", scheduledAt: new Date() });
const { canReceiveMarketing } = require("../lib/marketing/audience.ts");
assert.equal(canReceiveMarketing({ emailMarketingOptIn: false, marketingConsentUpdatedAt: null }, true), true);
assert.equal(canReceiveMarketing({ emailMarketingOptIn: false, marketingConsentUpdatedAt: new Date() }, true), false);
assert.equal(canReceiveMarketing({ emailMarketingOptIn: false, marketingConsentUpdatedAt: null }, false), false);
const { validateMarketingImage } = require("../lib/marketing/images.ts");
validateMarketingImage(Buffer.from([137,80,78,71,13,10,26,10]), "image/png");
assert.throws(() => validateMarketingImage(Buffer.from("<svg onload='alert(1)'/>"), "image/png"));
assert.throws(() => validateMarketingImage(Buffer.alloc(2 * 1024 * 1024 + 1), "image/png"));
console.log("PASS holiday dates, email escaping and validation");
if (!process.env.TEST_DATABASE_URL) {
  console.log("SKIP local database checks (set TEST_DATABASE_URL)");
  process.exit(0);
}
const url = new URL(process.env.TEST_DATABASE_URL);
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55439",
  "Tests require the isolated local database on port 55439",
);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
Object.assign(process.env, {
  APP_SECRET: "marketing-local-test-session-secret",
  MARKETING_ENABLED: "true",
  MARKETING_FROM: "Local Test <sender@example.test>",
  GMAIL_USER: "sender@example.test",
  GMAIL_APP_PASSWORD: "not-a-real-password",
  MARKETING_POSTAL_ADDRESS: "Test address only",
  APP_BASE_URL: "https://example.test",
  MARKETING_TOKEN_SECRET: "test-only-marketing-secret-32-characters",
  CRON_SECRET: "test-only-cron-secret-32-characters",
});
const { prisma } = require("../lib/db.ts");
const {
  runMarketing,
  syncHolidayCampaigns,
} = require("../lib/marketing/worker.ts");
const { ProviderError } = require("../lib/marketing/provider.ts");
const {
  unsubscribeToken,
  unsubscribeCustomer,
  unsubscribe,
} = require("../lib/marketing/unsubscribe.ts");
const { allowRequest } = require("../lib/platform/rate-limit.ts");
const { GET: cron } = require("../app/api/cron/marketing/route.ts");
const { sendCampaignTest } = require("../lib/marketing/test-email.ts");
const { getMarketingConfig } = require("../lib/marketing/config.ts");
const stamp = `marketing-test-${Date.now()}`,
  customers = [],
  campaigns = [];
const sendCalls = [];
const previousSettings = await prisma.marketingSettings.findUnique({
  where: { id: "default" },
});
const testAdmin = `${stamp}-admin@example.test`;
process.env.ADMIN_EMAIL = testAdmin;
const send = async (payload, key) => {
  sendCalls.push({ payload, key });
  return `test-${key}`;
};
async function customer(label) {
  const c = await prisma.customer.create({
    data: {
      firstName: "Marketing",
      lastName: stamp,
      email: `${stamp}-${label}@example.test`,
      phone: "+15555550100",
      backupContact: "email",
      emailMarketingOptIn: true,
    },
  });
  customers.push(c);
  return c;
}
async function campaign(status = "RUNNING") {
  const c = await prisma.marketingCampaign.create({
    data: {
      name: stamp,
      subject: "Test promotion",
      body: "This is a test promotion.",
      excludeStart: "2090-11-01",
      excludeEnd: "2090-11-30",
      scheduledAt: new Date(Date.now() - 60000),
      status,
      startedAt: status === "RUNNING" ? new Date() : null,
      createdBy: "test@example.test",
    },
  });
  campaigns.push(c);
  return c;
}
async function delivery(c, u, data = {}) {
  return prisma.marketingDelivery.create({
    data: { campaignId: c.id, customerId: u.id, email: u.email, ...data },
  });
}
try {
  await prisma.marketingSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enabled: true,
      postalAddress: "Local test mailing address",
      updatedBy: testAdmin,
    },
    update: {
      enabled: true,
      postalAddress: "Local test mailing address",
      updatedBy: testAdmin,
    },
  });
  assert.equal(
    (await cron(new Request("http://localhost/api/cron/marketing"))).status,
    401,
  );
  const a = await customer("a"),
    b = await customer("b"),
    c = await customer("c"),
    d = await customer("d");
  const token = unsubscribeToken(a.id, a.email);
  assert.equal((await unsubscribeCustomer(token)).id, a.id);
  assert.equal(await unsubscribe(token + "bad"), false);
  assert.equal(await unsubscribe(token), true);
  assert.equal(await unsubscribe(token), true);
  assert.equal(
    await prisma.marketingConsentEvent.count({ where: { customerId: a.id } }),
    1,
    "Unsubscribe is idempotent",
  );
  const camp = await campaign();
  await Promise.all([
    delivery(camp, a),
    delivery(camp, b),
    delivery(camp, c),
    delivery(camp, d),
  ]);
  await prisma.marketingSuppression.create({
    data: { email: c.email, reason: "Test bounce" },
  });
  const pet = await prisma.pet.create({
    data: { customerId: d.id, name: "Test dog", breed: "Poodle", weightLb: 20 },
  });
  await prisma.submission.create({
    data: {
      customerId: d.id,
      petId: pet.id,
      status: "ACCEPTED",
      firstTimeBooking: "no",
      dropoffAt: new Date("2090-11-15"),
      pickupAt: new Date("2090-11-20"),
      quotedTotal: 100,
      quotedBreakdown: {},
      prescreenAnswers: {},
      agreedAt: new Date(),
      signatureData: "test",
      customerSnapshot: {},
      petSnapshot: {},
    },
  });
  await Promise.all([runMarketing({ send }), runMarketing({ send })]);
  assert.equal(
    sendCalls.length,
    1,
    "Concurrent jobs send the only eligible customer once",
  );
  assert.equal(sendCalls[0].payload.to[0], b.email);
  assert.ok(sendCalls[0].payload.headers["List-Unsubscribe-Post"]);
  assert.equal(
    await prisma.marketingDelivery.count({
      where: { campaignId: camp.id, status: "SKIPPED" },
    }),
    3,
  );
  await runMarketing({ send });
  assert.equal(sendCalls.length, 1, "Completed campaign never resends");
  const ambiguous = await campaign();
  const uncertain = await delivery(ambiguous, b);
  await runMarketing({
    send: async () => {
      throw new ProviderError("Lost connection", false, true);
    },
  });
  assert.equal(
    (await prisma.marketingDelivery.findUnique({ where: { id: uncertain.id } }))
      .status,
    "UNKNOWN",
  );
  await runMarketing({ send });
  assert.equal(sendCalls.length, 1, "Uncertain delivery never retries");
  const transient = await campaign();
  const retry = await delivery(transient, b);
  await runMarketing({
    send: async () => {
      throw new ProviderError("SMTP 451", true, false);
    },
  });
  assert.equal(
    (await prisma.marketingDelivery.findUnique({ where: { id: retry.id } }))
      .status,
    "PENDING",
  );
  await prisma.marketingDelivery.update({
    where: { id: retry.id },
    data: { nextAttemptAt: new Date(0) },
  });
  await runMarketing({ send });
  assert.equal(sendCalls.length, 2, "Explicit temporary rejection retries");
  const crashed = await campaign();
  const inflight = await delivery(crashed, b, {
    status: "SENDING",
    lastAttemptAt: new Date(Date.now() - 600000),
  });
  await runMarketing({ send });
  assert.equal(
    (await prisma.marketingDelivery.findUnique({ where: { id: inflight.id } }))
      .status,
    "UNKNOWN",
  );
  const paused = await campaign("PAUSED");
  await delivery(paused, b);
  await runMarketing({ send });
  assert.equal(sendCalls.length, 2, "Paused campaigns do not send");
  const scheduled = await campaign("SCHEDULED");
  await runMarketing({ send, limit: 0 });
  assert.equal(
    (await prisma.marketingCampaign.findUnique({ where: { id: scheduled.id } }))
      .status,
    "RUNNING",
  );
  assert.equal(
    await prisma.marketingDelivery.count({
      where: { campaignId: scheduled.id, customerId: a.id },
    }),
    0,
    "Unsubscribed customers are not queued",
  );
  await prisma.marketingCampaign.update({
    where: { id: scheduled.id },
    data: { status: "CANCELLED" },
  });
  const limited = await Promise.all(
    Array.from({ length: 10 }, () => allowRequest(stamp, "ip", 3, 900)),
  );
  assert.equal(
    limited.filter(Boolean).length,
    3,
    "Rate limit increment is atomic",
  );
  await syncHolidayCampaigns(); // No enabled test rules; must not enable or send anything.
  const preview = await campaign("DRAFT");
  const testCalls = [];
  const testSender = async (payload, key) => {
    testCalls.push({ payload, key });
    return key;
  };
  await assert.rejects(
    sendCampaignTest(preview.id, "outsider@example.test", testSender),
    /approved admin/,
  );
  await prisma.marketingSettings.update({
    where: { id: "default" },
    data: { enabled: false },
  });
  const cronSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  await sendCampaignTest(preview.id, testAdmin, testSender);
  assert.equal(
    testCalls.length,
    1,
    "Admin preview works while campaigns are disabled and cron is not configured",
  );
  assert.deepEqual(testCalls[0].payload.to, [testAdmin]);
  assert.equal(testCalls[0].payload.subject, "[TEST] Test promotion");
  assert.ok(testCalls[0].payload.text.includes("Local test mailing address"));
  assert.ok(testCalls[0].payload.text.includes(BOOKING_WEBSITE));
  assert.equal(
    (
      await prisma.marketingTest.findFirst({
        where: { campaignId: preview.id },
      })
    ).status,
    "ACCEPTED",
  );
  await assert.rejects(
    sendCampaignTest(preview.id, testAdmin, testSender),
    /five minutes/,
  );
  assert.equal(testCalls.length, 1, "Repeated test requests do not send twice");
  process.env.CRON_SECRET = cronSecret;
  const disabled = await campaign();
  await delivery(disabled, b);
  await runMarketing({ send });
  assert.equal(
    sendCalls.length,
    2,
    "Global sending switch stops queued campaigns",
  );
  await prisma.marketingSettings.update({
    where: { id: "default" },
    data: { enabled: true },
  });
  process.env.MARKETING_ENABLED = "false";
  assert.equal(
    (await getMarketingConfig()).enabled,
    false,
    "Deployment pause overrides admin setting",
  );
  process.env.MARKETING_ENABLED = "true";
  // The simplified audience includes historical customers and existing reservations.
  await prisma.marketingCampaign.updateMany({ where: { id: { in: campaigns.map((c) => c.id) }, status: { in: ["RUNNING", "SCHEDULED"] } }, data: { status: "CANCELLED" } });
  const historical = await customer("historical");
  await prisma.customer.update({ where: { id: historical.id }, data: { emailMarketingOptIn: false, marketingConsentUpdatedAt: null } });
  const optedOut = await customer("opted-out");
  await prisma.customer.update({ where: { id: optedOut.id }, data: { emailMarketingOptIn: false, marketingConsentUpdatedAt: new Date() } });
  const { customerAudience } = require("../lib/platform/customers.ts");
  const savedAudience = await customerAudience({ channel: "saved" });
  assert.ok(savedAudience.customers.some((c) => c.id === historical.id));
  assert.ok(savedAudience.customers.some((c) => c.id === d.id), "Already booked customer is still included");
  for (const excluded of [a, c, optedOut]) assert.ok(!savedAudience.customers.some((u) => u.id === excluded.id));
  const broadcast = await campaign("SCHEDULED");
  await prisma.marketingCampaign.update({ where: { id: broadcast.id }, data: {
    allCustomers: true, excludeStart: "", excludeEnd: "", body: returningGuestTemplate.body, imagePath: "/images/silicon-paws-marketing.png",
  } });
  await runMarketing({ send, limit: 0 });
  const queued = await prisma.marketingDelivery.findMany({ where: { campaignId: broadcast.id } });
  assert.ok(queued.some((item) => item.customerId === historical.id));
  // Unsubscribing also works for customers whose opt-in was never true.
  assert.equal(await unsubscribe(unsubscribeToken(historical.id, historical.email)), true);
  assert.equal(await unsubscribe(unsubscribeToken(historical.id, historical.email)), true);
  assert.equal(await prisma.marketingConsentEvent.count({ where: { customerId: historical.id } }), 1);
  const broadcastCalls = [];
  await runMarketing({ send: async (payload, key) => { broadcastCalls.push(payload); return key; } });
  assert.deepEqual(broadcastCalls.map((p) => p.to[0]).sort(), [b.email, d.email].sort());
  const dogEmail = broadcastCalls.find((p) => p.to[0] === d.email);
  assert.ok(dogEmail.html.includes("Reserve Test dog’s next stay here"));
  assert.ok(dogEmail.html.includes(`href="${BOOKING_WEBSITE}"`));
  assert.ok(dogEmail.html.includes('src="https://example.test/images/silicon-paws-marketing.png"'));
  const { saveMarketingImage } = require("../lib/marketing/images.ts");
  const uploadForm = new FormData();
  uploadForm.set("image", new File([readFileSync(resolve(root, "public/images/silicon-paws-marketing.png"))], "photo.png", { type: "image/png" }));
  const imagePath = await saveMarketingImage(uploadForm);
  const imageId = imagePath.split("/").at(-1);
  const { GET: getImage } = require("../app/api/marketing/images/[id]/route.ts");
  const imageResponse = await getImage(new Request(`https://example.test${imagePath}`), { params: Promise.resolve({ id: imageId }) });
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/png");
  assert.ok((await imageResponse.arrayBuffer()).byteLength > 1000);
  await prisma.marketingImage.delete({ where: { id: imageId } });
  console.log("PASS all-customer audience, existing reservations, explicit opt-outs, queued unsubscribe, personalized links and persistent image uploads");
  console.log(
    "PASS authenticated cron, consent, suppression, booking exclusion, concurrency, deduplication, SMTP failure handling, pause, recipient snapshot, global settings, admin-only test emails and rate limits (zero actual emails)",
  );
} finally {
  await prisma.marketingTest.deleteMany({ where: { email: testAdmin } });
  if (previousSettings) {
    await prisma.marketingSettings.update({
      where: { id: "default" },
      data: previousSettings,
    });
  } else {
    await prisma.marketingSettings.deleteMany({ where: { id: "default" } });
  }
  await prisma.marketingCampaign.deleteMany({
    where: { id: { in: campaigns.map((c) => c.id) } },
  });
  await prisma.submission.deleteMany({
    where: { customerId: { in: customers.map((c) => c.id) } },
  });
  await prisma.customer.deleteMany({
    where: { id: { in: customers.map((c) => c.id) } },
  });
  await prisma.marketingSuppression.deleteMany({
    where: { email: { in: customers.map((c) => c.email) } },
  });
  await prisma.$disconnect();
}
