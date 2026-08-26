"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AgreementPanel } from "@/components/AgreementPanel";
import { BoardingChecklist } from "@/components/BoardingChecklist";
import { FormFieldInput } from "@/components/FormFieldInput";
import { FormSection } from "@/components/FormSection";
import { PrescreenField } from "@/components/PrescreenField";
import { PrescreenNotes } from "@/components/PrescreenNotes";
import { PriceEstimate } from "@/components/PriceEstimate";
import { SignaturePad } from "@/components/SignaturePad";
import { isPickupDropoffTimeAllowed } from "@/lib/booking-time";
import { parseDateTime } from "@/lib/pricing";
import {
  formFields,
  initialFormValues,
  prescreenQuestions,
  secondPetFields,
  secondPrescreenQuestions,
  type FormValues,
} from "@/lib/form-config";
import { ui } from "@/lib/i18n";

type PrefillPet = {
  id: string;
  name: string;
  breed: string;
  weightLb: number;
  ageYears?: number | null;
  lastSubmittedAt?: string | null;
};

type PrefillResponse = {
  authenticated: boolean;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    backupContact: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    wechatId: string;
  };
  pets: PrefillPet[];
};

export default function HomePage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-4 py-8" />}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editToken = searchParams.get("editToken");
  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>(
    {}
  );
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasReadAgreement, setHasReadAgreement] = useState(false);
  const [returningEmail, setReturningEmail] = useState("");
  const [returningStatus, setReturningStatus] = useState("");
  const [prefill, setPrefill] = useState<PrefillResponse | null>(null);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [editNotice, setEditNotice] = useState("");

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const ownerName = `${formValues.firstName} ${formValues.lastName}`.trim();
  const needsWechatId = formValues.backupContact === "wechat";

  const applyCustomerPrefill = useCallback(
    (customer: PrefillResponse["customer"]) => {
      setFormValues((current) => ({
        ...current,
        firstTimeBooking: "no",
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        backupContact: customer.backupContact,
        emergencyContactName: customer.emergencyContactName,
        emergencyContactPhone: customer.emergencyContactPhone,
        wechatId: customer.wechatId,
      }));
    },
    []
  );

  const applyPetPrefill = useCallback((pet: PrefillPet) => {
    setSelectedPetId(pet.id);
    setFormValues((current) => ({
      ...current,
      petName: pet.name,
      petBreed: pet.breed,
      petWeightLb: String(pet.weightLb),
      petAgeYears: pet.ageYears == null ? "" : String(pet.ageYears),
    }));
  }, []);

  const applySecondPetPrefill = useCallback((pet: PrefillPet) => {
    setFormValues((current) => ({
      ...current,
      hasSecondDog: true,
      secondPetName: pet.name,
      secondPetBreed: pet.breed,
      secondPetWeightLb: String(pet.weightLb),
      secondPetAgeYears: pet.ageYears == null ? "" : String(pet.ageYears),
    }));
  }, []);

  const applyPrefill = useCallback(
    (data: PrefillResponse) => {
      setPrefill(data);
      applyCustomerPrefill(data.customer);
      if (data.pets.length === 1) {
        applyPetPrefill(data.pets[0]);
      }
      setReturningStatus("Saved profile loaded.");
    },
    [applyCustomerPrefill, applyPetPrefill]
  );

  const loadPrefill = useCallback(async () => {
    try {
      const response = await fetch("/api/me/prefill");
      if (!response.ok) return;

      const data = (await response.json()) as PrefillResponse;
      if (!data.authenticated) return;

      applyPrefill(data);
    } catch {
      // Prefill is optional; leave the blank form usable.
    }
  }, [applyPrefill]);

  const fetchPrefillByEmail = useCallback(
    async (emailInput: string) => {
      const normalized = emailInput.trim().toLowerCase();
      if (!normalized.includes("@")) {
        return;
      }

      try {
        const response = await fetch(
          `/api/me/prefill?email=${encodeURIComponent(normalized)}`
        );
        if (!response.ok) {
          setPrefill(null);
          setSelectedPetId("");
          setReturningStatus("No saved profile found for this email.");
          return;
        }
        const data = (await response.json()) as PrefillResponse;
        if (!data.authenticated) {
          setPrefill(null);
          setSelectedPetId("");
          setReturningStatus("No saved profile found for this email.");
          return;
        }
        applyPrefill(data);
      } catch {
        setReturningStatus("Could not load the saved profile. Please try again.");
      }
    },
    [applyPrefill]
  );

  useEffect(() => {
    if (editToken) return;
    const trimmed = returningEmail.trim().toLowerCase();
    if (!trimmed) return;
    const timer = setTimeout(() => {
      void fetchPrefillByEmail(trimmed);
    }, 450);
    return () => clearTimeout(timer);
  }, [editToken, returningEmail, fetchPrefillByEmail]);

  useEffect(() => {
    if (editToken) return;
    void loadPrefill();
  }, [editToken, loadPrefill]);

  useEffect(() => {
    if (!editToken) return;

    const loadEditSubmission = async () => {
      try {
        const response = await fetch(
          `/api/submission/edit?token=${encodeURIComponent(editToken)}`
        );
        const data = (await response.json()) as {
          values?: FormValues;
          notice?: string;
          error?: string;
        };

        if (!response.ok || !data.values) {
          setSubmitError(data.error || "This edit link is no longer available.");
          return;
        }

        setFormValues({
          ...data.values,
          agreed: false,
          signature: "",
          honeypot: "",
        });
        setHasReadAgreement(false);
        setEditNotice(data.notice || "You are editing a submitted request.");
      } catch {
        setSubmitError("Could not load this edit link. Please try again.");
      }
    };

    void loadEditSubmission();
  }, [editToken]);

  const handleFieldChange = (name: keyof FormValues, value: string) => {
    setFormValues((current) => {
      const next = { ...current, [name]: value };
      if (name === "backupContact" && value !== "wechat") {
        next.wechatId = "";
      }
      return next;
    });
    setErrors((current) => ({ ...current, [name]: undefined }));
    setSubmitError("");
  };

  const handleReachBottom = useCallback(() => {
    setHasReadAgreement(true);
  }, []);

  const validateClient = (): boolean => {
    const nextErrors: Partial<Record<keyof FormValues, string>> = {};

    for (const field of formFields) {
      if (field.name === "wechatId") continue;
      const value = String(formValues[field.name] ?? "").trim();
      if (field.required && !value) {
        nextErrors[field.name] = ui.required;
      }
    }

    for (const question of prescreenQuestions) {
      const value = String(formValues[question.name] ?? "").trim();
      if (!value) {
        nextErrors[question.name] = ui.required;
      }
    }

    if (needsWechatId && !formValues.wechatId.trim()) {
      nextErrors.wechatId = ui.wechatIdRequired;
    }

    const weight = Number(formValues.petWeightLb);
    if (formValues.petWeightLb && (!Number.isFinite(weight) || weight <= 0)) {
      nextErrors.petWeightLb = ui.invalidWeight;
    }

    const age = Number(formValues.petAgeYears);
    if (
      formValues.petAgeYears &&
      (!Number.isFinite(age) || age < 0)
    ) {
      nextErrors.petAgeYears = ui.invalidAge;
    }

    if (formValues.hasSecondDog) {
      for (const field of secondPetFields) {
        const value = String(formValues[field.name] ?? "").trim();
        if (!value) nextErrors[field.name] = ui.required;
      }
      for (const question of secondPrescreenQuestions) {
        if (!String(formValues[question.name] ?? "").trim()) {
          nextErrors[question.name] = ui.required;
        }
      }
      const secondWeight = Number(formValues.secondPetWeightLb);
      const secondAge = Number(formValues.secondPetAgeYears);
      if (formValues.secondPetWeightLb && (!Number.isFinite(secondWeight) || secondWeight <= 0)) nextErrors.secondPetWeightLb = ui.invalidWeight;
      if (formValues.secondPetAgeYears && (!Number.isFinite(secondAge) || secondAge < 0)) nextErrors.secondPetAgeYears = ui.invalidAge;
      if (formValues.petName.trim().toLowerCase() === formValues.secondPetName.trim().toLowerCase()) nextErrors.secondPetName = "Please enter a different name for the second dog.";
    }

    const dropoff = parseDateTime(formValues.dropoffDate, formValues.dropoffTime);
    const pickup = parseDateTime(formValues.pickupDate, formValues.pickupTime);
    if (
      formValues.dropoffTime &&
      !isPickupDropoffTimeAllowed(formValues.dropoffTime)
    ) {
      nextErrors.dropoffTime = ui.pickupDropoffTimeRestricted;
    }
    if (
      formValues.pickupTime &&
      !isPickupDropoffTimeAllowed(formValues.pickupTime)
    ) {
      nextErrors.pickupTime = ui.pickupDropoffTimeRestricted;
    }
    if (dropoff && pickup && pickup <= dropoff) {
      nextErrors.pickupDate = ui.pickupBeforeDropoff;
      nextErrors.pickupTime = ui.pickupBeforeDropoff;
    }

    if (!hasReadAgreement) {
      nextErrors.agreed = ui.agreementScrollRequired;
    } else if (!formValues.agreed) {
      nextErrors.agreed = ui.agreeRequired;
    }

    if (!formValues.signature) {
      nextErrors.signature = ui.signatureRequired;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateClient()) return;

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(
        editToken ? "/api/submission/edit" : "/api/submit",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editToken ? { token: editToken, values: formValues } : formValues
          ),
        }
      );

      if (!response.ok) {
        throw new Error("Submit failed");
      }

      router.push("/success");
    } catch {
      setSubmitError(ui.submitError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const bookingFields = formFields.filter((field) => field.section === "booking");
  const ownerFields = formFields.filter(
    (field) => field.section === "owner" && field.name !== "wechatId"
  );
  const petFields = formFields.filter((field) => field.section === "pet");
  const wechatField = formFields.find((field) => field.name === "wechatId");

  const canSubmit =
    !isSubmitting &&
    hasReadAgreement &&
    formValues.agreed &&
    !!formValues.signature;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-stone-900">{ui.siteTitle}</h1>
            <p className="mt-1 text-stone-600">{ui.siteSubtitle}</p>
          </div>
          <Link
            href="/admin/login"
            className="inline-flex w-fit rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-orange-50"
          >
            Admin Login
          </Link>
        </header>

        <BoardingChecklist />

        <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-orange-100">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">
              Returning customer
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Enter your email to load saved owner and pet details automatically.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
            className="grid gap-3"
          >
            <input
              type="email"
              value={returningEmail}
              onChange={(event) => {
                setReturningEmail(event.target.value);
                setPrefill(null);
                setSelectedPetId("");
                setReturningStatus("");
              }}
              onBlur={() => {
                void fetchPrefillByEmail(returningEmail);
              }}
              placeholder="Email address"
              className="w-full rounded-xl border border-orange-100 bg-white px-4 py-3 text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              required
            />
          </form>

          {prefill ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-green-700">
                Welcome back, {prefill.customer.firstName}.
              </p>
              {prefill.pets.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-stone-700">
                    Choose a saved pet
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {prefill.pets.map((pet) => (
                      <button
                        key={pet.id}
                        type="button"
                        onClick={() => applyPetPrefill(pet)}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                          selectedPetId === pet.id
                            ? "border-orange-500 bg-orange-600 text-white"
                            : "border-orange-200 bg-white text-stone-700 hover:bg-orange-50"
                        }`}
                      >
                        {pet.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {returningStatus ? (
            <p className="text-sm text-stone-600">{returningStatus}</p>
          ) : null}
        </section>

        {editNotice ? (
          <section className="rounded-2xl bg-amber-50 p-5 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
            {editNotice}
          </section>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="text"
            name="honeypot"
            value={formValues.honeypot}
            onChange={(event) => handleFieldChange("honeypot", event.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
          />

          <FormSection title={ui.sections.booking}>
            {bookingFields.map((field) => (
              <FormFieldInput
                key={field.name}
                field={field}
                value={String(formValues[field.name] ?? "")}
                error={errors[field.name]}
                selectPlaceholder={ui.selectPlaceholder}
                onChange={handleFieldChange}
              />
            ))}
          </FormSection>

          <FormSection title={`Dog 1 — ${ui.sections.prescreen}`}>
            <p className="text-sm text-stone-600">{ui.sections.prescreenIntro}</p>
            {prescreenQuestions.map((question) => (
              <PrescreenField
                key={question.name}
                name={question.name}
                label={question.label}
                value={String(formValues[question.name] ?? "")}
                error={errors[question.name]}
                onChange={handleFieldChange}
              />
            ))}
            <PrescreenNotes
              value={formValues.prescreenNotes}
              label={ui.prescreenNotesLabel}
              placeholder={ui.prescreenNotesPlaceholder}
              onChange={handleFieldChange}
            />
          </FormSection>

          <FormSection title={ui.sections.owner}>
            {ownerFields.map((field) => (
              <FormFieldInput
                key={field.name}
                field={field}
                value={String(formValues[field.name] ?? "")}
                error={errors[field.name]}
                selectPlaceholder={ui.selectPlaceholder}
                onChange={handleFieldChange}
              />
            ))}
            {needsWechatId && wechatField ? (
              <FormFieldInput
                field={{ ...wechatField, required: true }}
                value={formValues.wechatId}
                error={errors.wechatId}
                selectPlaceholder={ui.selectPlaceholder}
                onChange={handleFieldChange}
              />
            ) : null}
          </FormSection>

          <FormSection title={ui.sections.pet}>
            <h3 className="text-base font-semibold text-stone-800">Dog 1</h3>
            {petFields.map((field) => (
              <FormFieldInput
                key={field.name}
                field={field}
                value={String(formValues[field.name] ?? "")}
                error={errors[field.name]}
                selectPlaceholder={ui.selectPlaceholder}
                onChange={handleFieldChange}
              />
            ))}
            <PriceEstimate
              values={formValues}
              title={ui.priceEstimateTitle}
              incompleteHint={ui.priceEstimateIncomplete}
              holidayNote={ui.priceEstimateHolidayNote}
            />
            {!formValues.hasSecondDog ? (
              <button
                type="button"
                onClick={() => setFormValues((current) => ({ ...current, hasSecondDog: true }))}
                className="w-full rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
              >
                + Add a Second Dog
              </button>
            ) : null}
          </FormSection>

          {formValues.hasSecondDog ? (
            <FormSection title="Dog 2 — Information & Pre-Screening">
              {prefill?.pets.length ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-stone-700">Choose a saved dog</p>
                  <div className="flex flex-wrap gap-2">
                    {prefill.pets.map((pet) => (
                      <button key={pet.id} type="button" onClick={() => applySecondPetPrefill(pet)} className="rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-orange-50">{pet.name}</button>
                    ))}
                  </div>
                </div>
              ) : null}
              {secondPetFields.map((field) => (
                <FormFieldInput key={field.name} field={field} value={String(formValues[field.name] ?? "")} error={errors[field.name]} selectPlaceholder={ui.selectPlaceholder} onChange={handleFieldChange} />
              ))}
              <p className="text-sm text-stone-600">Please answer these questions for the second dog.</p>
              {secondPrescreenQuestions.map((question) => (
                <PrescreenField key={question.name} name={question.name} label={question.label} value={String(formValues[question.name] ?? "")} error={errors[question.name]} onChange={handleFieldChange} />
              ))}
              <PrescreenNotes value={formValues.secondPrescreenNotes} label="Additional notes for Dog 2" placeholder={ui.prescreenNotesPlaceholder} onChange={handleFieldChange} name="secondPrescreenNotes" />
              <button
                type="button"
                onClick={() => setFormValues((current) => ({ ...current, hasSecondDog: false }))}
                className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Remove Second Dog
              </button>
            </FormSection>
          ) : null}

          <FormSection title={ui.sections.agreement}>
            <AgreementPanel
              intro={ui.agreementIntro}
              scrollHint={ui.agreementScrollHint}
              hasReadToBottom={hasReadAgreement}
              onReachBottom={handleReachBottom}
            />
            <label
              className={`flex items-start gap-3 rounded-xl bg-orange-50/60 p-4 ${
                !hasReadAgreement ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={formValues.agreed}
                disabled={!hasReadAgreement}
                onChange={(event) => {
                  setFormValues((current) => ({
                    ...current,
                    agreed: event.target.checked,
                  }));
                  setErrors((current) => ({ ...current, agreed: undefined }));
                }}
                className="mt-1 h-4 w-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-stone-700">{ui.agreeLabel}</span>
            </label>
            {errors.agreed ? (
              <p className="text-sm text-red-500">{errors.agreed}</p>
            ) : null}
          </FormSection>

          <FormSection title={ui.sections.signature}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-orange-50/60 px-4 py-3 text-sm">
                <div className="font-medium text-stone-700">{ui.ownerName}</div>
                <div className="mt-1 text-stone-900">{ownerName || "—"}</div>
              </div>
              <div className="rounded-xl bg-orange-50/60 px-4 py-3 text-sm">
                <div className="font-medium text-stone-700">{ui.dogName}</div>
                <div className="mt-1 text-stone-900">
                  {[formValues.petName, formValues.hasSecondDog ? formValues.secondPetName : ""].filter(Boolean).join(" & ") || "—"}
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-orange-50/60 px-4 py-3 text-sm">
              <div className="font-medium text-stone-700">{ui.date}</div>
              <div className="mt-1 text-stone-900">{today}</div>
            </div>
            <SignaturePad
              clearLabel={ui.clearSignature}
              disabled={!formValues.agreed}
              disabledMessage={ui.signatureLocked}
              onChange={(value) => {
                setFormValues((current) => ({ ...current, signature: value }));
                setErrors((current) => ({ ...current, signature: undefined }));
              }}
            />
            {errors.signature ? (
              <p className="text-sm text-red-500">{errors.signature}</p>
            ) : null}
          </FormSection>

          {submitError ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-orange-600 px-6 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? ui.submitting : ui.submit}
          </button>
        </form>
      </div>
    </main>
  );
}
