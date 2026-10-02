"use client";
import { useEffect, useState } from "react";
import {
  DEFAULT_MARKETING_IMAGE,
  returningGuestTemplate,
} from "@/lib/marketing/templates";
import { todayKey } from "@/lib/platform/rules";
export function CampaignFields({
  campaign,
}: {
  campaign?: {
    name: string;
    subject: string;
    body: string;
    imagePath?: string | null;
    scheduledAt: Date;
  };
}) {
  const [fields, setFields] = useState({
    name: campaign?.name ?? returningGuestTemplate.name,
    subject: campaign?.subject ?? returningGuestTemplate.subject,
    body: campaign?.body ?? returningGuestTemplate.body,
    sendDate: campaign?.scheduledAt.toISOString().slice(0, 10) || todayKey(),
  });
  const [imagePath, setImagePath] = useState(
    campaign ? campaign.imagePath || "" : DEFAULT_MARKETING_IMAGE,
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [imageError, setImageError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const change = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  return (
    <>
      <p className="notice">
        To: all saved customer emails. Unsubscribed and blocked addresses are
        excluded automatically.
      </p>
      <label>
        Campaign name
        <input
          name="name"
          maxLength={120}
          value={fields.name}
          onChange={(e) => change("name", e.target.value)}
          required
        />
      </label>
      <label>
        Subject
        <input
          name="subject"
          maxLength={150}
          value={fields.subject}
          onChange={(e) => change("subject", e.target.value)}
          required
        />
      </label>
      <label>
        Email message
        <textarea
          name="body"
          rows={18}
          minLength={10}
          maxLength={10000}
          value={fields.body}
          onChange={(e) => change("body", e.target.value)}
          required
        />
      </label>
      <p className="small">
        Use {"{{firstName}}"} and {"{{petName}}"} for each customer.{" "}
        {"{{bookingLink}}"} adds the reservation link, {"{{image}}"} places your
        photo, and **text** adds bold text. Please update seasonal availability
        before sending.
      </p>
      <input name="imagePath" type="hidden" value={imagePath} />
      <label>
        Upload / replace email image
        <input
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const selected = e.target.files?.[0] || null;
            if (
              selected &&
              (selected.size > 2 * 1024 * 1024 ||
                !["image/png", "image/jpeg", "image/webp"].includes(
                  selected.type,
                ))
            ) {
              setImageError(
                "Choose a PNG, JPEG or WebP image smaller than 2 MB.",
              );
              e.target.value = "";
              setFile(null);
              return;
            }
            setImageError("");
            setFile(selected);
          }}
        />
      </label>
      <p className="small">
        PNG, JPEG or WebP, up to 2 MB. The image is saved with your draft and
        included in the email.
      </p>
      {imageError && (
        <p role="alert" className="notice error">
          {imageError}
        </p>
      )}
      {(preview || imagePath) && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview || imagePath}
            alt="Campaign image preview"
            style={{ maxWidth: 480, width: "100%", height: "auto" }}
          />
          <button
            className="button secondary"
            type="button"
            onClick={(e) => {
              const input = e.currentTarget.form?.elements.namedItem(
                "image",
              ) as HTMLInputElement | null;
              if (input) input.value = "";
              setFile(null);
              setImagePath("");
            }}
          >
            Remove image
          </button>
        </>
      )}
      <label>
        Send on
        <input
          name="sendDate"
          type="date"
          required
          value={fields.sendDate}
          onChange={(e) => change("sendDate", e.target.value)}
        />
      </label>
      <p className="small">
        After saving, review your email and choose Send now or schedule it for
        this date.
      </p>
    </>
  );
}
