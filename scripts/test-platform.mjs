import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

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
const rules = require(resolve(root, "lib/platform/rules.ts"));
const { parseDateTime } = require(resolve(root, "lib/pricing.ts"));
assert.equal(rules.validDate("2027-02-29"), false);
assert.equal(rules.validDate("2028-02-29"), true);
assert.throws(() => rules.dateRange("2027-01-02", "2027-01-01"));
assert.throws(() => rules.dateRange("2027-01-01", "2029-01-01"));
assert.equal(parseDateTime("2027-02-30", "10:00"), null);
assert.equal(parseDateTime("2027-01-01", "25:00"), null);
assert.equal(
  parseDateTime("2027-11-07", "10:00").toISOString(),
  "2027-11-07T10:00:00.000Z",
);
const booking = {
  id: "sample",
  status: "PENDING",
  dropoffAt: new Date("2027-01-01T10:00:00Z"),
  pickupAt: new Date("2027-01-03T10:00:00Z"),
  holdExpiresAt: new Date("2099-01-01"),
  quotedTotal: 100,
  submissionPets: [{}, {}],
  payments: [],
};
assert.deepEqual(
  [...rules.occupancyByDay([booking], true)],
  [
    ["2027-01-01", 2],
    ["2027-01-02", 2],
    ["2027-01-03", 2],
  ],
);
assert.deepEqual(
  [...rules.occupancyByDay([booking], false)],
  [
    ["2027-01-01", 2],
    ["2027-01-02", 2],
  ],
);
assert.equal(
  rules
    .occupancyByDay(
      [{ ...booking, pickupAt: new Date("2027-01-01T14:00:00Z") }],
      false,
    )
    .get("2027-01-01"),
  2,
);
assert.equal(
  rules.reservesCapacity({ ...booking, status: "CANCELLED" }),
  false,
);
assert.equal(
  rules.reservesCapacity({ ...booking, holdExpiresAt: new Date(0) }),
  false,
);
assert.equal(rules.reservesCapacity({ ...booking, holdExpiresAt: null }), true);
assert.equal(
  rules.reservesCapacity({
    ...booking,
    holdExpiresAt: new Date(0),
    payments: [{ status: "REPORTED", amount: 20 }],
  }),
  false,
);
assert.equal(
  rules.reservesCapacity({
    ...booking,
    holdExpiresAt: new Date(0),
    payments: [{ status: "VERIFIED", amount: 20 }],
  }),
  true,
);
assert.equal(
  rules.reservesCapacity({
    ...booking,
    holdExpiresAt: new Date(0),
    payments: [{ status: "REFUNDED", amount: 20 }],
  }),
  false,
);
assert.equal(
  rules.reservesCapacity({
    ...booking,
    holdExpiresAt: new Date(0),
    payments: [{ status: "VERIFIED", amount: 19.99 }],
  }),
  false,
);
assert.equal(
  rules.bookingLabel({ ...booking, status: "ACCEPTED", holdExpiresAt: null }),
  "Confirmed — existing booking",
);
console.log(
  "Passed: date validation, UTC wall-clock parsing, multi-dog counts, checkout rules, legacy holds, expiry, partial payments and refunds.",
);

if (!process.env.TEST_DATABASE_URL) process.exit(0);
const url = new URL(process.env.TEST_DATABASE_URL);
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55439",
  "Integration tests require the dedicated local test database on port 55439.",
);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { prisma } = require(resolve(root, "lib/db.ts"));
const { availability, lockCapacity, prepareStatusChange } = require(
  resolve(root, "lib/platform/capacity.ts"),
);
const { createSubmissionRecord, updateSubmissionRecord } = require(
  resolve(root, "lib/services/submission-service.ts"),
);
const { customerAudience } = require(
  resolve(root, "lib/platform/customers.ts"),
);
const {
  initialFormValues,
  prescreenQuestions,
  secondPrescreenQuestions,
} = require(resolve(root, "lib/form-config.ts"));
const suffix = Date.now();
const createdCustomers = [];
const oldSettings = await prisma.platformSettings.findUnique({
  where: { id: "default" },
});
let tokenId;
try {
  await prisma.platformSettings.upsert({
    where: { id: "default" },
    create: { id: "default", defaultCapacity: 1 },
    update: { defaultCapacity: 1, includePickupDay: true },
  });
  const a = await prisma.customer.create({
    data: {
      email: `platform-a-${suffix}@example.test`,
      firstName: "Amy",
      lastName: "Test",
      phone: "+15555550101",
      backupContact: "email",
      emailMarketingOptIn: true,
    },
  });
  const b = await prisma.customer.create({
    data: {
      email: `platform-b-${suffix}@example.test`,
      firstName: "Ben",
      lastName: "Test",
      phone: "+15555550102",
      backupContact: "email",
      emailMarketingOptIn: true,
    },
  });
  createdCustomers.push(a.id, b.id);
  const values = (customer, more = {}) => ({
    ...initialFormValues,
    firstTimeBooking: "yes",
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    backupContact: "email",
    emergencyContactName: "Emergency Test",
    emergencyContactPhone: "+15555550103",
    petName: "Coco",
    petBreed: "Poodle",
    petWeightLb: "20",
    petAgeYears: "3",
    dropoffDate: "2027-04-05",
    dropoffTime: "10:00",
    pickupDate: "2027-04-07",
    pickupTime: "10:00",
    signature: "test-only",
    agreed: true,
    ...Object.fromEntries(prescreenQuestions.map((q) => [q.name, "no"])),
    ...Object.fromEntries(secondPrescreenQuestions.map((q) => [q.name, "no"])),
    ...more,
  });
  const raced = await Promise.allSettled([
    createSubmissionRecord(values(a), a.id),
    createSubmissionRecord(values(b), b.id),
  ]);
  assert.equal(
    raced.filter((r) => r.status === "fulfilled").length,
    1,
    "Only one simultaneous request can claim the last spot",
  );
  assert.match(
    raced.find((r) => r.status === "rejected").reason.message,
    /not enough space/,
  );
  const winner = raced.find((r) => r.status === "fulfilled").value;
  assert.equal(
    (await availability("2027-04-05", "2027-04-07")).days.every(
      (d) => d.remaining === 0,
    ),
    true,
  );
  const owner = winner.customer.id === a.id ? a : b;
  await updateSubmissionRecord({
    submissionId: winner.submission.id,
    data: values(owner),
  });
  assert.equal(
    (await availability("2027-04-05", "2027-04-05")).days[0].occupied,
    1,
    "Editing a booking excludes itself from capacity checks",
  );
  await assert.rejects(
    createSubmissionRecord(values(a), b.id),
    /signed-in email/,
  );
  await assert.rejects(
    updateSubmissionRecord({
      submissionId: winner.submission.id,
      data: values(owner.id === a.id ? b : a),
    }),
    /original booking email/,
  );
  const audience = await customerAudience({
    q: String(suffix),
    channel: "email",
    start: "2027-04-01",
    end: "2027-04-30",
  });
  assert.equal(audience.customers.length, 1);
  assert.equal(audience.excludedCount, 1);
  await prisma.submission.update({
    where: { id: winner.submission.id },
    data: { holdExpiresAt: new Date(0) },
  });
  assert.equal(
    (await availability("2027-04-05", "2027-04-05")).days[0].remaining,
    1,
  );
  const other = owner.id === a.id ? b : a;
  const replacement = await createSubmissionRecord(values(other), other.id);
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const hold = await prepareStatusChange(
        tx,
        winner.submission.id,
        "ACCEPTED",
      );
      await tx.submission.update({
        where: { id: winner.submission.id },
        data: { status: "ACCEPTED", ...hold },
      });
    }),
    /not enough space/,
  );
  await prisma.submission.update({
    where: { id: replacement.submission.id },
    data: { status: "CANCELLED" },
  });
  assert.equal(
    (await availability("2027-04-05", "2027-04-05")).days[0].remaining,
    1,
  );
  await prisma.platformSettings.update({
    where: { id: "default" },
    data: { defaultCapacity: 2 },
  });
  const pair = await createSubmissionRecord(
    values(a, {
      hasSecondDog: true,
      secondPetName: "Milo",
      secondPetBreed: "Mix",
      secondPetWeightLb: "25",
      secondPetAgeYears: "2",
      dropoffDate: "2027-04-10",
      pickupDate: "2027-04-12",
    }),
    a.id,
  );
  assert.equal(
    (await availability("2027-04-10", "2027-04-10")).days[0].occupied,
    2,
  );
  await assert.rejects(
    createSubmissionRecord(
      values(b, { dropoffDate: "2027-04-09", pickupDate: "2027-04-11" }),
      b.id,
    ),
    /not enough space/,
  );
  await prisma.dailyCapacity.upsert({
    where: { date: "2027-04-15" },
    create: { date: "2027-04-15", capacity: 0 },
    update: { capacity: 0 },
  });
  await assert.rejects(
    createSubmissionRecord(
      values(b, { dropoffDate: "2027-04-14", pickupDate: "2027-04-16" }),
      b.id,
    ),
    /not enough space/,
  );
  await prisma.platformSettings.update({
    where: { id: "default" },
    data: { defaultCapacity: 1 },
  });
  assert.equal(
    (await availability("2027-04-10", "2027-04-10")).days[0].overCapacity,
    true,
  );
  assert.equal(
    await prisma.submission.count({ where: { id: pair.submission.id } }),
    1,
  );
  // Exercise the database lock directly to guard against a regression to read-before-lock.
  await prisma.$transaction(async (tx) => {
    await lockCapacity(tx);
    assert.equal(
      (await tx.submission.count({ where: { customerId: a.id } })) > 0,
      true,
    );
  });
  console.log(
    "Passed: real Postgres concurrent booking, all-days capacity, self-edit exclusion, owner isolation, expiry/rebooking, late approval rejection, closure, multi-dog capacity, oversubscription warnings and audience exclusions.",
  );

  if (process.env.TEST_BASE_URL) {
    const base = new URL(process.env.TEST_BASE_URL);
    assert.ok(
      ["127.0.0.1", "localhost"].includes(base.hostname) &&
        base.port === "3100",
    );
    const secret = "platform-local-test-secret-only";
    function cookie(name, payload) {
      const data = Buffer.from(
        JSON.stringify({ ...payload, exp: Date.now() + 60000 }),
      ).toString("base64url");
      return `${name}=${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
    }
    const customerCookie = cookie("spr_customer_session", { customerId: a.id });
    const adminCookie = cookie("spr_admin_session", {
      email: "admin@example.test",
    });
    const get = (path, auth) =>
      fetch(`${base.origin}${path}`, {
        headers: auth ? { cookie: auth } : {},
        redirect: "manual",
      });
    assert.equal((await get(`/api/me/prefill?email=${a.email}`)).status, 401);
    const own = await (
      await get(`/api/me/prefill?email=${b.email}`, customerCookie)
    ).json();
    assert.equal(own.customer.email, a.email);
    assert.equal(
      (
        await get(
          `/account/bookings/${pair.submission.id}`,
          cookie("spr_customer_session", { customerId: b.id }),
        )
      ).status,
      404,
    );
    assert.equal((await get("/api/admin/customers/export")).status, 401);
    assert.equal(
      (await get("/api/admin/customers/export", customerCookie)).status,
      401,
    );
    await prisma.customer.update({
      where: { id: a.id },
      data: { firstName: "=1+1" },
    });
    const exportResponse = await get(
      `/api/admin/customers/export?q=${suffix}`,
      adminCookie,
    );
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type"), /spreadsheetml/);
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
    const sheet = workbook.getWorksheet("Customers");
    assert.equal(sheet.rowCount, 3);
    assert.equal(sheet.getRow(2).getCell(1).type, ExcelJS.ValueType.String);
    assert.ok(
      sheet.getSheetValues().flat(2).includes("=1+1 Test"),
      "Formula-like customer name must remain literal text",
    );
    const publicData = await (
      await get("/api/availability?start=2027-04-10&end=2027-04-10")
    ).json();
    assert.deepEqual(Object.keys(publicData.days[0]).sort(), [
      "closed",
      "date",
      "remaining",
    ]);
    assert.equal(
      (await get("/api/availability?start=2027-02-30&end=2027-03-01")).status,
      400,
    );
    const rawToken = `test-token-${suffix}`;
    const token = await prisma.loginToken.create({
      data: {
        email: a.email,
        tokenHash: createHmac("sha256", secret)
          .update(rawToken)
          .digest("base64url"),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    tokenId = token.id;
    const logins = await Promise.all([
      get(`/api/auth/verify?token=${rawToken}`),
      get(`/api/auth/verify?token=${rawToken}`),
    ]);
    assert.equal(
      logins.filter((r) =>
        r.headers.get("set-cookie")?.includes("spr_customer_session"),
      ).length,
      1,
    );
    console.log(
      "Passed: HTTP privacy boundaries, cross-account 404, admin-only real XLSX export and literal formula-like values, public availability data minimization, and one-time login token race.",
    );
  }
} finally {
  if (tokenId) await prisma.loginToken.deleteMany({ where: { id: tokenId } });
  const submissions = await prisma.submission.findMany({
    where: { customerId: { in: createdCustomers } },
    select: { id: true },
  });
  await prisma.payment.deleteMany({
    where: { submissionId: { in: submissions.map((s) => s.id) } },
  });
  await prisma.submission.deleteMany({
    where: { customerId: { in: createdCustomers } },
  });
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomers } } });
  await prisma.dailyCapacity.deleteMany({ where: { date: "2027-04-15" } });
  if (oldSettings) {
    const { id, ...data } = oldSettings;
    delete data.updatedAt;
    await prisma.platformSettings.update({ where: { id }, data });
  } else await prisma.platformSettings.deleteMany({ where: { id: "default" } });
  await prisma.$disconnect();
}
