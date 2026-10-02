"use client";

import Link from "next/link";
import { SavedPrescreen } from "@/components/SavedPrescreen";
import {
  customerPrefillValues,
  hasSavedPrescreen,
  petPrefillValues,
  prescreenPrefillValues,
  selectPrefillPets,
  type PrefillPet,
  type PrefillPetSelection,
  type PrefillResponse,
} from "@/lib/booking-prefill";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { PublicNav } from "@/components/PlatformShell";
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
import { applySavedProfileIds, profileReadyToSave, profileSavePayload } from "@/lib/profile-autosave";
import {
  formFields,
  initialFormValues,
  prescreenQuestions,
  secondPetFields,
  secondPrescreenQuestions,
  type FormValues,
} from "@/lib/form-config";
import { ui } from "@/lib/i18n";

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
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormValues, string>>
  >({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = useState("");
  const [profileSaveError, setProfileSaveError] = useState("");
  const [hasReadAgreement, setHasReadAgreement] = useState(false);
  const [returningStatus, setReturningStatus] = useState("");
  const [prefill, setPrefill] = useState<PrefillResponse | null>(null);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [selectedSecondPetId, setSelectedSecondPetId] = useState("");
  const currentPrefill = useRef<PrefillResponse | null>(null);
  const chosenPets = useRef<PrefillPetSelection>({});
  const [editNotice, setEditNotice] = useState("");
  const lookupGeneration = useRef(0);
  const loadedEmail = useRef("");
  const latestValues = useRef(formValues);
  latestValues.current = formValues;
  const profileDirty = useRef(false);
  const profileChangeVersion = useRef(0);
  const profileSaveInFlight = useRef<Promise<void> | null>(null);
  const lastSavedProfile = useRef("");
  const [profileRetry, setProfileRetry] = useState(0);
  const profileRetryCount = useRef(0);
  const profileRetryBlocked = useRef(false);

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const ownerName = `${formValues.firstName} ${formValues.lastName}`.trim();
  const needsWechatId = formValues.backupContact === "wechat";

  const applyPrescreenPrefill = useCallback(
    (pet: PrefillPet, isSecondDog: boolean) => {
      setFormValues((current) => ({
        ...current,
        ...prescreenPrefillValues(pet, isSecondDog),
      }));
      setErrors((current) => {
        const next: Partial<Record<keyof FormValues, string>> = { ...current };
        const keysToClear: Array<keyof FormValues> = isSecondDog
          ? [
              ...secondPrescreenQuestions.map(
                (question) => question.name as keyof FormValues,
              ),
              "secondPrescreenNotes" as keyof FormValues,
            ]
          : [
              ...prescreenQuestions.map(
                (question) => question.name as keyof FormValues,
              ),
              "prescreenNotes" as keyof FormValues,
            ];
        for (const key of keysToClear) {
          delete next[key];
        }
        return next;
      });
    },
    [],
  );

  const applyCustomerPrefill = useCallback(
    (customer: PrefillResponse["customer"]) => {
      setFormValues((current) => ({
        ...current,
        ...customerPrefillValues(customer),
      }));
      setHasReadAgreement(false);
    },
    [],
  );

  const applyPetPrefill = useCallback(
    (pet: PrefillPet) => {
      chosenPets.current.first = pet.id;
      setSelectedPetId(pet.id);
      setFormValues((current) => ({
        ...current,
        ...petPrefillValues(pet),
      }));
      applyPrescreenPrefill(pet, false);
    },
    [applyPrescreenPrefill],
  );

  const applySecondPetPrefill = useCallback(
    (pet: PrefillPet) => {
      chosenPets.current.second = pet.id;
      setSelectedSecondPetId(pet.id);
      setFormValues((current) => ({
        ...current,
        ...petPrefillValues(pet, true),
      }));
      applyPrescreenPrefill(pet, true);
    },
    [applyPrescreenPrefill],
  );

  const applyPrefill = useCallback(
    (data: PrefillResponse) => {
      const email = data.customer.email.trim().toLowerCase();
      // A slower public lookup must never clear answers loaded by a verified session.
      if (
        !data.authenticated &&
        currentPrefill.current?.authenticated &&
        loadedEmail.current === email
      )
        return;
      loadedEmail.current = email;
      currentPrefill.current = data;
      setPrefill(data);
      applyCustomerPrefill(data.customer);
      const { first, second } = selectPrefillPets(data, chosenPets.current);
      if (first) applyPetPrefill(first);
      if (second) applySecondPetPrefill(second);
      setReturningStatus(
        data.authenticated
          ? "Email verified. Saved details and available pre-screening answers loaded."
          : "Saved contact and dog details loaded. Verify your email to reuse your pre-screening answers.",
      );
    },
    [applyCustomerPrefill, applyPetPrefill, applySecondPetPrefill],
  );

  const loadPrefill = useCallback(async () => {
    const generation = lookupGeneration.current;
    try {
      const response = await fetch("/api/me/prefill", { cache: "no-store" });
      if (!response.ok) return;

      const data = (await response.json()) as PrefillResponse;
      if (!data.authenticated || generation !== lookupGeneration.current)
        return;

      const email = data.customer.email.trim().toLowerCase();
      if (loadedEmail.current && loadedEmail.current !== email) return;
      // Returning from email verification in another tab should restore saved answers,
      // but focusing an already verified form must preserve the user's edits.
      if (
        currentPrefill.current?.authenticated &&
        loadedEmail.current === email
      )
        return;
      applyPrefill(data);
    } catch {
      // Prefill is optional; leave the blank form usable.
    }
  }, [applyPrefill]);

  useEffect(() => {
    if (editToken) return;
    void loadPrefill();
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadPrefill();
    };
    window.addEventListener("focus", loadPrefill);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", loadPrefill);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [editToken, loadPrefill]);

  const lookupEmail = formValues.email.trim().toLowerCase();
  useEffect(() => {
    if (
      editToken ||
      loadedEmail.current === lookupEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lookupEmail)
    )
      return;
    const controller = new AbortController();
    const generation = lookupGeneration.current;
    const timer = window.setTimeout(async () => {
      setReturningStatus("Looking for your saved details…");
      try {
        const response = await fetch("/api/me/prefill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: lookupEmail }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (
          controller.signal.aborted ||
          generation !== lookupGeneration.current
        )
          return;
        if (!response.ok)
          throw new Error(
            data.error ||
              "Lookup unavailable. You can still fill in your details below.",
          );
        if (data.found) applyPrefill(data);
        else
          setReturningStatus(
            "No saved profile found. Fill in your details below to make your first booking.",
          );
      } catch (error) {
        if (!controller.signal.aborted)
          setReturningStatus(
            error instanceof Error
              ? error.message
              : "Lookup unavailable. Please fill in your details below.",
          );
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lookupEmail, editToken, applyPrefill]);

  useEffect(() => {
    if (!editToken) return;

    const loadEditSubmission = async () => {
      try {
        const response = await fetch(
          `/api/submission/edit?token=${encodeURIComponent(editToken)}`,
        );
        const data = (await response.json()) as {
          values?: FormValues;
          notice?: string;
          error?: string;
        };

        if (!response.ok || !data.values) {
          setSubmitError(
            data.error || "This edit link is no longer available.",
          );
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
    if (!["email", "dropoffDate", "pickupDate", "dropoffTime", "pickupTime", "honeypot", "firstTimeBooking"].includes(name)) {
      profileDirty.current = true;
      profileChangeVersion.current++;
      profileRetryCount.current = 0;
      profileRetryBlocked.current = false;
      setProfileSaveMessage("");
      setProfileSaveError("");
    }
    if (name === "email") {
      profileDirty.current = false;
      lastSavedProfile.current = "";
      setProfileSaveMessage("");
      setProfileSaveError("");
      lookupGeneration.current++;
      loadedEmail.current = "";
      currentPrefill.current = null;
      chosenPets.current = {};
      setSelectedSecondPetId("");
      setPrefill(null);
      setSelectedPetId("");
      setReturningStatus("");
      setFormValues((current) => ({
        ...initialFormValues,
        email: value,
        dropoffDate: current.dropoffDate,
        pickupDate: current.pickupDate,
        dropoffTime: current.dropoffTime,
        pickupTime: current.pickupTime,
      }));
      setHasReadAgreement(false);
      setErrors({});
      return;
    }
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

  const startNewDog = (second = false) => {
    const emptyDog = { id: "", name: "", breed: "", weightLb: 0 };
    chosenPets.current[second ? "second" : "first"] = "";
    if (second) setSelectedSecondPetId("");
    else setSelectedPetId("");
    setFormValues((current) => ({
      ...current,
      ...petPrefillValues(emptyDog, second),
      [second ? "secondPetWeightLb" : "petWeightLb"]: "",
    }));
    setProfileSaveMessage("");
    setProfileSaveError("");
  };

  const saveProfileDetails = useCallback(() => {
    if (profileSaveInFlight.current) return profileSaveInFlight.current;
    const sent = latestValues.current;
    if (!currentPrefill.current?.authenticated || !profileDirty.current || !profileReadyToSave(sent))
      return Promise.resolve();
    const payload = profileSavePayload(sent);
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedProfile.current) {
      profileDirty.current = false;
      return Promise.resolve();
    }
    const generation = lookupGeneration.current;
    const version = profileChangeVersion.current;
    setIsSavingProfile(true);
    setProfileSaveMessage("");
    setProfileSaveError("");
    const work = async () => {
      try {
        const response = await fetch("/api/me/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: serialized,
        });
        const data = await response.json();
        if (!response.ok) {
          profileRetryBlocked.current = response.status >= 400 && response.status < 500;
          throw new Error(data.error || "Unable to save your details.");
        }
        if (generation !== lookupGeneration.current) return;
        const saved = data as PrefillResponse;
        const next = applySavedProfileIds(latestValues.current, sent, saved);
        latestValues.current = next;
        setFormValues(next);
        currentPrefill.current = saved;
        setPrefill(saved);
        chosenPets.current = { first: next.savedPetId || "", second: next.savedSecondPetId || "" };
        setSelectedPetId(next.savedPetId || "");
        setSelectedSecondPetId(next.savedSecondPetId || "");
        lastSavedProfile.current = JSON.stringify(profileSavePayload(applySavedProfileIds(sent, sent, saved)));
        profileDirty.current = version !== profileChangeVersion.current;
        profileRetryCount.current = 0;
        if (!profileDirty.current) setProfileSaveMessage("Changes saved automatically.");
      } catch (error) {
        if (generation === lookupGeneration.current) {
          profileRetryCount.current++;
          setProfileSaveError(profileRetryBlocked.current
            ? `Changes not saved: ${error instanceof Error ? error.message : "Please check your details."}`
            : "Changes not saved yet. We’ll retry automatically. You can keep filling in your booking.");
        }
      } finally {
        profileSaveInFlight.current = null;
        setIsSavingProfile(false);
      }
    };
    profileSaveInFlight.current = work();
    return profileSaveInFlight.current;
  }, []);

  const profileSnapshot = JSON.stringify(profileSavePayload(formValues));
  useEffect(() => {
    if (editToken || !prefill?.authenticated || isSubmitting || isSavingProfile || !profileDirty.current || profileRetryBlocked.current)
      return;
    if (!profileReadyToSave(latestValues.current)) {
      setProfileSaveMessage("Complete the required contact and dog details to save automatically.");
      return;
    }
    // One request at a time; changes typed during a save are sent afterwards.
    // Back off on failure rather than sending a request on every keystroke.
    const wait = profileRetryCount.current ? Math.min(30000, 3000 * 2 ** Math.min(profileRetryCount.current - 1, 4)) : 900;
    const timer = window.setTimeout(() => { void saveProfileDetails(); }, wait);
    return () => window.clearTimeout(timer);
  }, [profileSnapshot, editToken, prefill?.authenticated, isSubmitting, isSavingProfile, profileRetry, saveProfileDetails]);

  useEffect(() => {
    const onOnline = () => {
      profileRetryCount.current = 0;
      setProfileRetry(value => value + 1);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

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
    if (formValues.petAgeYears && (!Number.isFinite(age) || age < 0)) {
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
      if (
        formValues.secondPetWeightLb &&
        (!Number.isFinite(secondWeight) || secondWeight <= 0)
      )
        nextErrors.secondPetWeightLb = ui.invalidWeight;
      if (
        formValues.secondPetAgeYears &&
        (!Number.isFinite(secondAge) || secondAge < 0)
      )
        nextErrors.secondPetAgeYears = ui.invalidAge;
      if (
        formValues.petName.trim().toLowerCase() ===
        formValues.secondPetName.trim().toLowerCase()
      )
        nextErrors.secondPetName =
          "Please enter a different name for the second dog.";
    }

    const dropoff = parseDateTime(
      formValues.dropoffDate,
      formValues.dropoffTime,
    );
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
      await profileSaveInFlight.current;
      const submissionValues = latestValues.current;
      const response = await fetch(
        editToken ? "/api/submission/edit" : "/api/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editToken ? { token: editToken, values: submissionValues } : submissionValues,
          ),
        },
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Submit failed");
      const notificationQuery = result.emailWarning ? "?emailWarning=1" : "?emailPending=1";
      router.push(
        editToken || !result.accountAccess
          ? `/success${notificationQuery}`
          : `/account/bookings/${result.submissionId}${notificationQuery}`,
      );
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : ui.submitError);
      // Keep Submit disabled after success while the destination loads.
      setIsSubmitting(false);
    }
  };

  const ownerFields = formFields.filter(
    (field) =>
      field.section === "owner" && !["wechatId", "email"].includes(field.name),
  );
  const petFields = formFields.filter(
    (field) =>
      field.section === "pet" &&
      !["dropoffDate", "pickupDate", "dropoffTime", "pickupTime"].includes(
        field.name,
      ),
  );
  const wechatField = formFields.find((field) => field.name === "wechatId");

  const selectedPet = prefill?.pets.find((pet) => pet.id === selectedPetId);
  const selectedSecondPet = prefill?.pets.find(
    (pet) => pet.id === selectedSecondPetId,
  );

  const canSubmit =
    !isSubmitting &&
    hasReadAgreement &&
    formValues.agreed &&
    !!formValues.signature;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PublicNav />
        <div>
          <p className="eyebrow">BOOK A STAY</p>
          <h1 className="text-3xl font-bold">A happy stay starts here.</h1>
          <p className="mt-2 text-stone-600">
            Choose dates, tell us about your dog, and send your request for
            review.
          </p>
        </div>

        <AvailabilityCalendar
          dogs={formValues.hasSecondDog ? 2 : 1}
          start={formValues.dropoffDate}
          end={formValues.pickupDate}
          editToken={editToken}
          dropoffTime={formValues.dropoffTime}
          pickupTime={formValues.pickupTime}
          onTimeChange={handleFieldChange}
          errors={errors}
          onSelect={(dropoffDate, pickupDate) => {
            setErrors((current) => ({
              ...current,
              dropoffDate: undefined,
              pickupDate: undefined,
            }));
            setFormValues((current) => ({
              ...current,
              dropoffDate,
              pickupDate,
            }));
          }}
        />
        <BoardingChecklist />

        <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-orange-100">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">
              Find your details
            </h2>
            <p className="mt-2 text-base font-bold leading-relaxed text-stone-800 sm:text-lg">
              Enter your email to automatically find your saved contact and dog
              details. After verifying your email, your saved pre-screening
              answers and notes are filled in too.
            </p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Email address *</span>
            <input
              type="email"
              name="bookingEmail"
              value={formValues.email}
              onChange={(event) =>
                handleFieldChange("email", event.target.value)
              }
              readOnly={Boolean(editToken)}
              disabled={isSavingProfile || isSubmitting}
              autoComplete="email"
              maxLength={254}
              className="w-full rounded-xl border border-stone-200 px-4 py-3"
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && (
              <span role="alert" className="text-sm text-red-600">
                {errors.email}
              </span>
            )}
          </label>

          {prefill ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-orange-700">
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
                        disabled={selectedSecondPetId === pet.id || isSavingProfile || isSubmitting}
                        onClick={async () => { await saveProfileDetails(); applyPetPrefill(pet); }}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          selectedPetId === pet.id
                            ? "border-orange-500 bg-orange-600 text-white"
                            : "border-orange-200 bg-white text-stone-700 hover:bg-orange-50"
                        }`}
                      >
                        {pet.name}
                      </button>
                    ))}
                    <button type="button" onClick={async () => { await saveProfileDetails(); startNewDog(); }} disabled={isSavingProfile || isSubmitting}
                      className="rounded-xl border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-700 disabled:opacity-50">
                      Use a new dog
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {prefill && !prefill.authenticated && !editToken && (
            <Link
              className="text-link"
              href={`/login?next=/book&email=${encodeURIComponent(formValues.email)}`}
            >
              Verify email & load saved pre-screening →
            </Link>
          )}

          {returningStatus ? (
            <p className="text-sm text-stone-600">{returningStatus}</p>
          ) : null}
          {!editToken && prefill?.authenticated && (
            <p role="status" aria-live="polite" className={`text-sm ${profileSaveError ? "text-red-700" : "text-stone-600"}`}>
              {isSavingProfile ? "Saving changes…" : profileSaveError || profileSaveMessage || "Changes to your contact and dog details save automatically."}
            </p>
          )}
        </section>

        {editNotice ? (
          <section className="rounded-2xl bg-amber-50 p-5 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
            {editNotice}
          </section>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset disabled={isSubmitting} className="min-w-0 space-y-6">
          <input
            type="text"
            name="honeypot"
            value={formValues.honeypot}
            onChange={(event) =>
              handleFieldChange("honeypot", event.target.value)
            }
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
          />

          <FormSection title={`Dog 1 — ${ui.sections.prescreen}`}>
            <SavedPrescreen
              key={`${selectedPetId}:${selectedPet?.lastSubmittedAt || ""}`}
              saved={Boolean(
                prefill?.authenticated && hasSavedPrescreen(selectedPet),
              )}
              dogName={formValues.petName}
              hasErrors={prescreenQuestions.some((question) =>
                Boolean(errors[question.name]),
              )}
            >
              <p className="text-sm text-stone-600">
                {ui.sections.prescreenIntro}
              </p>
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
            </SavedPrescreen>
          </FormSection>

          <FormSection title={ui.sections.owner}>
            {ownerFields.map((field) => (
              <FormFieldInput
                key={field.name}
                field={field}
                value={String(formValues[field.name] ?? "")}
                error={errors[field.name]}
                readOnly={field.name === "email"}
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
                readOnly={field.name === "email"}
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
                onClick={async () => { await saveProfileDetails(); startNewDog(true); }}
                disabled={isSavingProfile}
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
                  <p className="mb-2 text-sm font-medium text-stone-700">
                    Choose a saved dog
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {prefill.pets.map((pet) => (
                      <button
                        key={pet.id}
                        type="button"
                        disabled={selectedPetId === pet.id || isSavingProfile}
                        onClick={async () => { await saveProfileDetails(); applySecondPetPrefill(pet); }}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                          selectedSecondPetId === pet.id
                            ? "border-orange-500 bg-orange-600 text-white"
                            : "border-orange-200 bg-white text-stone-700 hover:bg-orange-50"
                        }`}
                      >
                        {pet.name}
                      </button>
                    ))}
                    <button type="button" onClick={async () => { await saveProfileDetails(); startNewDog(true); }} disabled={isSavingProfile}
                      className="rounded-xl border border-orange-200 px-3 py-2 text-sm font-semibold text-orange-700">
                      Use a new dog
                    </button>
                  </div>
                </div>
              ) : null}
              {secondPetFields.map((field) => (
                <FormFieldInput
                  key={field.name}
                  field={field}
                  value={String(formValues[field.name] ?? "")}
                  error={errors[field.name]}
                  selectPlaceholder={ui.selectPlaceholder}
                  onChange={handleFieldChange}
                />
              ))}
              <SavedPrescreen
                key={`${selectedSecondPetId}:${selectedSecondPet?.lastSubmittedAt || ""}`}
                saved={Boolean(
                  prefill?.authenticated &&
                  hasSavedPrescreen(selectedSecondPet),
                )}
                dogName={formValues.secondPetName}
                hasErrors={secondPrescreenQuestions.some((question) =>
                  Boolean(errors[question.name]),
                )}
              >
                <p className="text-sm text-stone-600">
                  Please answer these questions for the second dog.
                </p>
                {secondPrescreenQuestions.map((question) => (
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
                  value={formValues.secondPrescreenNotes}
                  label="Additional notes for Dog 2"
                  placeholder={ui.prescreenNotesPlaceholder}
                  onChange={handleFieldChange}
                  name="secondPrescreenNotes"
                />
              </SavedPrescreen>
              <button
                type="button"
                disabled={isSavingProfile}
                onClick={async () => {
                  await saveProfileDetails();
                  chosenPets.current.second = "";
                  setSelectedSecondPetId("");
                  setFormValues((current) => ({
                    ...current,
                    hasSecondDog: false,
                    savedSecondPetId: "",
                  }));
                }}
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
                  {[
                    formValues.petName,
                    formValues.hasSecondDog ? formValues.secondPetName : "",
                  ]
                    .filter(Boolean)
                    .join(" & ") || "—"}
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
          </fieldset>
        </form>
      </div>
    </main>
  );
}
