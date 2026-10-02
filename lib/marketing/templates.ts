import { dateRange } from "@/lib/platform/rules";
export const holidays = {
  thanksgiving: {
    name: "Thanksgiving",
    subject: "Plan ahead for Thanksgiving boarding",
    body: "Planning a Thanksgiving trip? Reserve your dog's stay early at Silicon Paws Retreat. Choose your dates to see current availability. We look forward to caring for your dog!",
  },
  christmas: {
    name: "Christmas",
    subject: "Book your dog's Christmas stay early",
    body: "Make your Christmas travel plans with peace of mind. Reserve your dog's holiday stay at Silicon Paws Retreat while dates are available.",
  },
  summer: {
    name: "Summer break",
    subject: "Summer adventures start with a boarding plan",
    body: "Planning your summer getaway? Choose your dog's boarding dates at Silicon Paws Retreat early so you can travel with peace of mind.",
  },
} as const;
export type Holiday = keyof typeof holidays;
export function holidaySchedule(holiday: Holiday, year: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2200)
    throw new Error("Invalid year");
  let month = 5,
    day = 1,
    excludeStart = `${year}-06-01`,
    excludeEnd = `${year}-08-31`;
  if (holiday === "christmas") {
    month = 11;
    day = 25;
    excludeStart = `${year}-12-01`;
    excludeEnd = `${year}-12-31`;
  }
  if (holiday === "thanksgiving") {
    month = 10;
    day = 22 + ((4 - new Date(Date.UTC(year, 10, 1)).getUTCDay() + 7) % 7);
    excludeStart = `${year}-11-01`;
    excludeEnd = `${year}-11-30`;
  }
  // The daily worker sends on/after this date. Three calendar months, not 90 days.
  const scheduledAt = new Date(Date.UTC(year, month - 3, day, 17));
  return { scheduledAt, excludeStart, excludeEnd };
}
export function validateCampaign(input: {
  name: string;
  subject: string;
  body: string;
  excludeStart: string;
  excludeEnd: string;
  scheduledAt: Date;
  allCustomers?: boolean;
}) {
  if (!input.allCustomers) dateRange(input.excludeStart, input.excludeEnd);
  if (
    !input.name ||
    input.name.length > 120 ||
    !input.subject ||
    input.subject.length > 150 ||
    /[\r\n]/.test(input.subject) ||
    input.body.length < 10 ||
    input.body.length > 10000
  )
    throw new Error(
      "Enter a name (120 characters), subject (150 characters), and message (10–10,000 characters).",
    );
  if (!Number.isFinite(input.scheduledAt.getTime()))
    throw new Error("Choose a valid sending date.");
  if (
    !input.allCustomers &&
    input.scheduledAt >= new Date(`${input.excludeStart}T00:00:00Z`)
  )
    throw new Error("Send the promotion before the stay period starts.");
}
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
export const DEFAULT_MARKETING_IMAGE = "/images/silicon-paws-marketing.png";
export const BOOKING_WEBSITE = "https://contract-dog-sitter.vercel.app/";
export const returningGuestTemplate = {
  name: "November–January returning guests",
  subject: "November–January Boarding: Priority Booking for Returning Guests",
  body: `Hi {{firstName}},

Thank you for trusting us to care for {{petName}} at Silicon Paws Retreat! We’d love to welcome {{petName}} back this holiday season.

Our November and December spots are filling up quickly, with just **one spot left for Christmas**. We’re also accepting **January reservations**. If you’re planning a trip between November and January, we’d love to give our returning guests priority.

{{bookingLink}}

For future boarding questions, please reach me at christine.qi.zhang@gmail.com. You’re also welcome to contact me on WeChat or by phone anytime.

We look forward to seeing you and {{petName}} again!

Warmly,
Qi (Christine) Zhang

{{image}}

Email: christine.qi.zhang@gmail.com
WeChat: **LYSX6989**
Phone: **669-269-4827**`,
};
export type EmailPersonalization = {
  firstName?: string;
  petName?: string;
  imageUrl?: string | null;
};
export function personalizeText(
  value: string,
  recipient: EmailPersonalization = {},
) {
  return value.replace(/\{\{(firstName|petName)\}\}/g, (_, key) =>
    key === "firstName"
      ? recipient.firstName?.trim() || "there"
      : recipient.petName?.trim() || "your dog",
  );
}
export function emailContent(
  body: string,
  bookingUrl: string,
  unsubscribeUrl: string,
  address: string,
  recipient: EmailPersonalization = {},
) {
  const reserveLabel = `Reserve ${recipient.petName?.trim() ? `${recipient.petName.trim()}’s` : "your dog’s"} next stay here`;
  const bookingLink = `<a href="${escapeHtml(bookingUrl)}" style="color:#286347;font-weight:700;text-decoration:underline">${escapeHtml(reserveLabel)}</a>`;
  const safeImage =
    recipient.imageUrl &&
    /^(https:\/\/|\/(?:images|api\/marketing\/images)\/)/.test(
      recipient.imageUrl,
    )
      ? recipient.imageUrl
      : null;
  const image = safeImage
    ? `<img src="${escapeHtml(safeImage)}" alt="Silicon Paws Retreat — a home away from home" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;" />`
    : "";
  // Escape both the template and customer values before adding our limited formatting.
  const formatted = escapeHtml(body)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replaceAll(
      "christine.qi.zhang@gmail.com",
      '<a href="mailto:christine.qi.zhang@gmail.com">christine.qi.zhang@gmail.com</a>',
    )
    .replace(/\{\{(firstName|petName|bookingLink|image)\}\}/g, (_, key) => {
      if (key === "bookingLink") return bookingLink;
      if (key === "image") return image;
      return escapeHtml(personalizeText(`{{${key}}}`, recipient));
    });
  const content = formatted
    .split(/\n\s*\n/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 24px">${paragraph.replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
  const textBody = personalizeText(body, recipient)
    .replaceAll("{{bookingLink}}", `${reserveLabel}: ${bookingUrl}`)
    .replaceAll("{{image}}", safeImage ? `Photo: ${safeImage}` : "")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
  const text = `${textBody}${body.includes("{{bookingLink}}") ? "" : `\n\n${reserveLabel}: ${bookingUrl}`}\n\nSilicon Paws Retreat\n${address}\nUnsubscribe: ${unsubscribeUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:18px;line-height:1.7;max-width:640px;margin:auto;color:#293d34">${content}${body.includes("{{bookingLink}}") ? "" : `<p>${bookingLink}</p>`}${body.includes("{{image}}") ? "" : image}<hr><p style="font-size:12px">Silicon Paws Retreat<br>${escapeHtml(address)}<br><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p></div>`;
  return { text, html };
}
