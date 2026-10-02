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
}) {
  dateRange(input.excludeStart, input.excludeEnd);
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
  if (input.scheduledAt >= new Date(`${input.excludeStart}T00:00:00Z`))
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
export function emailContent(
  body: string,
  bookingUrl: string,
  unsubscribeUrl: string,
  address: string,
) {
  const text = `${body}\n\nView availability and book: ${bookingUrl}\n\nSilicon Paws Retreat\n${address}\nYou subscribed to boarding promotions. Unsubscribe: ${unsubscribeUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.7;max-width:600px;margin:auto;color:#263d31"><h2>Silicon Paws Retreat</h2><p>${escapeHtml(body).replaceAll("\n", "<br>")}</p><p><a href="${escapeHtml(bookingUrl)}" style="display:inline-block;padding:12px 20px;background:#345b46;color:white;border-radius:8px">View availability &amp; book</a></p><hr><p style="font-size:12px">Silicon Paws Retreat<br>${escapeHtml(address)}<br>You subscribed to boarding promotions. <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p></div>`;
  return { text, html };
}
