import { createCustomerEmailUrl } from "./auth/customer-email-link";
import { getSettings } from "./platform/capacity";
import { DEPOSIT_PERCENT } from "./pricing";
import { teamContacts } from "./contacts";
import { BRAND_NAME, getEnv, sendMail } from "./mailer";
import type { DecisionTokenPayload } from "./token";

export type DecisionAction = "accept" | "reject" | "meet_greet";

export type DecisionEmailOptions = {
  meetGreetAt?: string;
  editUrl?: string;
  accountUrl?: string;
  zelleName?: string;
  zelleRecipient?: string;
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
        `<p><strong>${c.name}</strong><br/>Email: ${c.email}<br/>Phone: <a href="tel:${c.phone}">${c.phone}</a>${c.wechat ? `<br/>WeChat: ${c.wechat}` : ""}</p>`,
    )
    .join("");
}

function meetGreetInfoHtml(): string {
  return `<h3>Meet &amp; greet at our home</h3>
    <p>We’d be happy to do a meet &amp; greet at our home. <strong>We meet in our ground front yard.</strong></p>
    <p>The main purpose is for us to meet you and your dog, see how your dog responds to new people and a new environment, and introduce your dog to our dogs to make sure everyone is comfortable with each other. Since the front yard is also a new environment for your dog, it gives us a good opportunity to observe their initial behavior and interactions.</p>
    <p>For privacy, safety, and to avoid disturbing the dogs currently staying with us, we don’t offer tours of the indoor or backyard boarding areas during meet &amp; greets. We’re happy to share photos and videos of the boarding environment so you can see where the dogs spend their time.</p>
    <p>If that works for you, we’d be happy to set up a time!</p>`;
}

export function buildDecisionEmail(
  payload: DecisionTokenPayload,
  action: DecisionAction,
  options: DecisionEmailOptions = {},
): { subject: string; html: string } {
  const name = ownerName(payload);
  const pet = escapeHtml(payload.petName);
  const petSubject = payload.petName;

  if (action === "accept") {
    const editBlock = options.editUrl
      ? `<p style="margin-top:20px;"><strong>Need to make changes?</strong><br/>
          You can edit your request here. Changes will need to be reviewed again:<br/>
          <a href="${escapeHtml(options.editUrl)}" style="color:#ea580c;">Edit your submission</a></p>`
      : "";
    return {
      subject: `[${BRAND_NAME}] Your booking request has been accepted — ${petSubject} — Payments Requirements`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
          <h2>Booking Accepted — Payments Requirements</h2>
          <p>Dear ${name},</p>
          <p>Great news! Your boarding request for <strong>${pet}</strong> has been <strong>accepted</strong> by ${BRAND_NAME}.</p>
          <div style="border:2px solid #b91c1c;background:#fff1f2;padding:20px;margin:24px 0;">
            <p style="font-size:26px;font-weight:800;color:#b91c1c;margin:0 0 12px;">Payment required — please pay your ${DEPOSIT_PERCENT}% deposit</p>
            <p style="font-size:18px;color:#b91c1c;font-weight:700;">Your booking is not yet confirmed. It is confirmed only after we verify the required deposit.</p>
            ${
              options.zelleName && options.zelleRecipient
                ? `<p><strong>Pay with Zelle</strong><br/>Recipient name: ${escapeHtml(options.zelleName)}<br/>Email / phone: <strong>${escapeHtml(options.zelleRecipient)}</strong></p><p>Please include only your dog’s name in the transfer note: <strong>${pet}</strong>.</p>`
                : `<p>Please contact Qi (Christine) Zhang using the details below for Zelle payment information.</p>`
            }
          </div>
          <p><a href="${escapeHtml(options.accountUrl!)}">View your booking and payment instructions</a> to see your hold deadline. Your booking is confirmed once the required deposit is verified. If you have already paid, check your payment status in your account.</p>
          <p style="color:#dc2626;font-weight:700;"><strong>Deposit Cancellation Policy: The deposit is refundable only if the booking is canceled more than 7 days before the scheduled start date. Cancellations within 7 days of the booking are non-refundable.</strong></p>
          ${editBlock}
          ${meetGreetInfoHtml()}
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
  const editBlock = options.editUrl
    ? `<p style="margin-top:20px;"><strong>Need to make changes?</strong><br/>
        You can edit your request here. Changes will need to be reviewed again:<br/>
        <a href="${escapeHtml(options.editUrl)}" style="color:#ea580c;">Edit your submission</a></p>`
    : "";

  return {
    subject: `[${BRAND_NAME}] Let's schedule a meet & greet — ${petSubject}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
        <h2>Meet &amp; Greet</h2>
        <p>Dear ${name},</p>
        <p>Thank you for submitting your request for <strong>${pet}</strong>. We would like to schedule a <strong>meet &amp; greet</strong> before confirming your booking.</p>
        ${meetGreetInfoHtml()}
        ${scheduleLine}
        ${editBlock}
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
  options: DecisionEmailOptions = {},
) {
  const fromUser = getEnv("GMAIL_USER");
  const settings = action === "accept" ? await getSettings() : null;
  const links = {
    ...options,
    zelleName: settings?.zelleName,
    zelleRecipient: settings?.zelleRecipient,
    accountUrl:
      action === "accept"
        ? await createCustomerEmailUrl(
            payload.email,
            payload.submissionId
              ? `/account/bookings/${payload.submissionId}`
              : "/account",
          )
        : undefined,
    editUrl: options.editUrl
      ? await createCustomerEmailUrl(payload.email, options.editUrl)
      : undefined,
  };
  const { subject, html } = buildDecisionEmail(payload, action, links);

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
