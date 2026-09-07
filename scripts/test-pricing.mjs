import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), "dog-sitter-pricing-"));

try {
  execFileSync(process.execPath, [
    require.resolve("typescript/bin/tsc"),
    "lib/pricing.ts", "lib/submission-data.ts", "lib/form-config.ts",
    "--outDir", output, "--module", "commonjs", "--target", "ES2022",
    "--skipLibCheck", "--strict",
  ], { cwd: root, stdio: "inherit" });

  const { calculatePrice } = require(join(output, "pricing.js"));
  const { getSubmissionQuote } = require(join(output, "submission-data.js"));
  const { initialFormValues } = require(join(output, "form-config.js"));
  const stay = ["2026-10-12", "10:00", "2026-10-13", "10:00"];

  // One-day, non-holiday stays: each age/neuter combination has one surcharge.
  for (const [age, neutered, puppyFee, intactFee] of [
    [0.5, "no", 20, 0],
    [0.5, "yes", 10, 0],
    [1, "no", 0, 20],
    [1, "yes", 0, 0],
    [5, "no", 0, 20],
    [5, "yes", 0, 0],
  ]) {
    for (const medical of ["yes", "no", ""]) {
      const quote = calculatePrice(30, age, neutered, "no", medical, ...stay);
      assert.ok(quote);
      assert.equal(quote.puppyFee, puppyFee);
      assert.equal(quote.intactDogFee, intactFee);
      assert.equal(quote.specialCareFee, medical === "yes" ? 10 : 0);
      assert.equal(quote.totalPrice, 65 + puppyFee + intactFee + (medical === "yes" ? 10 : 0));
      assert.equal(quote.depositAmount, Math.round(quote.totalPrice * 20) / 100);
      if (puppyFee) assert.ok(quote.summary.includes(`× $${puppyFee}/day`));
      assert.equal(quote.summary.includes("special-care fee"), medical === "yes");
    }
  }

  // Half-day extensions prorate both puppy and special-care charges.
  const partial = calculatePrice(30, 0.5, "no", "no", "yes", ...stay.slice(0, 3), "14:00");
  assert.equal(partial.billableDays, 1.5);
  assert.equal(partial.puppyFee, 30);
  assert.equal(partial.intactDogFee, 0);
  assert.equal(partial.specialCareFee, 15);
  assert.equal(partial.totalPrice, 142.5);
  assert.equal(partial.depositAmount, 28.5);

  // Existing senior, high-energy, and holiday fees still combine with medical care.
  const combined = calculatePrice(30, 10, "no", "yes", "yes", "2026-09-04", "10:00", "2026-09-06", "10:00");
  assert.equal(combined.totalPrice, 250);
  assert.equal(combined.depositAmount, 50);
  assert.equal(combined.seniorDogFee, 20);
  assert.equal(combined.highEnergyDogFee, 20);
  assert.equal(combined.holidayFee, 20);

  // Server quotes use each dog's own medical answer and ignore a disabled second dog.
  const values = {
    ...initialFormValues,
    petWeightLb: "30", petAgeYears: "0.5", prescreenSpayedNeutered: "no",
    prescreenHighEnergy: "no", prescreenMedicalHistory: "yes",
    hasSecondDog: true, secondPetWeightLb: "30", secondPetAgeYears: "2",
    secondPrescreenSpayedNeutered: "no", secondPrescreenHighEnergy: "no",
    secondPrescreenMedicalHistory: "no",
    dropoffDate: stay[0], dropoffTime: stay[1], pickupDate: stay[2], pickupTime: stay[3],
  };
  const twoDogs = getSubmissionQuote(values);
  assert.deepEqual(twoDogs.dogs.map((dog) => dog.specialCareFee), [10, 0]);
  assert.equal(twoDogs.totalPrice, 180);
  assert.equal(twoDogs.depositAmount, 36);
  const switched = getSubmissionQuote({ ...values, prescreenMedicalHistory: "no", secondPrescreenMedicalHistory: "yes" });
  assert.deepEqual(switched.dogs.map((dog) => dog.specialCareFee), [0, 10]);
  const both = getSubmissionQuote({ ...values, secondPrescreenMedicalHistory: "yes" });
  assert.equal(both.totalPrice, 190);
  assert.equal(both.depositAmount, 38);
  const oneDog = getSubmissionQuote({ ...values, hasSecondDog: false });
  assert.equal(oneDog.dogs.length, 1);
  assert.equal(oneDog.totalPrice, 95);

  console.log("Pricing checks passed: age/neuter rates, medical care, proration, existing fees, totals, deposits, and multi-dog quotes.");
} finally {
  rmSync(output, { recursive: true, force: true });
}
