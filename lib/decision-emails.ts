import { teamContacts } from "./contacts";
import { BRAND_NAME, getEnv, sendMail } from "./mailer";
import type { DecisionTokenPayload } from "./token";

export type DecisionAction = "accept" | "reject" | "meet_greet";

export type DecisionEmailOptions = {
  meetGreetAt?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function ownerName(payload: DecisionTokenPayload): string {
  return escapeHtml(`${payload.firstName} ${payload.lastName}`.trim());
}

function contactsHtml(): string {
  return teamContacts
    .map(
      (c) =>
        `<p><strong>${c.name}</strong><br/>Email: ${c.email}<br/>Phone: ${c.phone}</p>`
    )
    .join("");
}

function buildDecisionEmail(
  payload: DecisionTokenPayload,
  action: DecisionAction,
  options: DecisionEmailOptions = {}
): { subject: string; html: string } {
  const name = ownerName(payload);
  const pet = escapeHtml(payload.petName);
  const petSubject = payload.petName;

  if (action === "accept") {
    return {
      subject: `[${BRAND_NAME}] Your booking request has been accepted — ${petSubject}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
          <h2>Booking Accepted</h2>
          <p>Dear ${name},</p>
          <p>Great news! Your boarding request for <strong>${pet}</strong> has been <strong>accepted</strong> by ${BRAND_NAME}.</p>
          <p>We will contact you shortly with next steps. If you have any questions in the meantime, please reach out:</p>
          ${contactsHtml()}
          <p>Thank you,<br/>${BRAND_NAME}</p>
        </div>
      `,
    };
  }

  if (action === "reject") {
    return {
      subject: `[${BRAND_NAME}] Update on your booking request — ${petSubject}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
          <h2>Booking Update</h2>
          <p>Dear ${name},</p>
          <p>Thank you for your interest in ${BRAND_NAME}. After reviewing your submission for <strong>${pet}</strong>, we are unable to accept this booking at this time.</p>
          <p>If you have questions or would like to discuss alternatives, please contact us:</p>
          ${contactsHtml()}
          <p>Thank you for your understanding,<br/>${BRAND_NAME}</p>
        </div>
      `,
    };
  }

  const scheduleLine = options.meetGreetAt
    ? `<p><strong>Suggested time:</strong> ${escapeHtml(options.meetGreetAt)}</p>`
    : "";

  return {
    subject: `[${BRAND_NAME}] Let's schedule a meet & greet — ${petSubject}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
        <h2>Meet &amp; Greet</h2>
        <p>Dear ${name},</p>
        <p>Thank you for submitting your request for <strong>${pet}</strong>. We would like to schedule a <strong>meet &amp; greet</strong> before confirming your booking.</p>
        ${scheduleLine}
        <p>Please contact us if this time does not work for you:</p>
        ${contactsHtml()}
        <p>We look forward to meeting you and ${pet}!<br/>${BRAND_NAME}</p>
      </div>
    `,
  };
}

export async function sendDecisionEmail(
  payload: DecisionTokenPayload,
  action: DecisionAction,
  options: DecisionEmailOptions = {}
) {
  const fromUser = getEnv("GMAIL_USER");
  const { subject, html } = buildDecisionEmail(payload, action, options);

  await sendMail({
    from: `"${BRAND_NAME}" <${fromUser}>`,
    to: payload.email,
    subject,
    html,
  });
}

export function decisionActionLabel(action: DecisionAction): string {
  switch (action) {
    case "accept":
      return "Accepted";
    case "reject":
      return "Declined";
    case "meet_greet":
      return "Meet & Greet requested";
  }
}
