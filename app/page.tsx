"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AgreementPanel } from "@/components/AgreementPanel";
import { FormFieldInput } from "@/components/FormFieldInput";
import { FormSection } from "@/components/FormSection";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SignaturePad } from "@/components/SignaturePad";
import {
  formFields,
  initialFormValues,
  type FormValues,
  type Locale,
} from "@/lib/form-config";
import { getUiCopy } from "@/lib/i18n";

export default function HomePage() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>(
    {}
  );
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasReadAgreement, setHasReadAgreement] = useState(false);

  const ui = useMemo(() => getUiCopy(locale), [locale]);
  const today = useMemo(
    () =>
      new Date().toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [locale]
  );

  const ownerName = `${formValues.firstName} ${formValues.lastName}`.trim();
  const needsWechatId = formValues.backupContact === "wechat";

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

    if (needsWechatId && !formValues.wechatId.trim()) {
      nextErrors.wechatId = ui.wechatIdRequired;
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
        body: JSON.stringify({ ...formValues, locale }),
      });

      if (!response.ok) {
        throw new Error("Submit failed");
      }

      router.push(`/success?lang=${locale}`);
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
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-stone-900">{ui.siteTitle}</h1>
            <p className="mt-1 text-stone-600">{ui.siteSubtitle}</p>
          </div>
          <LanguageToggle locale={locale} onChange={setLocale} />
        </header>

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
                locale={locale}
                value={String(formValues[field.name] ?? "")}
                error={errors[field.name]}
                selectPlaceholder={ui.selectPlaceholder}
                onChange={handleFieldChange}
              />
            ))}
          </FormSection>

          <FormSection title={ui.sections.owner}>
            {ownerFields.map((field) => (
              <FormFieldInput
                key={field.name}
                field={field}
                locale={locale}
                value={String(formValues[field.name] ?? "")}
                error={errors[field.name]}
                selectPlaceholder={ui.selectPlaceholder}
                onChange={handleFieldChange}
              />
            ))}
            {needsWechatId && wechatField ? (
              <FormFieldInput
                field={{ ...wechatField, required: true }}
                locale={locale}
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
                locale={locale}
                value={String(formValues[field.name] ?? "")}
                error={errors[field.name]}
                selectPlaceholder={ui.selectPlaceholder}
                onChange={handleFieldChange}
              />
            ))}
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
                <div className="mt-1 text-stone-900">
                  {ownerName || "—"}
                </div>
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
