"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import {
  assertCapacity,
  getSettings,
  lockCapacity,
} from "@/lib/platform/capacity";
import { sendPaymentConfirmation } from "@/lib/platform/payment-email";
import { depositDue, verifiedAmount } from "@/lib/platform/rules";
import {
  updateCalendarRange,
  type CalendarMode,
} from "@/lib/platform/calendar-management";
import type { ActionState } from "@/components/ActionForm";
function text(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}
function refresh() {
  for (const path of [
    "/admin",
    "/admin/calendar",
    "/admin/settings",
    "/admin/payments",
    "/account",
  ])
    revalidatePath(path, "layout");
}
export async function saveSettings(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  const defaultCapacity = Number(text(form, "defaultCapacity")),
    holdHours = Number(text(form, "holdHours"));
  if (
    !Number.isInteger(defaultCapacity) ||
    defaultCapacity < 0 ||
    defaultCapacity > 100 ||
    !Number.isInteger(holdHours) ||
    holdHours < 1 ||
    holdHours > 168
  )
    return { error: "Capacity must be 0–100 dogs; holds must be 1–168 hours." };
  const zelleRecipient = text(form, "zelleRecipient"),
    zelleName = text(form, "zelleName"),
    venmoUsername = text(form, "venmoUsername").replace(/^@/, ""),
    venmoName = text(form, "venmoName");
  if (
    Boolean(zelleRecipient) !== Boolean(zelleName) ||
    Boolean(venmoUsername) !== Boolean(venmoName)
  )
    return {
      error:
        "Provide both the recipient identifier and display name, or leave both empty. Empty Venmo details use the Zelle recipient.",
    };
  if (
    zelleRecipient &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(zelleRecipient) &&
    !/^\+?[\d\s().-]{10,25}$/.test(zelleRecipient)
  )
    return { error: "Enter the email or US phone number enrolled with Zelle." };
  if (venmoUsername && !/^[a-zA-Z0-9_-]{2,30}$/.test(venmoUsername))
    return { error: "Enter a valid Venmo username, not a URL." };
  if ([zelleRecipient, zelleName, venmoName].some((v) => v.length > 150))
    return { error: "Recipient details are too long." };
  const data = {
    defaultCapacity,
    holdHours,
    includePickupDay: form.get("includePickupDay") === "on",
    zelleRecipient,
    zelleName,
    venmoUsername,
    venmoName,
  };
  await prisma.$transaction(async (tx) => {
    await lockCapacity(tx);
    await tx.platformSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
  });
  refresh();
  return {
    message:
      "Settings saved. Existing bookings are preserved; check the calendar for any capacity warnings. Existing hold deadlines remain unchanged.",
  };
}
export async function saveDailyCapacity(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  try {
    const message = await updateCalendarRange({
      start: text(form, "start"),
      end: text(form, "end") || text(form, "start"),
      mode: text(form, "mode") as CalendarMode,
      capacity: Number(text(form, "capacity")),
      note: text(form, "note"),
    });
    refresh();
    revalidatePath("/book");
    revalidatePath("/");
    return { message };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update calendar.",
    };
  }
}

export async function reviewPayment(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const id = text(form, "id"),
    status = text(form, "status"),
    note = text(form, "note").slice(0, 1000),
    amount = Number(text(form, "amount"));
  if (
    !["VERIFIED", "REJECTED", "REFUNDED"].includes(status) ||
    form.get("checked") !== "on"
  )
    return {
      error: "Choose a result and confirm you checked the real transfer.",
    };
  if (
    status === "VERIFIED" &&
    (!Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 100000 ||
      Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001)
  )
    return {
      error:
        "Enter the actual received amount, with at most two decimal places.",
    };
  if (status !== "VERIFIED" && !note)
    return { error: "Add a reason or refund reference for the customer." };
  try {
    const confirmationBookingId = await prisma.$transaction(async (tx) => {
      await lockCapacity(tx);
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id },
        include: {
          submission: { include: { submissionPets: true, payments: true } },
        },
      });
      if (
        status === "REFUNDED"
          ? payment.status !== "VERIFIED"
          : payment.status !== "REPORTED"
      )
        throw new Error(
          "This payment has already been reviewed. Refresh to see its status.",
        );
      const booking = payment.submission;
      if (
        status === "VERIFIED" &&
        !["CANCELLED", "REJECTED"].includes(booking.status)
      )
        await assertCapacity(
          tx,
          booking.dropoffAt,
          booking.pickupAt,
          Math.max(1, booking.submissionPets.length),
          booking.id,
        );
      await tx.payment.update({
        where: { id },
        data: {
          status: status as "VERIFIED" | "REJECTED" | "REFUNDED",
          ...(status === "VERIFIED" ? { amount } : {}),
          reviewNote: note || null,
          reviewedAt: new Date(),
          reviewedBy: admin.email,
        },
      });
      if (status === "VERIFIED") {
        const settings = await getSettings(tx);
        await tx.submission.update({
          where: { id: booking.id },
          data: {
            holdExpiresAt: new Date(Date.now() + settings.holdHours * 3600000),
          },
        });
      }
      const paidBefore = verifiedAmount(booking);
      return status === "VERIFIED" &&
        booking.status === "ACCEPTED" &&
        paidBefore < depositDue(Number(booking.quotedTotal)) &&
        paidBefore + amount >= depositDue(Number(booking.quotedTotal))
        ? booking.id
        : null;
    });
    refresh();
    if (confirmationBookingId) {
      try {
        await sendPaymentConfirmation(confirmationBookingId);
      } catch {
        return {
          message:
            "Payment verified and booking confirmed. The confirmation email could not be delivered; contact the customer and check the email log.",
        };
      }
    }
    return {
      message:
        status === "REFUNDED"
          ? "Actual refund recorded. No money was transferred by this website."
          : "Payment review saved.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to review this payment.",
    };
  }
}
