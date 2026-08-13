import { PDFDocument, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { embedPdfFonts } from "./pdf-fonts";
import type { FormValues } from "./form-config";
import {
  agreementSections,
  formFields,
  getOptionLabel,
  prescreenQuestions,
  secondPrescreenQuestions,
  yesNoOptions,
  type FormField,
} from "./form-config";
import {
  DEPOSIT_PERCENT,
  formatDateTime,
} from "./pricing";
import type { SubmissionQuote } from "./submission-data";
import {
  BOARDING_CHECKLIST_INTRO,
  BOARDING_CHECKLIST_ITEMS,
  BOARDING_CHECKLIST_TITLE,
} from "./boarding-checklist";

const BRAND_NAME = "Silicon Paws Retreat";
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function fieldDisplayValue(field: FormField, data: FormValues): string {
  if (field.type === "select") {
    return getOptionLabel(field.options, String(data[field.name]));
  }
  if (field.name === "dropoffDate") {
    return formatDateTime(data.dropoffDate, data.dropoffTime);
  }
  if (field.name === "pickupDate") {
    return formatDateTime(data.pickupDate, data.pickupTime);
  }
  return String(data[field.name] ?? "");
}

type PdfContext = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
};

/** Character-based wrap — works for English, Chinese, and mixed text */
function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const ch of text) {
    if (ch === "\n") {
      if (current) lines.push(current);
      current = "";
      continue;
    }
    const next = current + ch;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = ch.trim() === "" ? "" : ch;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function ensureSpace(ctx: PdfContext, needed: number): PdfContext {
  if (ctx.y >= needed) return ctx;
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { ...ctx, page, y: PAGE_HEIGHT - MARGIN };
}

function drawLines(
  ctx: PdfContext,
  lines: string[],
  size: number,
  font: PDFFont,
  color = rgb(0.11, 0.11, 0.11)
): PdfContext {
  let next = ctx;
  const lineHeight = size + 4;
  for (const line of lines) {
    next = ensureSpace(next, MARGIN + lineHeight);
    next.page.drawText(line, {
      x: MARGIN,
      y: next.y,
      size,
      font,
      color,
    });
    next = { ...next, y: next.y - lineHeight };
  }
  return next;
}

function drawSectionTitle(ctx: PdfContext, title: string): PdfContext {
  let next = ensureSpace(ctx, MARGIN + 24);
  next = drawLines(next, [title], 13, next.bold, rgb(0.76, 0.25, 0.05));
  return { ...next, y: next.y - 6 };
}

function drawRow(ctx: PdfContext, label: string, value: string): PdfContext {
  const text = `${label}: ${value || "—"}`;
  const lines = wrapLines(text, ctx.font, 10, CONTENT_WIDTH);
  return drawLines(ctx, lines, 10, ctx.font);
}

function drawAgreementTerms(ctx: PdfContext): PdfContext {
  let next = drawSectionTitle(ctx, "Pet Boarding & Daycare Agreement — Terms");
  for (const section of agreementSections) {
    next = ensureSpace(next, MARGIN + 20);
    next = drawLines(
      next,
      wrapLines(section.title, next.bold, 11, CONTENT_WIDTH),
      11,
      next.bold,
      rgb(0.2, 0.2, 0.2)
    );
    next = drawLines(
      next,
      wrapLines(section.body, next.font, 9, CONTENT_WIDTH),
      9,
      next.font
    );
    next = { ...next, y: next.y - 8 };
  }
  return next;
}

function drawBoardingChecklist(ctx: PdfContext): PdfContext {
  let next = drawSectionTitle(ctx, BOARDING_CHECKLIST_TITLE);
  next = drawLines(
    next,
    wrapLines(BOARDING_CHECKLIST_INTRO, next.font, 10, CONTENT_WIDTH),
    10,
    next.font
  );
  for (const item of BOARDING_CHECKLIST_ITEMS) {
    next = drawLines(
      next,
      wrapLines(`- ${item}`, next.font, 10, CONTENT_WIDTH),
      10,
      next.font
    );
  }
  return { ...next, y: next.y - 6 };
}

export async function generateSubmissionPdf(
  data: FormValues,
  quote: SubmissionQuote,
  signatureBuffer: Buffer
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const { font, bold } = await embedPdfFonts(doc);

  let ctx: PdfContext = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
    font,
    bold,
  };

  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const submittedAt = new Date().toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    hour12: false,
  });

  const titleLines = wrapLines(BRAND_NAME, bold, 20, CONTENT_WIDTH);
  ctx = drawLines(ctx, titleLines, 20, bold);
  ctx = drawLines(
    ctx,
    wrapLines(
      "Pet Boarding & Daycare Agreement — Signed Submission",
      font,
      12,
      CONTENT_WIDTH
    ),
    12,
    font
  );
  ctx = drawLines(
    ctx,
    wrapLines(`Submitted: ${submittedAt}`, font, 10, CONTENT_WIDTH),
    10,
    font,
    rgb(0.34, 0.33, 0.31)
  );
  ctx = { ...ctx, y: ctx.y - 10 };

  ctx = drawBoardingChecklist(ctx);

  const firstQuote = quote.dogs[0];
  ctx = drawSectionTitle(ctx, `${data.petName} — Price Estimate`);
  ctx = drawRow(ctx, "Weight tier", firstQuote.weightTier);
  ctx = drawRow(ctx, "Stay duration", `${firstQuote.totalHours} hours`);
  ctx = drawRow(ctx, "Billable days", String(firstQuote.billableDays));
  ctx = drawRow(ctx, "Daily rate", `$${firstQuote.dailyRate}`);
  ctx = drawRow(ctx, "Boarding subtotal", `$${firstQuote.boardingSubtotal.toFixed(2)}`);
  if (firstQuote.puppyFee > 0) {
    ctx = drawRow(
      ctx,
      "Puppy fee",
      `$${firstQuote.puppyFee.toFixed(2)} (${firstQuote.billableDays} day(s) × $${firstQuote.puppyFeePerDay})`
    );
  }
  if (firstQuote.seniorDogFee > 0) {
    ctx = drawRow(
      ctx,
      "Senior dog fee",
      `$${firstQuote.seniorDogFee.toFixed(2)} (${firstQuote.billableDays} day(s) × $${firstQuote.seniorDogFeePerDay})`
    );
  }
  if (firstQuote.intactDogFee > 0) {
    ctx = drawRow(
      ctx,
      "Unspayed/unneutered dog fee",
      `$${firstQuote.intactDogFee.toFixed(2)} (${firstQuote.billableDays} day(s) × $${firstQuote.intactDogFeePerDay})`
    );
  }
  if (firstQuote.highEnergyDogFee > 0) {
    ctx = drawRow(
      ctx,
      "High-energy care fee",
      `$${firstQuote.highEnergyDogFee.toFixed(2)} (${firstQuote.billableDays} day(s) × $${firstQuote.highEnergyDogFeePerDay})`
    );
  }
  if (firstQuote.holidayFee > 0) {
    ctx = drawRow(
      ctx,
      "Holiday fee",
      `$${firstQuote.holidayFee.toFixed(2)} (entire stay: ${firstQuote.holidayDays} day(s) × $${firstQuote.holidayFeePerDay})`
    );
  }
  ctx = drawRow(ctx, "Dog subtotal", `$${firstQuote.totalPrice.toFixed(2)}`);
  if (quote.dogs[1]) {
    const secondQuote = quote.dogs[1];
    ctx = drawSectionTitle(ctx, `${data.secondPetName} — Price Estimate`);
    ctx = drawRow(ctx, "Weight tier", secondQuote.weightTier);
    ctx = drawRow(ctx, "Stay duration", `${secondQuote.totalHours} hours`);
    ctx = drawRow(ctx, "Billable days", String(secondQuote.billableDays));
    ctx = drawRow(ctx, "Daily rate", `$${secondQuote.dailyRate}`);
    ctx = drawRow(ctx, "Boarding subtotal", `$${secondQuote.boardingSubtotal.toFixed(2)}`);
    if (secondQuote.puppyFee > 0) ctx = drawRow(ctx, "Puppy fee", `$${secondQuote.puppyFee.toFixed(2)}`);
    if (secondQuote.seniorDogFee > 0) ctx = drawRow(ctx, "Senior dog fee", `$${secondQuote.seniorDogFee.toFixed(2)}`);
    if (secondQuote.intactDogFee > 0) ctx = drawRow(ctx, "Unspayed/unneutered dog fee", `$${secondQuote.intactDogFee.toFixed(2)}`);
    if (secondQuote.highEnergyDogFee > 0) ctx = drawRow(ctx, "High-energy care fee", `$${secondQuote.highEnergyDogFee.toFixed(2)}`);
    if (secondQuote.holidayFee > 0) ctx = drawRow(ctx, "Holiday fee", `$${secondQuote.holidayFee.toFixed(2)}`);
    ctx = drawRow(ctx, "Dog subtotal", `$${secondQuote.totalPrice.toFixed(2)}`);
  }
  ctx = drawSectionTitle(ctx, "Combined Total");
  ctx = drawRow(ctx, "Estimated total", `$${quote.totalPrice.toFixed(2)}`);
  ctx = drawRow(
    ctx,
    `Deposit (${DEPOSIT_PERCENT}% of total)`,
    `$${quote.depositAmount.toFixed(2)}`
  );

  ctx = drawSectionTitle(ctx, `Dog 1 — ${data.petName} Pre-Screening`);
  for (const q of prescreenQuestions) {
    ctx = drawRow(
      ctx,
      q.label,
      getOptionLabel(yesNoOptions, String(data[q.name]))
    );
  }
  if (data.prescreenNotes?.trim()) {
    ctx = drawRow(ctx, "Additional notes", data.prescreenNotes.trim());
  }
  if (data.hasSecondDog) {
    ctx = drawSectionTitle(ctx, `Dog 2 — ${data.secondPetName} Pre-Screening`);
    for (const q of secondPrescreenQuestions) {
      ctx = drawRow(ctx, q.label, getOptionLabel(yesNoOptions, String(data[q.name])));
    }
    if (data.secondPrescreenNotes?.trim()) ctx = drawRow(ctx, "Additional notes", data.secondPrescreenNotes.trim());
  }

  ctx = drawSectionTitle(ctx, "Booking & Contact Details");
  const skipNames = new Set(["dropoffTime", "pickupTime"]);
  for (const field of formFields) {
    if (skipNames.has(field.name)) continue;
    if (field.name === "wechatId" && data.backupContact !== "wechat") continue;
    ctx = drawRow(ctx, field.label, fieldDisplayValue(field, data));
  }
  if (data.hasSecondDog) {
    ctx = drawSectionTitle(ctx, "Dog 2 Details");
    ctx = drawRow(ctx, "Name", data.secondPetName);
    ctx = drawRow(ctx, "Breed", data.secondPetBreed);
    ctx = drawRow(ctx, "Weight (lbs)", data.secondPetWeightLb);
    ctx = drawRow(ctx, "Age (years)", data.secondPetAgeYears);
  }

  ctx = drawAgreementTerms(ctx);

  ctx = drawSectionTitle(ctx, "Owner Acknowledgment");
  ctx = drawLines(
    ctx,
    wrapLines(
      "By signing below, the Owner confirms they have read, understood, and agreed to all terms of the Pet Boarding & Daycare Agreement.",
      font,
      10,
      CONTENT_WIDTH
    ),
    10,
    font
  );
  ctx = drawRow(ctx, "Owner name", ownerName);
  ctx = drawRow(ctx, "Dog name(s)", [data.petName, data.hasSecondDog ? data.secondPetName : ""].filter(Boolean).join(" & "));
  ctx = drawRow(ctx, "Date signed", submittedAt.split(",")[0] ?? submittedAt);

  ctx = ensureSpace(ctx, MARGIN + 100);
  ctx = drawLines(ctx, ["Signature:"], 11, bold);
  ctx = { ...ctx, y: ctx.y - 8 };

  try {
    const png = await doc.embedPng(signatureBuffer);
    const sigHeight = 60;
    const sigWidth = 180;
    ctx = ensureSpace(ctx, MARGIN + sigHeight + 20);
    ctx.page.drawImage(png, {
      x: MARGIN,
      y: ctx.y - sigHeight,
      width: sigWidth,
      height: sigHeight,
    });
    ctx = { ...ctx, y: ctx.y - sigHeight - 14 };
  } catch {
    ctx = drawLines(ctx, ["[Signature image unavailable]"], 10, font);
  }

  ctx = drawLines(
    ctx,
    wrapLines(
      "This document is an electronic record of your submitted agreement. Please retain for your records.",
      font,
      8,
      CONTENT_WIDTH
    ),
    8,
    font,
    rgb(0.47, 0.44, 0.42)
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export function pdfFilename(petName: string): string {
  const safe = petName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `Silicon-Paws-Retreat-Agreement-${safe}-${date}.pdf`;
}
