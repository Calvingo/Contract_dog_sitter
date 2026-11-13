import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url), ts = require("typescript");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith("@/") ? resolve(root, request.slice(2)) : request, ...args);
};
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const { petAgeInputFromYears, petAgeInYears } = require("../lib/pet-age.ts");
const { initialFormValues, prescreenQuestions, secondPrescreenQuestions } = require("../lib/form-config.ts");
const { petPrefillValues } = require("../lib/booking-prefill.ts");
const { profileSavePayload } = require("../lib/profile-autosave.ts");
const { buildPetSnapshots, getSubmissionQuote } = require("../lib/submission-data.ts");
const { validateSubmission } = require("../lib/validate.ts");

for (const unit of ["months", "years"]) {
  assert.equal(petAgeInYears("", unit), "", "Clearing an age must not save a newborn age");
  assert.equal(petAgeInYears(" ", unit), "");
  assert.equal(petAgeInYears("0", unit), "0", "A newborn age remains valid");
}
assert.equal(petAgeInYears("8", "months"), String(8 / 12));
assert.equal(petAgeInYears("12", "months"), "1");
assert.equal(petAgeInYears("18", "months"), "1.5");
assert.equal(petAgeInYears("2.5", "years"), "2.5");
assert.equal(petAgeInYears("480", "months"), "40");
assert.deepEqual(petAgeInputFromYears(""), { amount: "", unit: "years" });
assert.deepEqual(petAgeInputFromYears("1.5"), { amount: "1.5", unit: "years" });
assert.deepEqual(petAgeInputFromYears("0.67"), { amount: "8.04", unit: "months" }, "Do not round legacy fractional ages to whole months");
for (let months = 0; months < 12; months++) {
  const years = petAgeInYears(String(months), "months");
  assert.deepEqual(petAgeInputFromYears(years), { amount: String(months), unit: "months" });
}

const values = {
  ...initialFormValues,
  ...Object.fromEntries([...prescreenQuestions, ...secondPrescreenQuestions].map(q => [q.name, "no"])),
  firstTimeBooking: "yes", firstName: "Age", lastName: "Test", email: "age@example.test", phone: "5550100101",
  backupContact: "email", emergencyContactName: "Contact", emergencyContactPhone: "5550100102",
  petName: "Puppy", petBreed: "Mix", petWeightLb: "20", petAgeYears: petAgeInYears("8", "months"),
  hasSecondDog: true, secondPetName: "Second puppy", secondPetBreed: "Mix", secondPetWeightLb: "20",
  secondPetAgeYears: petAgeInYears("7", "months"),
  dropoffDate: "2090-04-10", dropoffTime: "10:00", pickupDate: "2090-04-11", pickupTime: "10:00",
  agreed: true, signature: "data:image/png;base64,dGVzdA==",
};
assert.equal(validateSubmission(values), null, "Both dogs can book below one year");
assert.deepEqual(buildPetSnapshots(values).map(pet => pet.ageYears), [8 / 12, 7 / 12]);
assert.deepEqual(profileSavePayload(values).pets.map(pet => pet.ageYears), [String(8 / 12), String(7 / 12)]);
for (const [index, snapshot] of buildPetSnapshots(values).entries()) {
  const field = index === 0 ? "petAgeYears" : "secondPetAgeYears";
  const saved = petPrefillValues({ ...snapshot, id: `saved-${index}` }, index === 1);
  assert.deepEqual(petAgeInputFromYears(saved[field]), { amount: index === 0 ? "8" : "7", unit: "months" });
  assert.match(validateSubmission({ ...values, [field]: petAgeInYears("-1", "months") }), /valid age/);
  assert.match(validateSubmission({ ...values, [field]: "" }), /required/);
  assert.match(validateSubmission({ ...values, [field]: petAgeInYears("Infinity", "months") }), /valid age/);
}

for (const [months, puppyFee, intactDogFee] of [[8, 20, 0], [11, 20, 0], [12, 0, 20], [18, 0, 20]]) {
  const age = petAgeInYears(String(months), "months");
  const quote = getSubmissionQuote({ ...values, petAgeYears: age, secondPetAgeYears: age });
  for (const dog of quote.dogs) {
    assert.equal(dog.puppyFee, puppyFee, `${months} months: puppy fee`);
    assert.equal(dog.intactDogFee, intactDogFee, `${months} months: intact adult fee`);
  }
}
console.log("PASS pet ages: months/years, empty and zero, saved-pet prefill, both dogs, snapshots/autosave and puppy pricing boundaries");
