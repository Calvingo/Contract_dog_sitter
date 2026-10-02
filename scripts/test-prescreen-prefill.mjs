import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url),
  ts = require("typescript");
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
const {
  initialFormValues,
  prescreenQuestions,
  secondPrescreenQuestions,
} = require("../lib/form-config.ts");
const {
  hasSavedPrescreen,
  prescreenPrefillValues,
} = require("../lib/booking-prefill.ts");
const answers = Object.fromEntries(
  prescreenQuestions.map((q, index) => [q.name, index % 2 ? "yes" : "no"]),
);
const pet = {
  id: "dog",
  name: "Pocky",
  breed: "Corgi",
  weightLb: 20,
  lastPrescreenAnswers: answers,
  lastPrescreenNotes: "Dinner at 6 pm",
};
assert.equal(hasSavedPrescreen(pet), true);
assert.equal(
  hasSavedPrescreen({
    ...pet,
    lastPrescreenAnswers: { prescreenAggression: "no" },
  }),
  false,
);
assert.equal(
  hasSavedPrescreen({
    ...pet,
    lastPrescreenAnswers: { ...answers, prescreenAggression: "unknown" },
  }),
  false,
);
for (const [index, q] of secondPrescreenQuestions.entries())
  assert.equal(
    prescreenPrefillValues(pet, true)[q.name],
    answers[prescreenQuestions[index].name],
  );
assert.equal(
  prescreenPrefillValues(pet, true).secondPrescreenNotes,
  pet.lastPrescreenNotes,
);
assert.equal(
  prescreenPrefillValues({
    ...pet,
    lastPrescreenAnswers: null,
    lastPrescreenNotes: "",
  }).prescreenAggression,
  "",
);
console.log(
  "PASS per-dog answer mapping, partial/invalid answers, notes and clearing a new dog's answers",
);
if (!process.env.TEST_DATABASE_URL) {
  console.log(
    "SKIP persistence/authentication integration checks (set TEST_DATABASE_URL)",
  );
  process.exit(0);
}
const dbUrl = new URL(process.env.TEST_DATABASE_URL);
assert.ok(
  ["localhost", "127.0.0.1"].includes(dbUrl.hostname) && dbUrl.port === "55439",
  "Use the isolated local database only",
);
Object.assign(process.env, {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  DIRECT_URL: process.env.TEST_DATABASE_URL,
  APP_SECRET: "platform-local-test-secret-only",
  CUSTOMER_SESSION_SECRET: "platform-local-test-secret-only",
});
const cookies = new Map();
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === "next/headers")
    return {
      cookies: async () => ({
        get: (name) => cookies.get(name),
        set: (name, value) => cookies.set(name, { value }),
        delete: (name) => cookies.delete(name),
      }),
    };
  return originalLoad.call(this, request, parent, ...args);
};
const { prisma } = require("../lib/db.ts");
const {
  createSubmissionRecord,
  updateSubmissionRecord,
} = require("../lib/services/submission-service.ts");
const { loadCustomerPrefill } = require("../lib/services/customer-prefill.ts");
const { hashLoginToken } = require("../lib/auth/customer-session.ts");
const { GET: verify } = require("../app/api/auth/verify/route.ts");
const { GET, POST } = require("../app/api/me/prefill/route.ts");
const stamp = Date.now();
const ids = [];
const values = {
  ...initialFormValues,
  ...answers,
  ...Object.fromEntries(secondPrescreenQuestions.map((q) => [q.name, "no"])),
  email: `prescreen-${stamp}@example.test`,
  firstName: "Returning",
  lastName: "Guest",
  phone: "5551234567",
  backupContact: "email",
  petName: "Pocky",
  petBreed: "Corgi",
  petWeightLb: "20",
  petAgeYears: "3",
  prescreenNotes: "Dinner at 6 pm",
  hasSecondDog: true,
  secondPetName: "Milo",
  secondPetBreed: "Poodle",
  secondPetWeightLb: "15",
  secondPetAgeYears: "2",
  secondPrescreenNotes: "Bring blue blanket",
  dropoffDate: "2092-04-01",
  pickupDate: "2092-04-02",
  dropoffTime: "10:00",
  pickupTime: "10:00",
  signature: "test-only",
  agreed: true,
};
try {
  const created = await createSubmissionRecord(values);
  ids.push(created.customer.id);
  const other = await prisma.customer.create({
    data: {
      email: `other-prescreen-${stamp}@example.test`,
      firstName: "Other",
      lastName: "Owner",
      phone: "",
      backupContact: "email",
    },
  });
  ids.push(other.id);
  let saved = await loadCustomerPrefill(created.customer.id);
  assert.deepEqual(
    saved.pets.find((p) => p.name === "Pocky").lastPrescreenAnswers,
    answers,
  );
  assert.equal(
    saved.pets.find((p) => p.name === "Milo").lastPrescreenNotes,
    "Bring blue blanket",
  );
  assert.equal((await GET()).status, 401);
  const lookup = (email) =>
    POST(
      new Request("http://localhost/api/me/prefill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    );
  const publicLookup = await (await lookup(values.email)).json();
  assert.equal(publicLookup.authenticated, false);
  assert.ok(
    publicLookup.pets.every(
      (p) =>
        p.lastPrescreenAnswers === undefined &&
        p.lastPrescreenNotes === undefined,
    ),
  );
  // Exercise the actual email-verification handler with a local test token; no email is sent.
  const token = `prefill-test-${stamp}`;
  await prisma.loginToken.create({
    data: {
      email: values.email,
      tokenHash: hashLoginToken(token),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const verified = await verify(
    new Request(`http://localhost/api/auth/verify?token=${token}&next=/book`),
  );
  assert.equal(verified.headers.get("location"), "/book");
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const rich = await response.json();
  assert.equal(rich.customer.email, values.email);
  assert.deepEqual(
    rich.pets.find((p) => p.name === "Pocky").lastPrescreenAnswers,
    answers,
  );
  assert.equal(
    (await (await lookup(values.email)).json()).authenticated,
    true,
    "Matching verified POST must not downgrade to public data",
  );
  assert.equal(
    (await (await lookup(other.email)).json()).authenticated,
    false,
    "Other email never receives verified prescreen data",
  );
  // Rebooking and editing preserve distinct answers per dog and revision history.
  const repeat = await createSubmissionRecord(
    {
      ...values,
      dropoffDate: "2092-04-04",
      pickupDate: "2092-04-05",
      prescreenNotes: "Updated meal plan",
    },
    created.customer.id,
  );
  await updateSubmissionRecord({
    submissionId: repeat.submission.id,
    data: {
      ...values,
      dropoffDate: "2092-04-04",
      pickupDate: "2092-04-05",
      prescreenAggression: "yes",
      prescreenNotes: "Latest care notes",
      secondPrescreenNotes: "Latest Milo notes",
    },
  });
  saved = await loadCustomerPrefill(created.customer.id);
  assert.equal(
    saved.pets.find((p) => p.name === "Pocky").lastPrescreenAnswers
      .prescreenAggression,
    "yes",
  );
  assert.equal(
    saved.pets.find((p) => p.name === "Pocky").lastPrescreenNotes,
    "Latest care notes",
  );
  assert.equal(
    saved.pets.find((p) => p.name === "Milo").lastPrescreenNotes,
    "Latest Milo notes",
  );
  assert.equal(
    (
      await prisma.submissionRevision.findFirst({
        where: { submissionId: repeat.submission.id },
      })
    ).prescreenNotes,
    "Updated meal plan",
  );
  const legacy = await createSubmissionRecord(
    {
      ...values,
      hasSecondDog: false,
      petName: "Legacy",
      prescreenNotes: "Historical notes",
    },
    created.customer.id,
  );
  await prisma.submissionPet.deleteMany({
    where: { submissionId: legacy.submission.id },
  });
  saved = await loadCustomerPrefill(created.customer.id);
  assert.deepEqual(
    saved.pets.find((p) => p.name === "Legacy").lastPrescreenAnswers,
    answers,
  );
  assert.equal(
    saved.pets.find((p) => p.name === "Legacy").lastPrescreenNotes,
    "Historical notes",
  );
  assert.equal(await loadCustomerPrefill("does-not-exist"), null);
  console.log(
    "PASS save/rebook/edit history, multiple dogs, legacy fallback, email verification, private caching and cross-customer isolation; no real emails sent",
  );
} finally {
  await prisma.submission.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  await prisma.loginToken.deleteMany({ where: { email: values.email } });
  await prisma.$disconnect();
}
