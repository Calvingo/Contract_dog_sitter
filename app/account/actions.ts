"use server";
import { getVenmoDetails } from "@/lib/platform/payment-details";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearCustomerSession } from "@/lib/auth/customer-session";
import { requireCustomer } from "@/lib/platform/auth";
import { prisma } from "@/lib/db";
import { createSubmissionEditToken } from "@/lib/submission-edit-token";
import {
  lockCapacity,
  getSettings,
  assertCapacity,
} from "@/lib/platform/capacity";
import {
  depositDue,
  reservesCapacity,
  verifiedAmount,
} from "@/lib/platform/rules";
import type { ActionState } from "@/components/ActionForm";
import { prescreenQuestions } from "@/lib/form-config";
import {
  archiveCustomerDog,
  deactivateCustomerAccount,
  lockCustomerProfile,
  restoreCustomerDog,
  saveCustomerDetails,
  saveCustomerDog,
} from "@/lib/services/customer-profile";

function text(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}
function failed(error: unknown): ActionState {
  return {
    error:
      error instanceof Error
        ? error.message
        : "Unable to save. Please try again.",
  };
}
export async function logoutCustomer() {
  await clearCustomerSession();
  redirect("/login");
}
export async function saveProfile(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const customer = await requireCustomer();
  const emailOptIn = form.get("emailOptIn") === "on";
  // Retain legacy database fields for compatibility; SMS cannot be opted into.
  const smsOptIn = false;
  try {
    await prisma.$transaction(async (tx) => {
      await lockCustomerProfile(tx, customer.id);
      const current = await tx.customer.findUniqueOrThrow({
        where: { id: customer.id },
      });
      await saveCustomerDetails(customer.id, {
        firstName: text(form, "firstName"),
        lastName: text(form, "lastName"),
        phone: text(form, "phone"),
        backupContact: text(form, "backupContact"),
        emergencyContactName: text(form, "emergencyContactName"),
        emergencyContactPhone: text(form, "emergencyContactPhone"),
        wechatId: text(form, "wechatId"),
      }, tx);
      const changed =
        current.emailMarketingOptIn !== emailOptIn ||
        current.smsMarketingOptIn !== smsOptIn;
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          emailMarketingOptIn: emailOptIn,
          smsMarketingOptIn: smsOptIn,
          marketingConsentUpdatedAt: new Date(),
        },
      });
      if (changed)
        await tx.marketingConsentEvent.create({
          data: {
            customerId: customer.id,
            emailOptIn,
            smsOptIn,
            source: "account-email-preferences-v2",
          },
        });
    });
    revalidatePath("/account/profile");
    revalidatePath("/account");
    revalidatePath("/book");
    revalidatePath("/admin/customers");
    return { message: "Your profile and email preferences have been saved." };
  } catch (error) {
    return failed(error);
  }
}
export async function saveDog(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const customer = await requireCustomer();
  try {
    await saveCustomerDog(customer.id, {
      id: text(form, "id") || undefined,
      name: text(form, "name"),
      breed: text(form, "breed"),
      weightLb: text(form, "weightLb"),
      ageYears: text(form, "ageYears"),
      prescreenAnswers: Object.fromEntries(
        prescreenQuestions.map((question) => [question.name, text(form, question.name)]),
      ),
      prescreenNotes: text(form, "prescreenNotes"),
    });
    revalidateCustomerDogs();
    return {
      message:
        "Dog profile saved. Existing booking agreements keep their original details.",
    };
  } catch (error) {
    return failed(error);
  }
}

function revalidateCustomerDogs() {
  revalidatePath("/account/dogs");
  revalidatePath("/account");
  revalidatePath("/book");
  revalidatePath("/admin/customers");
}

export async function archiveDog(_state: ActionState, form: FormData): Promise<ActionState> {
  const customer = await requireCustomer();
  try {
    await archiveCustomerDog(customer.id, text(form, "id"));
    revalidateCustomerDogs();
    return { message: "Dog profile removed from future bookings. You can restore it below. Existing bookings and agreements are unchanged." };
  } catch (error) {
    return failed(error);
  }
}

export async function restoreDog(_state: ActionState, form: FormData): Promise<ActionState> {
  const customer = await requireCustomer();
  try {
    await restoreCustomerDog(customer.id, text(form, "id"));
    revalidateCustomerDogs();
    return { message: "Dog profile restored. Its saved details are available for future bookings." };
  } catch (error) {
    return failed(error);
  }
}

export async function deactivateAccount(_state: ActionState, form: FormData): Promise<ActionState> {
  const customer = await requireCustomer();
  if (form.get("confirmDeactivation") !== "on")
    return { error: "Confirm that you understand deactivation does not cancel existing bookings." };
  try {
    await deactivateCustomerAccount(customer.id);
    revalidatePath("/admin/customers");
    revalidatePath("/account", "layout");
  } catch (error) {
    return failed(error);
  }
  await clearCustomerSession();
  redirect("/login?deactivated=1");
}
export async function editBooking(form: FormData) {
  const customer = await requireCustomer();
  const booking = await prisma.submission.findFirst({
    where: {
      id: text(form, "id"),
      customerId: customer.id,
      status: { notIn: ["CANCELLED", "REJECTED"] },
    },
  });
  if (!booking) redirect("/account");
  const token = await createSubmissionEditToken(booking.id);
  redirect(`/book?editToken=${encodeURIComponent(token)}`);
}
export async function requestCancellation(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const customer = await requireCustomer();
  const reason = text(form, "reason");
  if (!reason || reason.length > 1000)
    return {
      error:
        "Please briefly explain the cancellation request (up to 1,000 characters).",
    };
  const result = await prisma.submission.updateMany({
    where: {
      id: text(form, "id"),
      customerId: customer.id,
      status: { notIn: ["CANCELLED", "REJECTED"] },
      cancellationRequestedAt: null,
    },
    data: { cancellationRequestedAt: new Date(), cancellationReason: reason },
  });
  if (!result.count)
    return {
      error: "This request is already recorded or the booking is closed.",
    };
  revalidatePath(`/account/bookings/${text(form, "id")}`);
  revalidatePath("/account");
  revalidatePath("/admin/requests");
  return {
    message:
      "Cancellation requested. Your booking remains in place until we review it. Refunds are handled separately.",
  };
}
export async function reportPayment(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const customer = await requireCustomer();
  const id = text(form, "id");
  if (!id) return { error: "Choose a booking to report payment." };
  try {
    await prisma.$transaction(async (tx) => {
      await lockCapacity(tx);
      const booking = await tx.submission.findFirst({
        where: { id, customerId: customer.id },
        include: { payments: true, submissionPets: true },
      });
      if (!booking || booking.status !== "ACCEPTED")
        throw new Error("Payment is available after your booking is approved.");
      if (booking.holdExpiresAt === null)
        throw new Error(
          "Contact us about payment for this existing reservation before transferring money.",
        );
      if (!reservesCapacity(booking))
        throw new Error(
          "Your hold has expired. Contact us before sending payment.",
        );
      if (booking.payments.some((p) => p.status === "REPORTED"))
        throw new Error("Your payment is already awaiting review.");
      const amount = Math.max(
        0,
        depositDue(Number(booking.quotedTotal)) - verifiedAmount(booking),
      );
      if (!amount) throw new Error("Your deposit is already verified.");
      const settings = await getSettings(tx);
      if (
        !(settings.zelleRecipient && settings.zelleName) &&
        !getVenmoDetails(settings)
      )
        throw new Error("Payment is not currently available.");
      await assertCapacity(
        tx,
        booking.dropoffAt,
        booking.pickupAt,
        Math.max(1, booking.submissionPets.length),
        booking.id,
      );
      await tx.payment.create({
        data: {
          submissionId: id,
          method: "TRANSFER",
          payerName: "",
          reference: "",
          amount,
        },
      });
      await tx.submission.update({
        where: { id },
        data: {
          holdExpiresAt: new Date(
            Math.max(
              booking.holdExpiresAt?.getTime() ?? 0,
              Date.now() + settings.holdHours * 3600000,
            ),
          ),
        },
      });
    });
    revalidatePath(`/account/bookings/${id}`);
    revalidatePath("/account");
    revalidatePath("/admin/payments");
    return {
      message:
        "Payment submitted for verification. We will confirm after checking the actual transfer.",
    };
  } catch (error) {
    return failed(error);
  }
}
