"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { lockCapacity } from "@/lib/platform/capacity";
import { prisma } from "@/lib/db";

// Only records offline transactions. A refund is stored cumulatively on its receipt.
export async function recordOfflinePayment(_state: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const id = String(form.get("id") ?? "");
  const paymentId = String(form.get("paymentId") ?? "");
  const reference = String(form.get("reference") ?? "").trim();
  const operation = form.get("operation");
  const amount = String(form.get("amount") ?? "").trim();
  if (!id || !["refund", "receipt"].includes(String(operation)) ||
      !/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 ||
      reference.length > 180 || /[\r\n]/.test(reference) || !reference)
    return { error: "Enter a positive amount (up to two decimals) and the offline transfer reference." };
  try {
    await prisma.$transaction(async tx => {
      await lockCapacity(tx);
      const booking = await tx.submission.findUniqueOrThrow({ where: { id }, select: { status: true } });
      const payment = paymentId ? await tx.payment.findFirst({ where: { id: paymentId, submissionId: id } }) : null;
      if (operation === "refund") {
        if (!payment || payment.status !== "VERIFIED" || Number(amount) > Number(payment.amount))
          throw new Error("Select a confirmed receipt and enter a cumulative refund within its received amount.");
        const note = `Cumulative refund $${Number(amount).toFixed(2)} · ${reference}`;
        if (Number(amount) === Number(payment.refundedAmount) && payment.reviewNote?.split("\n").at(-1) === note) return;
        if (Number(form.get("previousRefund")) !== Number(payment.refundedAmount) || Number(amount) <= Number(payment.refundedAmount))
          throw new Error("This refund total changed. Refresh and check the recorded amount.");
        await tx.payment.update({ where: { id: payment.id }, data: {
          refundedAmount: amount, reviewedBy: admin.email, reviewedAt: new Date(),
          reviewNote: [payment.reviewNote, note].filter(Boolean).join("\n"),
        } });
        return;
      }
      if (booking.status !== "ACCEPTED") throw new Error("Only accepted bookings can record new receipts.");
      const existing = await tx.payment.findFirst({ where: { submissionId: id, offlineReference: reference } });
      if (existing) {
        if ((!paymentId || paymentId === existing.id) && Number(amount) === Number(existing.amount)) return;
        throw new Error("This transfer reference is already recorded. Check the original receipt.");
      }
      const details = { status: "VERIFIED" as const, amount, offlineReference: reference, reference,
        reviewedBy: admin.email, reviewedAt: new Date() };
      if (paymentId) {
        if (payment?.status !== "REPORTED") throw new Error("This notification was already reviewed. Refresh to see its receipt.");
        await tx.payment.update({ where: { id: payment.id }, data: details });
      } else {
        await tx.payment.create({ data: { ...details, submissionId: id, method: "TRANSFER", payerName: "" } });
      }
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to record this transfer." };
  }
  for (const path of ["/admin/reports", "/admin/payments", `/admin/submissions/${id}`, `/account/bookings/${id}`]) revalidatePath(path);
  return { message: "Offline payment record saved." };
}
