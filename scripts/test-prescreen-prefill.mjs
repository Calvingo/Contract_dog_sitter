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
  customerPrefillValues,
  hasSavedPrescreen,
  petPrefillValues,
  prescreenPrefillValues,
  selectPrefillPets,
} = require("../lib/booking-prefill.ts");
const answers = Object.fromEntries(
  prescreenQuestions.map((q, index) => [q.name, index % 2 ? "yes" : "no"]),
);
const pet = {
  id: "dog",
  name: "Pocky",
  breed: "Corgi",
  weightLb: 20,
  ageYears: 3,
  lastPrescreenAnswers: answers,
  lastPrescreenNotes: "Dinner at 6 pm",
};
const ownerFields = {
  firstName: "Returning",
  lastName: "Guest",
  email: "returning@example.test",
  phone: "5551234567",
  backupContact: "wechat",
  emergencyContactName: "Trusted Friend",
  emergencyContactPhone: "5559876543",
  wechatId: "returning-guest",
};
const customer = { hasBookedBefore: true, ...ownerFields };
assert.deepEqual(customerPrefillValues(customer), {
  firstTimeBooking: "no",
  ...ownerFields,
  agreed: false,
  signature: "",
});
assert.equal(
  customerPrefillValues({ ...customer, hasBookedBefore: false }).firstTimeBooking,
  "yes",
);
const secondAnswers = Object.fromEntries(
  prescreenQuestions.map((q) => [q.name, answers[q.name] === "yes" ? "no" : "yes"]),
);
const secondFormAnswers = Object.fromEntries(
  secondPrescreenQuestions.map((q, index) => [
    q.name,
    secondAnswers[prescreenQuestions[index].name],
  ]),
);
const secondPet = {
  id: "second-dog",
  name: "Milo",
  breed: "Poodle",
  weightLb: 15.5,
  ageYears: 0.5,
  lastPrescreenAnswers: secondAnswers,
  lastPrescreenNotes: "Bring blue blanket",
};
assert.deepEqual(petPrefillValues(pet), {
  savedPetId: "dog",
  petName: "Pocky",
  petBreed: "Corgi",
  petWeightLb: "20",
  petAgeYears: "3",
  ...answers,
  prescreenNotes: "Dinner at 6 pm",
});
assert.deepEqual(petPrefillValues(secondPet, true), {
  savedSecondPetId: "second-dog",
  hasSecondDog: true,
  secondPetName: "Milo",
  secondPetBreed: "Poodle",
  secondPetWeightLb: "15.5",
  secondPetAgeYears: "0.5",
  ...secondFormAnswers,
  secondPrescreenNotes: "Bring blue blanket",
});
for (const second of [false, true]) {
  const ageField = second ? "secondPetAgeYears" : "petAgeYears";
  assert.equal(petPrefillValues({ ...pet, ageYears: 0 }, second)[ageField], "0");
  for (const ageYears of [null, undefined])
    assert.equal(petPrefillValues({ ...pet, ageYears }, second)[ageField], "");
}
const privateData = { authenticated: true, customer, pets: [pet, secondPet] };
assert.deepEqual(selectPrefillPets(privateData, {}), { first: pet, second: secondPet });
assert.deepEqual(selectPrefillPets(privateData, { first: secondPet.id }), {
  first: secondPet,
  second: pet,
});
assert.deepEqual(selectPrefillPets(privateData, { second: pet.id }), {
  first: secondPet,
  second: pet,
}, "Verification must preserve an explicit second dog without selecting it twice");
assert.deepEqual(selectPrefillPets(privateData, { first: pet.id, second: pet.id }), {
  first: pet,
  second: undefined,
});
assert.deepEqual(selectPrefillPets({ ...privateData, pets: [pet] }, {}), {
  first: pet,
  second: undefined,
});
assert.deepEqual(selectPrefillPets({ ...privateData, pets: [] }, {}), {
  first: undefined,
  second: undefined,
});
assert.deepEqual(selectPrefillPets(privateData, { first: "" }), {
  first: undefined,
  second: undefined,
}, "Clearing dog 1 must not restore a saved dog during verified prefill");
assert.deepEqual(selectPrefillPets(privateData, { first: pet.id, second: "" }), {
  first: pet,
  second: undefined,
}, "Removing dog 2 must survive another prefill");
const publicData = { ...privateData, authenticated: false };
assert.deepEqual(selectPrefillPets(publicData, {}), {
  first: undefined,
  second: undefined,
}, "Email-only lookup must not automatically choose among several dogs");
assert.deepEqual(selectPrefillPets(publicData, { first: pet.id }), {
  first: pet,
  second: undefined,
});
assert.deepEqual(selectPrefillPets({ ...publicData, pets: [pet] }, {}), {
  first: pet,
  second: undefined,
});
const currentBooking = {
  dropoffDate: "2092-05-10",
  dropoffTime: "09:30",
  pickupDate: "2092-05-12",
  pickupTime: "17:15",
};
const merged = {
  ...initialFormValues,
  ...currentBooking,
  agreed: true,
  signature: "previous-booking-signature",
  ...customerPrefillValues(customer),
  ...petPrefillValues(pet),
  ...petPrefillValues(secondPet, true),
};
for (const [field, value] of Object.entries(currentBooking))
  assert.equal(merged[field], value, `Prefill must preserve this booking's ${field}`);
assert.equal(merged.agreed, false, "A new booking requires agreement again");
assert.equal(merged.signature, "", "A previous signature must never be prefilled");
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
  "PASS all owner fields, both dogs' details/answers/notes, zero/missing age, verified selection, explicit clearing, public selection, current booking dates and fresh agreement/signature",
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
  if (request === "nodemailer")
    return { createTransport: () => assert.fail("This test must never send real email") };
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
  ...ownerFields,
  ...answers,
  ...secondFormAnswers,
  email: `prescreen-${stamp}@example.test`,
  petName: "Pocky",
  petBreed: "Corgi",
  petWeightLb: "20",
  petAgeYears: "3",
  prescreenNotes: "Dinner at 6 pm",
  hasSecondDog: true,
  secondPetName: "Milo",
  secondPetBreed: "Poodle",
  secondPetWeightLb: "15.5",
  secondPetAgeYears: "0.5",
  secondPrescreenNotes: "Bring blue blanket",
  dropoffDate: "2092-04-01",
  pickupDate: "2092-04-02",
  dropoffTime: "10:00",
  pickupTime: "10:00",
  signature: "test-only",
  agreed: true,
};
function assertStoredPrefill(data, expected) {
  assert.equal(data.authenticated, true);
  assert.deepEqual(data.customer, {
    hasBookedBefore: true,
    ...Object.fromEntries(Object.keys(ownerFields).map((field) => [field, expected[field]])),
  });
  assert.equal(data.pets.length, 2);
  const first = data.pets.find((item) => item.name === expected.petName);
  const second = data.pets.find((item) => item.name === expected.secondPetName);
  assert.ok(first && second && first.id !== second.id);
  for (const [savedPet, isSecond] of [[first, false], [second, true]]) {
    assert.equal(savedPet.breed, expected[isSecond ? "secondPetBreed" : "petBreed"]);
    assert.equal(savedPet.weightLb, Number(expected[isSecond ? "secondPetWeightLb" : "petWeightLb"]));
    assert.equal(savedPet.ageYears, Number(expected[isSecond ? "secondPetAgeYears" : "petAgeYears"]));
    assert.equal(savedPet.lastPrescreenNotes, expected[isSecond ? "secondPrescreenNotes" : "prescreenNotes"]);
    assert.deepEqual(savedPet.lastPrescreenAnswers, Object.fromEntries(
      prescreenQuestions.map((question, index) => [
        question.name,
        expected[isSecond ? secondPrescreenQuestions[index].name : question.name],
      ]),
    ));
    assert.ok(Number.isFinite(Date.parse(savedPet.lastSubmittedAt)));
  }
  const autoSelected = selectPrefillPets(data, {});
  assert.deepEqual(new Set([autoSelected.first.id, autoSelected.second.id]), new Set([first.id, second.id]));
  const filled = {
    ...initialFormValues,
    ...currentBooking,
    agreed: true,
    signature: "old-signature",
    ...customerPrefillValues(data.customer),
    ...petPrefillValues(first),
    ...petPrefillValues(second, true),
  };
  const savedFields = [
    ...Object.keys(ownerFields),
    "petName", "petBreed", "petWeightLb", "petAgeYears", "prescreenNotes",
    "secondPetName", "secondPetBreed", "secondPetWeightLb", "secondPetAgeYears", "secondPrescreenNotes",
    ...prescreenQuestions.map((question) => question.name),
    ...secondPrescreenQuestions.map((question) => question.name),
  ];
  for (const field of savedFields)
    assert.equal(filled[field], expected[field], `${field} survives storage, retrieval and form prefill`);
  for (const [field, value] of Object.entries(currentBooking))
    assert.equal(filled[field], value);
  assert.equal(filled.firstTimeBooking, "no");
  assert.equal(filled.hasSecondDog, true);
  assert.equal(filled.agreed, false);
  assert.equal(filled.signature, "");
}
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
  assertStoredPrefill(saved, values);
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
  assert.deepEqual(publicLookup.customer, {
    ...saved.customer,
    emergencyContactName: "",
    emergencyContactPhone: "",
    wechatId: "",
  }, "Email-only lookup must not disclose emergency contacts or WeChat ID");
  assert.equal(publicLookup.pets.length, 2);
  for (const publicPet of publicLookup.pets) {
    const fullPet = saved.pets.find((item) => item.id === publicPet.id);
    assert.deepEqual(publicPet, {
      id: fullPet.id,
      name: fullPet.name,
      breed: fullPet.breed,
      weightLb: fullPet.weightLb,
      ageYears: fullPet.ageYears,
    });
  }
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
  assertStoredPrefill(rich, values);
  assertStoredPrefill(await (await lookup(values.email)).json(), values);
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
  assertStoredPrefill(await loadCustomerPrefill(created.customer.id), {
    ...values,
    prescreenNotes: "Updated meal plan",
  });
  const editedValues = {
    ...values,
    ...secondAnswers,
    ...Object.fromEntries(secondPrescreenQuestions.map((question, index) => [
      question.name, answers[prescreenQuestions[index].name],
    ])),
    firstName: "Updated",
    lastName: "Owner",
    phone: "5551112233",
    backupContact: "sms",
    emergencyContactName: "New Contact",
    emergencyContactPhone: "5554445566",
    wechatId: "updated-guest",
    petBreed: "Corgi Mix",
    petWeightLb: "22.5",
    petAgeYears: "4",
    secondPetBreed: "Miniature Poodle",
    secondPetWeightLb: "18",
    secondPetAgeYears: "3",
    dropoffDate: "2092-04-04",
    pickupDate: "2092-04-05",
    prescreenNotes: "Latest care notes",
    secondPrescreenNotes: "Latest Milo notes",
  };
  await updateSubmissionRecord({
    submissionId: repeat.submission.id,
    data: editedValues,
  });
  saved = await loadCustomerPrefill(created.customer.id);
  assertStoredPrefill(saved, editedValues);
  assertStoredPrefill(await (await GET()).json(), editedValues);
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
    "PASS every owner/pet field and answer through save/rebook/edit and verified form prefill, public privacy boundaries, multiple dogs, legacy fallback, revision history, private caching and cross-customer isolation; no real emails sent",
  );
} finally {
  await prisma.submission.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  await prisma.loginToken.deleteMany({ where: { email: values.email } });
  await prisma.$disconnect();
}
