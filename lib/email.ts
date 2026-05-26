import nodemailer from "nodemailer";
import type { FormValues } from "./form-config";
import {
  formFields,
  getFieldLabel,
  getOptionLabel,
  type FormField,
} from "./form-config";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
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

function formatFieldRows(data: FormValues): string {
  const rows = formFields.map((field: FormField) => {
    const rawValue = data[field.name];
    const displayValue =
      field.type === "select"
        ? getOptionLabel(field.options, String(rawValue), data.locale)
        : String(rawValue);

    return `<tr>
      <td style="padding:8px 12px;border:1px solid #eee;font-weight:600;">${escapeHtml(getFieldLabel(field, data.locale))}</td>
      <td style="padding:8px 12px;border:1px solid #eee;">${escapeHtml(displayValue)}</td>
    </tr>`;
  });

  return `<table style="border-collapse:collapse;width:100%;max-width:640px;">${rows.join("")}</table>`;
}

function buildCustomerEmailHtml(data: FormValues): string {
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const submittedAt = new Date().toLocaleString(
    data.locale === "zh" ? "zh-CN" : "en-US"
  );

  if (data.locale === "zh") {
    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
        <h2>【XYZ Pet Service】您的寄养协议已提交成功</h2>
        <p>亲爱的 ${escapeHtml(ownerName)}，</p>
        <p>感谢您提交宠物寄养协议。我们已收到您的信息。</p>
        <ul>
          <li><strong>宠物名字：</strong>${escapeHtml(data.petName)}</li>
          <li><strong>提交时间：</strong>${escapeHtml(submittedAt)}</li>
        </ul>
        <p>如有任何问题，请直接联系我们。</p>
        <p>XYZ Pet Service</p>
      </div>
    `;
  }

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
      <h2>[XYZ Pet Service] Your boarding agreement has been submitted</h2>
      <p>Dear ${escapeHtml(ownerName)},</p>
      <p>Thank you for submitting your pet boarding agreement. We have received your information.</p>
      <ul>
        <li><strong>Pet name:</strong> ${escapeHtml(data.petName)}</li>
        <li><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</li>
      </ul>
      <p>If you have any questions, please contact us directly.</p>
      <p>XYZ Pet Service</p>
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
      ${formatFieldRows(data)}
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
  const adminEmail = getEnv("ADMIN_EMAIL");
  const ownerName = `${data.firstName} ${data.lastName}`.trim();

  const customerSubject =
    data.locale === "zh"
      ? "【XYZ Pet Service】您的寄养协议已提交成功"
      : "[XYZ Pet Service] Your boarding agreement has been submitted";

  await transporter.sendMail({
    from: `"XYZ Pet Service" <${fromUser}>`,
    to: data.email,
    subject: customerSubject,
    html: buildCustomerEmailHtml(data),
  });

  await transporter.sendMail({
    from: `"XYZ Pet Service" <${fromUser}>`,
    to: adminEmail,
    subject: `[新提交] ${ownerName} - ${data.petName}`,
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
