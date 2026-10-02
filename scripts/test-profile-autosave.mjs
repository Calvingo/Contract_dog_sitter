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
const { initialFormValues } = require("../lib/form-config.ts");
const { profileSavePayload, profileReadyToSave, applySavedProfileIds } = require("../lib/profile-autosave.ts");
const sent = { ...initialFormValues, firstName: "Original", lastName: "Test", phone: "5550100101", backupContact: "wechat", wechatId: "test", petName: "New dog", petBreed: "Corgi", petWeightLb: "20", petAgeYears: "3", prescreenNotes: "Dinner at 6" };
assert.equal(profileReadyToSave(initialFormValues), false);
assert.equal(profileReadyToSave(sent), true, "Saving does not require dates, agreement or signature");
assert.equal(profileReadyToSave({ ...sent, firstName: "" }), false);
assert.equal(profileReadyToSave({ ...sent, petWeightLb: "" }), false);
assert.equal(profileReadyToSave({ ...sent, wechatId: "" }), false);
assert.deepEqual(profileSavePayload(sent), profileSavePayload({ ...sent, dropoffDate: "2092-01-01", agreed: true, signature: "signed", firstTimeBooking: "yes" }), "Booking and consent edits never enter autosave");
const saved = { pets: [{ id: "created-dog", name: "New dog" }] };
const newer = { ...sent, firstName: "Latest name", petName: "Latest dog name", prescreenNotes: "Latest note", signature: "new-signature" };
const merged = applySavedProfileIds(newer, sent, saved);
assert.equal(merged.savedPetId, "created-dog");
assert.equal(merged.firstName, "Latest name");
assert.equal(merged.petName, "Latest dog name");
assert.equal(merged.prescreenNotes, "Latest note");
assert.equal(merged.signature, "new-signature");
assert.equal(applySavedProfileIds({ ...newer, savedPetId: "other-dog" }, sent, saved).savedPetId, "other-dog", "Old response cannot replace a different selection");
const two = { ...sent, hasSecondDog: true, secondPetName: "Second", secondPetBreed: "Poodle", secondPetWeightLb: "10", secondPetAgeYears: "2", secondPrescreenNotes: "Second note" };
const response = { pets: [...saved.pets, { id: "created-second", name: "Second" }] };
assert.equal(applySavedProfileIds(two, two, response).savedSecondPetId, "created-second");
assert.equal(applySavedProfileIds({ ...two, hasSecondDog: false, savedSecondPetId: "" }, two, response).savedSecondPetId, "");
assert.equal(profileSavePayload(two).pets[1].prescreenNotes, "Second note");
console.log("PASS autosave payloads: consent excluded, incomplete fields deferred, both pets, assigned IDs and newer edits preserved");
