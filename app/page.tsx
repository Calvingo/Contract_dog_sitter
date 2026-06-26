"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AgreementPanel } from "@/components/AgreementPanel";
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
    wechatId: string;
  };
  pets: PrefillPet[];
};

export default function HomePage() {
  const router = useRouter();
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

  const loadPrefill = useCallback(async () => {
    try {
      const response = await fetch("/api/me/prefill");
      if (!response.ok) return;

      const data = (await response.json()) as PrefillResponse;
      if (!data.authenticated) return;

      setPrefill(data);
      applyCustomerPrefill(data.customer);
      if (data.pets.length === 1) {
        applyPetPrefill(data.pets[0]);
      }
      setReturningStatus("Saved profile loaded.");
    } catch {
      // Prefill is optional; leave the blank form usable.
    }
  }, [applyCustomerPrefill, applyPetPrefill]);

  useEffect(() => {
    void loadPrefill();
  }, [loadPrefill]);

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

  const handleReturningLoginRequest = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setReturningStatus("Sending secure link...");

    try {
      const response = await fetch("/api/auth/request-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: returningEmail }),
      });

      if (!response.ok) {
        throw new Error("Login request failed");
      }

      setReturningStatus(
        "If we have a saved profile for that email, a secure link has been sent."
      );
    } catch {
      setReturningStatus("Could not send the secure link. Please try again.");
    }
  };

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
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });

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
        <header>
          <h1 className="text-3xl font-bold text-stone-900">{ui.siteTitle}</h1>
          <p className="mt-1 text-stone-600">{ui.siteSubtitle}</p>
        </header>

        <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-orange-100">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">
              Returning customer
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Use your email to load saved owner and pet details.
            </p>
          </div>

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
          ) : (
            <form
              onSubmit={handleReturningLoginRequest}
              className="grid gap-3 sm:grid-cols-[1fr_auto]"
            >
              <input
                type="email"
                value={returningEmail}
                onChange={(event) => setReturningEmail(event.target.value)}
                placeholder="Email address"
                className="w-full rounded-xl border border-orange-100 bg-white px-4 py-3 text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                required
              />
              <button
                type="submit"
                className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800"
              >
                Send link
              </button>
            </form>
          )}

          {returningStatus ? (
            <p className="text-sm text-stone-600">{returningStatus}</p>
          ) : null}
        </section>

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

          <FormSection title={ui.sections.prescreen}>
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
          </FormSection>

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
                  {formValues.petName || "—"}
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
