import nodemailer from "nodemailer";
import type { FormValues } from "./form-config";
import {
  formFields,
  getOptionLabel,
  prescreenQuestions,
  yesNoOptions,
  type FormField,
} from "./form-config";
import { teamContacts } from "./contacts";
import {
  calculatePrice,
  formatDateTime,
  type PriceBreakdown,
} from "./pricing";

const BRAND_NAME = "Silicon Paws Retreat";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function parseAdminEmails(): string[] {
  const raw = getEnv("ADMIN_EMAIL");
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

export function createMailer() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: getEnv("GMAIL_USER"),
      pass: getEnv("GMAIL_APP_PASSWORD"),
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rowHtml(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px;border:1px solid #eee;font-weight:600;vertical-align:top;width:45%;">${escapeHtml(label)}</td>
    <td style="padding:8px 12px;border:1px solid #eee;">${escapeHtml(value)}</td>
  </tr>`;
}

function formatTable(rows: string[]): string {
  return `<table style="border-collapse:collapse;width:100%;max-width:640px;margin-bottom:20px;">${rows.join("")}</table>`;
}

function formatValue(field: FormField, data: FormValues): string {
  const rawValue = data[field.name];
  if (field.type === "select") {
    return getOptionLabel(field.options, String(rawValue));
  }
  if (field.name === "dropoffDate") {
    return formatDateTime(data.dropoffDate, data.dropoffTime);
  }
  if (field.name === "pickupDate") {
    return formatDateTime(data.pickupDate, data.pickupTime);
  }
  if (field.name === "dropoffTime" || field.name === "pickupTime") {
    return "";
  }
  return String(rawValue);
}

function getQuote(data: FormValues): PriceBreakdown | null {
  return calculatePrice(
    Number(data.petWeightLb),
    data.dropoffDate,
    data.dropoffTime,
    data.pickupDate,
    data.pickupTime
  );
}

function formatPrescreenSection(data: FormValues): string {
  const rows = prescreenQuestions.map((q) =>
    rowHtml(q.label, getOptionLabel(yesNoOptions, String(data[q.name])))
  );
  if (data.prescreenNotes?.trim()) {
    rows.push(rowHtml("Additional notes", data.prescreenNotes.trim()));
  }
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">Pre-Screening</h3>
    ${formatTable(rows)}
  `;
}

function formatFormSection(data: FormValues): string {
  const skipNames = new Set<keyof FormValues>(["dropoffTime", "pickupTime"]);
  const rows = formFields
    .filter((f) => !skipNames.has(f.name))
    .filter((f) => f.name !== "wechatId" || data.backupContact === "wechat")
    .map((field) => rowHtml(field.label, formatValue(field, data)));

  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">Booking &amp; Contact Details</h3>
    ${formatTable(rows)}
  `;
}

function formatPricingSection(quote: PriceBreakdown): string {
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">Price Estimate</h3>
    ${formatTable([
      rowHtml("Weight tier", quote.weightTier),
      rowHtml("Stay duration", `${quote.totalHours} hours`),
      rowHtml("Billable days", String(quote.billableDays)),
      rowHtml("Daily rate", `$${quote.dailyRate}`),
      rowHtml("Estimated total", `$${quote.totalPrice.toFixed(2)}`),
    ])}
  `;
}

function formatContactsSection(): string {
  const items = teamContacts
    .map(
      (c) =>
        `<li style="margin-bottom:8px;"><strong>${escapeHtml(c.name)}</strong><br/>
        Email: <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a><br/>
        Phone: ${escapeHtml(c.phone)}</li>`
    )
    .join("");
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">Contact Us</h3>
    <p>If you have any questions about your submission, please reach out:</p>
    <ul style="padding-left:20px;line-height:1.8;">${items}</ul>
  `;
}

function buildCustomerEmailHtml(data: FormValues, quote: PriceBreakdown): string {
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const submittedAt = new Date().toLocaleString("en-US");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:640px;">
      <h2>[${BRAND_NAME}] Your submission receipt</h2>
      <p>Dear ${escapeHtml(ownerName)},</p>
      <p>Thank you for submitting your pet boarding agreement with ${BRAND_NAME}. Below is a copy of what you submitted. We will review your request and follow up soon.</p>
      <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
      ${formatPricingSection(quote)}
      ${formatPrescreenSection(data)}
      ${formatFormSection(data)}
      ${formatContactsSection()}
      <p style="margin-top:24px;">We look forward to caring for ${escapeHtml(data.petName)}!</p>
      <p>${BRAND_NAME}</p>
    </div>
  `;
}

function buildAdminEmailHtml(data: FormValues, quote: PriceBreakdown): string {
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const submittedAt = new Date().toLocaleString("en-US");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
      <h2>New Agreement Submission</h2>
      <p><strong>Owner:</strong> ${escapeHtml(ownerName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
      <p><strong>Pet:</strong> ${escapeHtml(data.petName)}</p>
      <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
      ${formatPricingSection(quote)}
      ${formatPrescreenSection(data)}
      ${formatFormSection(data)}
      <p>Signature attached as PNG.</p>
    </div>
  `;
}

export async function sendSubmissionEmails(
  data: FormValues,
  signatureBuffer: Buffer
) {
  const quote = getQuote(data);
  if (!quote) {
    throw new Error("Unable to calculate price for email");
  }

  const transporter = createMailer();
  const fromUser = getEnv("GMAIL_USER");
  const adminEmails = parseAdminEmails();
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const fromHeader = `"${BRAND_NAME}" <${fromUser}>`;

  await transporter.sendMail({
    from: fromHeader,
    to: data.email,
    subject: `[${BRAND_NAME}] Your submission receipt — ${data.petName}`,
    html: buildCustomerEmailHtml(data, quote),
  });

  await transporter.sendMail({
    from: fromHeader,
    to: adminEmails,
    subject: `[New Submission] ${ownerName} - ${data.petName} — $${quote.totalPrice.toFixed(2)}`,
    html: buildAdminEmailHtml(data, quote),
    attachments: [
      {
        filename: `signature-${Date.now()}.png`,
        content: signatureBuffer,
        contentType: "image/png",
      },
    ],
  });
}
