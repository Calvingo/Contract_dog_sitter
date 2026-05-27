import nodemailer from "nodemailer";
import type { FormValues } from "./form-config";
import {
  formFields,
  getOptionLabel,
  prescreenQuestions,
  yesNoOptions,
  type FormField,
} from "./form-config";

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
    <td style="padding:8px 12px;border:1px solid #eee;font-weight:600;">${escapeHtml(label)}</td>
    <td style="padding:8px 12px;border:1px solid #eee;">${escapeHtml(value)}</td>
  </tr>`;
}

function formatValue(field: FormField, data: FormValues): string {
  const rawValue = data[field.name];
  if (field.type === "select") {
    return getOptionLabel(field.options, String(rawValue));
  }
  return String(rawValue);
}

function formatAllRows(data: FormValues): string {
  const prescreenRows = prescreenQuestions.map((q) =>
    rowHtml(q.label, getOptionLabel(yesNoOptions, String(data[q.name])))
  );

  const formRows = formFields
    .filter((f) => f.name !== "wechatId" || data.backupContact === "wechat")
    .map((field) => rowHtml(field.label, formatValue(field, data)));

  return `<table style="border-collapse:collapse;width:100%;max-width:640px;">${[...prescreenRows, ...formRows].join("")}</table>`;
}

function buildCustomerEmailHtml(data: FormValues): string {
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const submittedAt = new Date().toLocaleString("en-US");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
      <h2>[${BRAND_NAME}] Your boarding agreement has been submitted</h2>
      <p>Dear ${escapeHtml(ownerName)},</p>
      <p>Thank you for submitting your pet boarding agreement. We have received your information.</p>
      <ul>
        <li><strong>Pet name:</strong> ${escapeHtml(data.petName)}</li>
        <li><strong>Drop-off:</strong> ${escapeHtml(data.dropoffDate)}</li>
        <li><strong>Pick-up:</strong> ${escapeHtml(data.pickupDate)}</li>
        <li><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</li>
      </ul>
      <p>If you have any questions, please contact us directly.</p>
      <p>${BRAND_NAME}</p>
    </div>
  `;
}

function buildAdminEmailHtml(data: FormValues): string {
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const submittedAt = new Date().toLocaleString("en-US");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
      <h2>New Agreement Submission</h2>
      <p><strong>Owner:</strong> ${escapeHtml(ownerName)}</p>
      <p><strong>Pet:</strong> ${escapeHtml(data.petName)}</p>
      <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
      ${formatAllRows(data)}
      <p>Signature attached as PNG.</p>
    </div>
  `;
}

export async function sendSubmissionEmails(
  data: FormValues,
  signatureBuffer: Buffer
) {
  const transporter = createMailer();
  const fromUser = getEnv("GMAIL_USER");
  const adminEmails = parseAdminEmails();
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const fromHeader = `"${BRAND_NAME}" <${fromUser}>`;

  await transporter.sendMail({
    from: fromHeader,
    to: data.email,
    subject: `[${BRAND_NAME}] Your boarding agreement has been submitted`,
    html: buildCustomerEmailHtml(data),
  });

  await transporter.sendMail({
    from: fromHeader,
    to: adminEmails,
    subject: `[New Submission] ${ownerName} - ${data.petName}`,
    html: buildAdminEmailHtml(data),
    attachments: [
      {
        filename: `signature-${Date.now()}.png`,
        content: signatureBuffer,
        contentType: "image/png",
      },
    ],
  });
}
