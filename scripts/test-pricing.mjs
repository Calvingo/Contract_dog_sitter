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
  const { getHolidayFeeForDate, countHolidayDaysInStay } = require(join(output, "holidays.js"));
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

  // Verify every calendar date against the requested 2027 schedule, including
  // non-holiday gaps and the continuous Christmas/New Year period into 2028.
  const holidaySchedule = [
    ["2027-01-01", "2027-01-03", 10],
    ["2027-01-15", "2027-01-18", 10],
    ["2027-02-12", "2027-02-15", 10],
    ["2027-05-28", "2027-05-31", 10],
    ["2027-06-18", "2027-06-20", 10],
    ["2027-07-02", "2027-07-05", 10],
    ["2027-09-03", "2027-09-06", 10],
    ["2027-11-25", "2027-11-28", 10],
    ["2027-12-24", "2028-01-03", 15],
  ];
  for (const date = new Date("2027-01-01T00:00:00Z"); date <= new Date("2028-01-05T00:00:00Z"); date.setUTCDate(date.getUTCDate() + 1)) {
    const iso = date.toISOString().slice(0, 10);
    const expected = holidaySchedule.find(([start, end]) => iso >= start && iso <= end)?.[2] ?? 0;
    assert.equal(getHolidayFeeForDate(iso), expected, iso);
    const quote = calculatePrice(30, 2, "yes", "no", "no", iso, "10:00", iso, "14:00");
    assert.equal(quote.holidayFee, expected * 0.5, `${iso}: half-day holiday fee`);
    assert.equal(quote.totalPrice, (65 + expected) * 0.5, `${iso}: total`);
  }
  assert.equal(getHolidayFeeForDate("2026-12-24"), 10);
  assert.equal(getHolidayFeeForDate("2026-12-28"), 0);
  assert.equal(countHolidayDaysInStay("2026-12-31", "2027-01-03").holidayDays, 4);
  assert.equal(countHolidayDaysInStay("2027-12-24", "2028-01-03").holidayDays, 11);

  // Touching either endpoint triggers the rate for all billable days; stays
  // spanning both rates use $15, and fractional days retain existing proration.
  for (const [start, end, pickupTime, days, rate] of [
    ["2027-01-14", "2027-01-15", "10:00", 1, 10],
    ["2027-01-18", "2027-01-19", "10:00", 1, 10],
    ["2027-12-23", "2027-12-24", "10:00", 1, 15],
    ["2028-01-03", "2028-01-04", "10:00", 1, 15],
    ["2027-12-23", "2028-01-04", "10:00", 12, 15],
    ["2027-12-28", "2027-12-30", "14:00", 2.5, 15],
    ["2027-11-25", "2027-12-24", "10:00", 29, 15],
  ]) {
    const quote = calculatePrice(30, 2, "yes", "no", "no", start, "10:00", end, pickupTime);
    assert.equal(quote.billableDays, days);
    assert.equal(quote.holidayDays, days);
    assert.equal(quote.holidayFeePerDay, rate);
    assert.equal(quote.holidayFee, days * rate);
    assert.equal(quote.totalPrice, days * (65 + rate));
    assert.equal(quote.depositAmount, Math.round(quote.totalPrice * 20) / 100);
    assert.ok(quote.summary.includes(`holiday rate for entire stay (${days === 1 ? "1 day" : `${days} days`} × $${rate}/day)`));
  }

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

  const christmasDogs = getSubmissionQuote({
    ...values,
    dropoffDate: "2027-12-28", dropoffTime: "10:00",
    pickupDate: "2027-12-30", pickupTime: "14:00",
  });
  assert.deepEqual(christmasDogs.dogs.map((dog) => dog.holidayFeePerDay), [15, 15]);
  assert.deepEqual(christmasDogs.dogs.map((dog) => dog.holidayFee), [37.5, 37.5]);
  assert.equal(christmasDogs.totalPrice, 525);
  assert.equal(christmasDogs.depositAmount, 105);

  console.log("Pricing checks passed: age/neuter rates, medical care, proration, 2027 holiday calendar, Christmas/New Year rates, stay boundaries, totals, deposits, and multi-dog quotes.");
} finally {
  rmSync(output, { recursive: true, force: true });
}
