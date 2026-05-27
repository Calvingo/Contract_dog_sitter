import { teamContacts } from "./contacts";
import { BRAND_NAME, createMailer, getEnv } from "./mailer";
import type { DecisionTokenPayload } from "./token";

export type DecisionAction = "accept" | "reject" | "meet_greet";

function ownerName(payload: DecisionTokenPayload): string {
  return `${payload.firstName} ${payload.lastName}`.trim();
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
  action: DecisionAction
): { subject: string; html: string } {
  const name = ownerName(payload);
  const pet = payload.petName;

  if (action === "accept") {
    return {
      subject: `[${BRAND_NAME}] Your booking request has been accepted — ${pet}`,
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
      subject: `[${BRAND_NAME}] Update on your booking request — ${pet}`,
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

  return {
    subject: `[${BRAND_NAME}] Let's schedule a meet & greet — ${pet}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
        <h2>Meet &amp; Greet</h2>
        <p>Dear ${name},</p>
        <p>Thank you for submitting your request for <strong>${pet}</strong>. We would like to schedule a <strong>meet &amp; greet</strong> before confirming your booking.</p>
        <p>Please contact us to arrange a convenient time:</p>
        ${contactsHtml()}
        <p>We look forward to meeting you and ${pet}!<br/>${BRAND_NAME}</p>
      </div>
    `,
  };
}

export async function sendDecisionEmail(
  payload: DecisionTokenPayload,
  action: DecisionAction
) {
  const transporter = createMailer();
  const fromUser = getEnv("GMAIL_USER");
  const { subject, html } = buildDecisionEmail(payload, action);

  await transporter.sendMail({
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
