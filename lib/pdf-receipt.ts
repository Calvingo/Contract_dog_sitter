import PDFDocument from "pdfkit";
import type { FormValues } from "./form-config";
import {
  formFields,
  getOptionLabel,
  prescreenQuestions,
  yesNoOptions,
  type FormField,
} from "./form-config";
import { formatDateTime, type PriceBreakdown } from "./pricing";

const BRAND_NAME = "Silicon Paws Retreat";

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

type PdfDoc = InstanceType<typeof PDFDocument>;

function addSectionTitle(doc: PdfDoc, title: string) {
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor("#c2410c").text(title);
  doc.fillColor("#1c1917");
  doc.moveDown(0.3);
}

function addRow(doc: PdfDoc, label: string, value: string) {
  doc.fontSize(10).font("Helvetica-Bold").text(`${label}: `, {
    continued: true,
    width: 500,
  });
  doc.font("Helvetica").text(value || "—");
}

export function generateSubmissionPdf(
  data: FormValues,
  quote: PriceBreakdown,
  signatureBuffer: Buffer
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ownerName = `${data.firstName} ${data.lastName}`.trim();
    const submittedAt = new Date().toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      hour12: false,
    });

    doc.fontSize(20).font("Helvetica-Bold").text(BRAND_NAME, { align: "center" });
    doc
      .fontSize(12)
      .font("Helvetica")
      .text("Pet Boarding & Daycare Agreement — Signed Submission", {
        align: "center",
      });
    doc.moveDown();
    doc.fontSize(10).fillColor("#57534e").text(`Submitted: ${submittedAt}`, {
      align: "center",
    });
    doc.fillColor("#1c1917");
    doc.moveDown();

    addSectionTitle(doc, "Price Estimate");
    addRow(doc, "Weight tier", quote.weightTier);
    addRow(doc, "Stay duration", `${quote.totalHours} hours`);
    addRow(doc, "Billable days", String(quote.billableDays));
    addRow(doc, "Daily rate", `$${quote.dailyRate}`);
    doc.font("Helvetica-Bold").fontSize(11);
    addRow(doc, "Estimated total", `$${quote.totalPrice.toFixed(2)}`);

    addSectionTitle(doc, "Pre-Screening");
    for (const q of prescreenQuestions) {
      addRow(
        doc,
        q.label,
        getOptionLabel(yesNoOptions, String(data[q.name]))
      );
    }
    if (data.prescreenNotes?.trim()) {
      addRow(doc, "Additional notes", data.prescreenNotes.trim());
    }

    addSectionTitle(doc, "Booking & Contact Details");
    const skipNames = new Set(["dropoffTime", "pickupTime"]);
    for (const field of formFields) {
      if (skipNames.has(field.name)) continue;
      if (field.name === "wechatId" && data.backupContact !== "wechat") continue;
      addRow(doc, field.label, fieldDisplayValue(field, data));
    }

    addSectionTitle(doc, "Owner Acknowledgment");
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(
        "By signing below, the Owner confirms they have read, understood, and agreed to all terms of the Pet Boarding & Daycare Agreement.",
        { width: 500 }
      );
    doc.moveDown(0.5);
    addRow(doc, "Owner name", ownerName);
    addRow(doc, "Dog name(s)", data.petName);
    addRow(doc, "Date signed", submittedAt.split(",")[0] ?? submittedAt);

    doc.moveDown();
    doc.fontSize(11).font("Helvetica-Bold").text("Signature:");
    doc.moveDown(0.3);

    try {
      doc.image(signatureBuffer, { width: 220, height: 80 });
    } catch {
      doc.fontSize(10).font("Helvetica").text("[Signature image unavailable]");
    }

    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor("#78716c")
      .text(
        "This document is an electronic record of your submitted agreement. Please retain for your records.",
        { align: "center", width: 500 }
      );

    doc.end();
  });
}

export function pdfFilename(petName: string): string {
  const safe = petName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `Silicon-Paws-Retreat-Agreement-${safe}-${date}.pdf`;
}
