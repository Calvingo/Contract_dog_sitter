import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.TEST_DATABASE_URL) {
  console.log("SKIP customer CRUD integration checks (set TEST_DATABASE_URL)");
  process.exit(0);
}
const databaseUrl = new URL(process.env.TEST_DATABASE_URL);
assert.ok(
  ["localhost", "127.0.0.1"].includes(databaseUrl.hostname) &&
    databaseUrl.port === "55439",
  "Use the isolated local database on port 55439 only",
);
Object.assign(process.env, {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  DIRECT_URL: process.env.TEST_DATABASE_URL,
  APP_SECRET: "customer-crud-local-test-secret-only",
  CUSTOMER_SESSION_SECRET: "customer-crud-local-test-secret-only",
});

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
const cookieJar = new Map();
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === "nodemailer")
    return {
      createTransport: () => assert.fail("This test must never send real email"),
    };
  if (request === "next/headers")
    return {
      cookies: async () => ({
        get: (name) => cookieJar.get(name),
        set: (name, value) => cookieJar.set(name, { value }),
        delete: (name) => cookieJar.delete(name),
      }),
    };
  return originalLoad.call(this, request, parent, ...args);
};

const { prisma } = require("../lib/db.ts");
const {
  initialFormValues,
  prescreenQuestions,
  secondPrescreenQuestions,
} = require("../lib/form-config.ts");
const {
  saveCustomerDetails,
  saveCustomerAndPets,
  saveCustomerDog,
  archiveCustomerDog,
  restoreCustomerDog,
  deactivateCustomerAccount,
  restoreCustomerAccount,
} = require("../lib/services/customer-profile.ts");
const {
  createSubmissionRecord,
  updateSubmissionRecord,
} = require("../lib/services/submission-service.ts");
const { loadCustomerPrefill } = require("../lib/services/customer-prefill.ts");
const {
  setCustomerSession,
  getCustomerSession,
  hashLoginToken,
} = require("../lib/auth/customer-session.ts");
const {
  createSubmissionEditToken,
  findValidSubmissionEditToken,
} = require("../lib/submission-edit-token.ts");
const { GET: verifyEmail } = require("../app/api/auth/verify/route.ts");
const { PATCH } = require("../app/api/me/profile/route.ts");
const {
  GET: readPrefill,
  POST: lookupPrefill,
} = require("../app/api/me/prefill/route.ts");

const stamp = `${Date.now()}-${process.pid}`;
const customerIds = [];
const emails = [];
const answers = Object.fromEntries(
  prescreenQuestions.map((question, index) => [
    question.name,
    index % 2 ? "yes" : "no",
  ]),
);
const updatedAnswers = Object.fromEntries(
  prescreenQuestions.map((question) => [
    question.name,
    answers[question.name] === "yes" ? "no" : "yes",
  ]),
);
const owner = {
  firstName: "Mria",
  lastName: "Typo",
  phone: "5551234567",
  backupContact: "wechat",
  emergencyContactName: "Original Contact",
  emergencyContactPhone: "5559876543",
  wechatId: "original-owner",
};
const correctedOwner = {
  firstName: "Maria",
  lastName: "Garcia",
  phone: "5551112233",
  backupContact: "sms",
  emergencyContactName: "Updated Contact",
  emergencyContactPhone: "5552223344",
  wechatId: "corrected-owner",
};
const bookingValues = {
  ...initialFormValues,
  ...owner,
  ...answers,
  ...Object.fromEntries(
    secondPrescreenQuestions.map((question, index) => [
      question.name,
      updatedAnswers[prescreenQuestions[index].name],
    ]),
  ),
  email: `customer-crud-${stamp}@example.test`,
  petName: "Mlio",
  petBreed: "Poodle",
  petWeightLb: "20",
  petAgeYears: "3",
  prescreenNotes: "Original care notes",
  hasSecondDog: true,
  secondPetName: "Pocki",
  secondPetBreed: "Corgi",
  secondPetWeightLb: "25",
  secondPetAgeYears: "4",
  secondPrescreenNotes: "Original second dog notes",
  dropoffDate: "2093-04-01",
  pickupDate: "2093-04-02",
  dropoffTime: "10:00",
  pickupTime: "10:00",
  agreed: true,
  signature: "test-only-original-signature",
};

function jsonRequest(path, method, body) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const patch = (body) => PATCH(jsonRequest("/api/me/profile", "PATCH", body));
const lookup = (email) =>
  lookupPrefill(jsonRequest("/api/me/prefill", "POST", { email }));
function petInput(pet, overrides = {}) {
  return {
    id: pet.id,
    name: pet.name,
    breed: pet.breed,
    weightLb: pet.weightLb,
    ageYears: pet.ageYears,
    ...overrides,
  };
}
async function profileState(customerId) {
  return {
    customer: await prisma.customer.findUnique({ where: { id: customerId } }),
    pets: await prisma.pet.findMany({
      where: { customerId },
      orderBy: { id: "asc" },
    }),
    submissions: await prisma.submission.count({ where: { customerId } }),
  };
}
async function agreementState(submissionId) {
  return prisma.submission.findUnique({
    where: { id: submissionId },
    include: { submissionPets: { orderBy: { position: "asc" } }, revisions: true },
  });
}
async function assertNoMutation(customerId, operation) {
  const before = await profileState(customerId);
  await operation();
  assert.deepEqual(
    await profileState(customerId),
    before,
    "Rejected input must leave every customer field, pet and booking unchanged",
  );
}
function assertOwner(actual, expected) {
  for (const [field, value] of Object.entries(expected))
    assert.equal(actual[field], value, `Saved owner ${field} is returned on reload`);
}

try {
  const firstBooking = await createSubmissionRecord(bookingValues);
  const customerId = firstBooking.customer.id;
  customerIds.push(customerId);
  emails.push(bookingValues.email);
  const originalAgreement = await agreementState(firstBooking.submission.id);
  const originalFirst = firstBooking.pets[0];
  const originalSecond = firstBooking.pets[1];
  const firstDog = petInput(originalFirst, {
    name: "Milo",
    breed: "Miniature Poodle",
    weightLb: "22.5",
    ageYears: "0",
    prescreenAnswers: updatedAnswers,
    prescreenNotes: "Corrected meal and medication notes",
  });
  const secondDog = petInput(originalSecond, {
    name: "Pocky",
    prescreenAnswers: answers,
    prescreenNotes: "Corrected second dog notes",
  });

  await assertNoMutation(customerId, async () => {
    assert.equal(
      (await patch({ customer: correctedOwner, pets: [firstDog, secondDog] })).status,
      401,
      "Email knowledge alone never authorizes updating saved information",
    );
  });
  await setCustomerSession(customerId);
  const aliasedOriginResponse = await PATCH(new Request(
    "http://localhost:3101/api/me/profile",
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:3101",
        origin: "http://127.0.0.1:3101",
      },
      body: JSON.stringify({ customer: owner, pets: [] }),
    },
  ));
  assert.equal(
    aliasedOriginResponse.status,
    200,
    "The browser Host/Origin may differ from Next.js's internal localhost request URL",
  );
  assertOwner((await aliasedOriginResponse.json()).customer, owner);
  for (const request of [
    new Request("http://localhost:3101/api/me/profile", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:3101",
        origin: "https://other.example.test",
      },
      body: JSON.stringify({ customer: correctedOwner, pets: [] }),
    }),
    new Request("http://localhost/api/me/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "https://other.example.test" },
      body: JSON.stringify({ customer: correctedOwner, pets: [] }),
    }),
    new Request("http://localhost/api/me/profile", {
      method: "PATCH",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ customer: correctedOwner, pets: [] }),
    }),
    new Request("http://localhost/api/me/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  ])
    await assertNoMutation(customerId, async () => {
      const response = await PATCH(request);
      assert.ok(response.status >= 400 && response.status < 500);
    });
  const savedResponse = await patch({
    customer: correctedOwner,
    pets: [firstDog, secondDog],
  });
  assert.equal(savedResponse.status, 200);
  assert.equal(savedResponse.headers.get("cache-control"), "private, no-store");
  const saved = await savedResponse.json();
  assert.equal(saved.authenticated, true);
  assertOwner(saved.customer, correctedOwner);
  assert.equal(saved.pets.length, 2, "Renaming both dogs must not create duplicates");
  for (const expected of [firstDog, secondDog]) {
    const actual = saved.pets.find((pet) => pet.id === expected.id);
    assert.ok(actual, "Dog identity survives a name correction");
    assert.equal(actual.name, expected.name);
    assert.equal(actual.weightLb, Number(expected.weightLb));
    assert.equal(actual.ageYears, Number(expected.ageYears));
    assert.deepEqual(actual.lastPrescreenAnswers, expected.prescreenAnswers);
    assert.equal(actual.lastPrescreenNotes, expected.prescreenNotes);
  }
  assert.deepEqual(await (await readPrefill()).json(), saved);
  assert.equal(await prisma.submission.count({ where: { customerId } }), 1);
  assert.deepEqual(
    await agreementState(firstBooking.submission.id),
    originalAgreement,
    "Profile-only updates need no signature or booking and never rewrite signed history",
  );

  await saveCustomerDetails(customerId, {
    ...correctedOwner,
    firstName: "Maria Fernanda",
    emergencyContactName: "",
    emergencyContactPhone: "",
    wechatId: "",
  });
  assertOwner((await loadCustomerPrefill(customerId)).customer, {
    ...correctedOwner,
    firstName: "Maria Fernanda",
    emergencyContactName: "",
    emergencyContactPhone: "",
    wechatId: "",
  });
  const clearedDog = await saveCustomerDog(customerId, {
    ...firstDog,
    prescreenNotes: "",
  });
  await saveCustomerDog(customerId, petInput(clearedDog, { breed: "Poodle Mix" }));
  const clearedPrefill = (await loadCustomerPrefill(customerId)).pets.find(
    (pet) => pet.id === firstDog.id,
  );
  assert.equal(clearedPrefill.lastPrescreenNotes, "", "An empty note clears saved notes");
  assert.deepEqual(
    clearedPrefill.lastPrescreenAnswers,
    updatedAnswers,
    "Updating dog details without answers preserves the saved answers",
  );

  const addedDog = await saveCustomerDog(customerId, {
    name: "Charlie",
    breed: "Terrier",
    weightLb: 12,
    ageYears: null,
    prescreenAnswers: answers,
    prescreenNotes: "No booking is needed to save care instructions",
  });
  assert.equal((await loadCustomerPrefill(customerId)).pets.length, 3);
  const addedPrefill = (await loadCustomerPrefill(customerId)).pets.find(
    (pet) => pet.id === addedDog.id,
  );
  assert.equal(addedPrefill.ageYears, null);
  assert.deepEqual(addedPrefill.lastPrescreenAnswers, answers);
  assert.equal(addedPrefill.lastPrescreenNotes, "No booking is needed to save care instructions");
  assert.equal(addedPrefill.lastSubmittedAt, null);

  await archiveCustomerDog(customerId, firstDog.id);
  assert.ok((await prisma.pet.findUnique({ where: { id: firstDog.id } })).archivedAt);
  assert.ok(!(await loadCustomerPrefill(customerId)).pets.some((pet) => pet.id === firstDog.id));
  cookieJar.clear();
  const publicLookup = await (await lookup(bookingValues.email)).json();
  assert.equal(publicLookup.authenticated, false);
  assert.ok(!publicLookup.pets.some((pet) => pet.id === firstDog.id));
  assert.ok(publicLookup.pets.every((pet) => pet.lastPrescreenAnswers === undefined));
  assert.ok(publicLookup.pets.every((pet) => pet.lastPrescreenNotes === undefined));
  assert.equal(publicLookup.customer.emergencyContactPhone, "");
  await assert.rejects(saveCustomerDog(customerId, petInput(addedDog, { name: firstDog.name })));
  await assert.rejects(saveCustomerDog(customerId, firstDog));
  await restoreCustomerDog(customerId, firstDog.id);
  assert.equal((await prisma.pet.findUnique({ where: { id: firstDog.id } })).archivedAt, null);
  assert.equal((await loadCustomerPrefill(customerId)).pets.length, 3);
  assert.deepEqual(await agreementState(firstBooking.submission.id), originalAgreement);
  await setCustomerSession(customerId);

  const other = await prisma.customer.create({
    data: { ...owner, email: `other-customer-crud-${stamp}@example.test` },
  });
  customerIds.push(other.id);
  emails.push(other.email);
  const foreignDog = await saveCustomerDog(other.id, {
    name: "Other dog",
    breed: "Husky",
    weightLb: 40,
    ageYears: 3,
  });
  const otherState = await profileState(other.id);
  for (const operation of [
    () => saveCustomerDog(customerId, petInput(foreignDog, { name: "Stolen dog" })),
    () => archiveCustomerDog(customerId, foreignDog.id),
    () => restoreCustomerDog(customerId, foreignDog.id),
  ])
    await assertNoMutation(customerId, () => assert.rejects(operation));
  for (const invalidId of [undefined, null, "", "   ", "x".repeat(101)])
    for (const operation of [archiveCustomerDog, restoreCustomerDog])
      await assertNoMutation(customerId, () =>
        assert.rejects(operation(customerId, invalidId)),
      );
  await assertNoMutation(customerId, () =>
    assert.rejects(
      saveCustomerAndPets(customerId, {
        customer: { ...correctedOwner, firstName: "Must roll back" },
        pets: [
          { ...firstDog, name: "Must roll back too" },
          petInput(foreignDog),
        ],
      }),
    ),
  );
  await assertNoMutation(customerId, async () => {
    assert.ok(
      (await patch({ customer: correctedOwner, pets: [petInput(foreignDog)] })).status >= 400,
    );
  });
  assert.deepEqual(await profileState(other.id), otherState);

  for (const invalidBody of [
    { customer: { ...correctedOwner, email: other.email }, pets: [] },
    { customer: { ...correctedOwner, customerId: other.id }, pets: [] },
    { customer: { ...correctedOwner, firstName: "" }, pets: [firstDog] },
    {
      customer: { ...correctedOwner, firstName: "Must roll back" },
      pets: [firstDog, { ...secondDog, weightLb: -1 }],
    },
    {
      customer: correctedOwner,
      pets: [{ ...firstDog, prescreenAnswers: { ...answers, prescreenAggression: "maybe" } }],
    },
    { customer: correctedOwner, pets: [firstDog, { ...secondDog, name: firstDog.name }] },
  ])
    await assertNoMutation(customerId, async () => {
      const response = await patch(invalidBody);
      assert.ok(response.status >= 400 && response.status < 500);
    });

  const repeatValues = {
    ...bookingValues,
    ...correctedOwner,
    firstName: "Maria Rebooking",
    savedPetId: originalFirst.id,
    savedSecondPetId: originalSecond.id,
    petName: "Milo Corrected Again",
    secondPetName: "Pocky Corrected Again",
    petBreed: "Poodle Mix",
    petWeightLb: "23",
    petAgeYears: "4",
    ...updatedAnswers,
    prescreenNotes: "Latest verified booking notes",
    secondPrescreenNotes: "Latest verified second dog notes",
    dropoffDate: "2093-04-04",
    pickupDate: "2093-04-05",
    signature: "test-only-new-booking-signature",
  };
  const repeated = await createSubmissionRecord(repeatValues, customerId);
  assert.equal(repeated.pet.id, originalFirst.id);
  assert.equal(repeated.pets[1].id, originalSecond.id);
  assert.equal(await prisma.pet.count({ where: { customerId } }), 3);
  assert.equal((await loadCustomerPrefill(customerId)).customer.firstName, repeatValues.firstName);
  assert.equal(
    (await loadCustomerPrefill(customerId)).pets.find((pet) => pet.id === originalFirst.id).lastPrescreenNotes,
    repeatValues.prescreenNotes,
  );
  const repeatAgreement = await agreementState(repeated.submission.id);
  const edited = await updateSubmissionRecord({
    submissionId: repeated.submission.id,
    data: {
      ...repeatValues,
      firstName: "Maria Edited",
      petName: "Milo Edited",
      secondPetName: "Pocky Edited",
      prescreenNotes: "Latest edited booking notes",
    },
  });
  assert.equal(edited.pet.id, originalFirst.id);
  assert.equal(edited.pets[1].id, originalSecond.id);
  assert.equal(await prisma.pet.count({ where: { customerId } }), 3);
  const revision = await prisma.submissionRevision.findFirst({
    where: { submissionId: repeated.submission.id },
  });
  assert.deepEqual(revision.customerSnapshot, repeatAgreement.customerSnapshot);
  assert.deepEqual(revision.petSnapshot, repeatAgreement.petSnapshot);
  assert.equal(revision.signatureData, repeatAgreement.signatureData);
  assert.deepEqual(await agreementState(firstBooking.submission.id), originalAgreement);

  const beforeGuest = await loadCustomerPrefill(customerId);
  cookieJar.clear();
  const guest = await createSubmissionRecord({
    ...repeatValues,
    firstName: "Unverified overwrite attempt",
    petName: "Milo Edited",
    secondPetName: "Pocky Edited",
    petBreed: "Unverified breed",
    prescreenNotes: "Unverified private notes",
    dropoffDate: "2093-04-08",
    pickupDate: "2093-04-09",
  });
  assert.equal(guest.submission.customerSnapshot.firstName, "Unverified overwrite attempt");
  const afterGuest = await loadCustomerPrefill(customerId);
  assert.deepEqual(afterGuest.customer, beforeGuest.customer);
  for (const priorPet of beforeGuest.pets) {
    const currentPet = afterGuest.pets.find((pet) => pet.id === priorPet.id);
    for (const field of ["name", "breed", "weightLb", "ageYears", "lastPrescreenAnswers", "lastPrescreenNotes"])
      assert.deepEqual(currentPet[field], priorPet[field], `Guest submission must preserve saved ${field}`);
  }
  await assertNoMutation(customerId, () =>
    assert.rejects(createSubmissionRecord({
      ...repeatValues,
      savedPetId: foreignDog.id,
      firstName: "Must roll back",
      dropoffDate: "2093-04-12",
      pickupDate: "2093-04-13",
    }, customerId)),
  );

  await archiveCustomerDog(customerId, addedDog.id);
  await prisma.customer.update({
    where: { id: customerId },
    data: { emailMarketingOptIn: true, smsMarketingOptIn: true },
  });
  await setCustomerSession(customerId);
  const oldCookies = new Map(cookieJar);
  const oldCustomer = await prisma.customer.findUnique({ where: { id: customerId } });
  const oldLoginToken = `customer-crud-login-${stamp}`;
  await prisma.loginToken.create({
    data: {
      email: bookingValues.email,
      tokenHash: hashLoginToken(oldLoginToken),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const oldEditToken = await createSubmissionEditToken(firstBooking.submission.id);
  assert.ok(await findValidSubmissionEditToken(oldEditToken));
  const beforeDeactivation = await agreementState(firstBooking.submission.id);
  await deactivateCustomerAccount(customerId);
  const deactivated = await prisma.customer.findUnique({ where: { id: customerId } });
  assert.ok(deactivated.deactivatedAt);
  assert.ok(deactivated.sessionVersion > oldCustomer.sessionVersion);
  assert.equal(deactivated.emailMarketingOptIn, false);
  assert.equal(deactivated.smsMarketingOptIn, false);
  assert.equal(
    (await deactivateCustomerAccount(customerId)).sessionVersion,
    deactivated.sessionVersion,
    "Repeated account deactivation is idempotent",
  );
  assert.equal(await getCustomerSession(), null);
  assert.equal(await setCustomerSession(customerId), false);
  assert.equal((await readPrefill()).status, 401);
  assert.equal(await loadCustomerPrefill(customerId), null);
  assert.equal((await (await lookup(bookingValues.email)).json()).found, false);
  assert.equal((await patch({ customer: correctedOwner, pets: [] })).status, 401);
  assert.equal(await findValidSubmissionEditToken(oldEditToken), null);
  assert.match(
    (await verifyEmail(new Request(
      `http://localhost/api/auth/verify?token=${oldLoginToken}&next=/book`,
    ))).headers.get("location"),
    /^\/login\?error=/,
    "Deactivated accounts cannot verify an old login link",
  );
  await assert.rejects(createSubmissionRecord({
    ...bookingValues,
    dropoffDate: "2093-04-16",
    pickupDate: "2093-04-17",
  }));
  await assert.rejects(saveCustomerDetails(customerId, correctedOwner));
  await assert.rejects(saveCustomerDog(customerId, firstDog));
  assert.deepEqual(await agreementState(firstBooking.submission.id), beforeDeactivation);
  await restoreCustomerAccount(customerId);
  const restored = await prisma.customer.findUnique({ where: { id: customerId } });
  assert.equal(restored.deactivatedAt, null);
  assert.equal(restored.emailMarketingOptIn, false);
  assert.equal(restored.smsMarketingOptIn, false);
  cookieJar.clear();
  for (const [name, value] of oldCookies) cookieJar.set(name, value);
  assert.equal(await getCustomerSession(), null, "Restoring an account must not revive old sessions");
  assert.equal(await findValidSubmissionEditToken(oldEditToken), null);
  const revokedLogin = await verifyEmail(new Request(
    `http://localhost/api/auth/verify?token=${oldLoginToken}&next=/book`,
  ));
  assert.match(revokedLogin.headers.get("location"), /^\/login\?error=/);
  assert.equal(await getCustomerSession(), null);
  const freshLoginToken = `customer-crud-fresh-login-${stamp}`;
  await prisma.loginToken.create({
    data: {
      email: bookingValues.email,
      tokenHash: hashLoginToken(freshLoginToken),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  assert.equal(
    (await verifyEmail(new Request(
      `http://localhost/api/auth/verify?token=${freshLoginToken}&next=/book`,
    ))).headers.get("location"),
    "/book",
    "A restored customer can sign in with a newly verified email link",
  );
  assert.equal(
    (await restoreCustomerAccount(customerId)).sessionVersion,
    restored.sessionVersion,
    "Repeated restoration is idempotent and preserves the new session",
  );
  assert.equal((await readPrefill()).status, 200);
  assert.ok(!(await loadCustomerPrefill(customerId)).pets.some((pet) => pet.id === addedDog.id));
  assert.deepEqual(await agreementState(firstBooking.submission.id), beforeDeactivation);

  console.log(
    "PASS owner correction/reload, profile-only save, both dog renames without duplicates, answers/notes and explicit clearing, create/archive/restore, private/public prefill, immutable booking history, authenticated booking updates, guest protection, cross-customer isolation and atomic rollback; account deactivation/restore, session and token revocation, privacy and preserved history; no real emails sent",
  );
} finally {
  await prisma.submission.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.loginToken.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
}
