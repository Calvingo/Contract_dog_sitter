"use server";
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
  const firstName = text(form, "firstName"),
    lastName = text(form, "lastName"),
    phone = text(form, "phone");
  if (
    !firstName ||
    !lastName ||
    !phone ||
    firstName.length > 100 ||
    lastName.length > 100 ||
    phone.length > 40
  )
    return { error: "Enter your name and a valid phone number." };
  const emailOptIn = form.get("emailOptIn") === "on";
  // Retain legacy database fields for compatibility; SMS cannot be opted into.
  const smsOptIn = false;
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUniqueOrThrow({
        where: { id: customer.id },
      });
      const changed =
        current.emailMarketingOptIn !== emailOptIn ||
        current.smsMarketingOptIn !== smsOptIn;
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          firstName,
          lastName,
          phone,
          emergencyContactName: text(form, "emergencyContactName").slice(
            0,
            100,
          ),
          emergencyContactPhone: text(form, "emergencyContactPhone").slice(
            0,
            40,
          ),
          emailMarketingOptIn: emailOptIn,
          smsMarketingOptIn: smsOptIn,
          ...(changed ? { marketingConsentUpdatedAt: new Date() } : {}),
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
    revalidatePath("/admin/customers");
    return { message: "Your profile and email preferences have been saved." };
  } catch {
    return { error: "Unable to save your profile. Please try again." };
  }
}
export async function saveDog(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const customer = await requireCustomer();
  const id = text(form, "id"),
    name = text(form, "name"),
    breed = text(form, "breed"),
    weightLb = Number(text(form, "weightLb"));
  const rawAge = text(form, "ageYears"),
    ageYears = rawAge === "" ? null : Number(rawAge);
  if (
    !name ||
    !breed ||
    name.length > 100 ||
    breed.length > 100 ||
    !Number.isFinite(weightLb) ||
    weightLb <= 0 ||
    weightLb > 300 ||
    (ageYears !== null &&
      (!Number.isFinite(ageYears) || ageYears < 0 || ageYears > 40))
  )
    return { error: "Check your dog’s name, breed, weight and age." };
  try {
    if (id) {
      const updated = await prisma.pet.updateMany({
        where: { id, customerId: customer.id },
        data: { name, breed, weightLb, ageYears },
      });
      if (!updated.count) return { error: "Dog not found." };
    } else
      await prisma.pet.create({
        data: { customerId: customer.id, name, breed, weightLb, ageYears },
      });
    revalidatePath("/account/dogs");
    return {
      message:
        "Dog profile saved. Existing booking agreements keep their original details.",
    };
  } catch {
    return {
      error:
        "Unable to save. Check whether you already have a dog with this name.",
    };
  }
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
  const id = text(form, "id"),
    method = text(form, "method"),
    payerName = text(form, "payerName"),
    reference = text(form, "reference");
  if (
    !["ZELLE", "VENMO"].includes(method) ||
    !payerName ||
    !reference ||
    payerName.length > 100 ||
    reference.length > 150
  )
    return {
      error:
        "Choose a payment method and enter the payer name and transfer reference.",
    };
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
        method === "ZELLE"
          ? !settings.zelleRecipient || !settings.zelleName
          : !settings.venmoUsername || !settings.venmoName
      )
        throw new Error("This payment method is not currently available.");
      await assertCapacity(
        tx,
        booking.dropoffAt,
        booking.pickupAt,
        Math.max(1, booking.submissionPets.length),
        booking.id,
      );
      await tx.payment.create({
        data: { submissionId: id, method, payerName, reference, amount },
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
