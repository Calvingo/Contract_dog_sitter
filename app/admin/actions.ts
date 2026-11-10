"use server";

import {
  assertCapacity,
  lockCapacity,
  getSettings,
} from "@/lib/platform/capacity";
import type { ActionState } from "@/components/ActionForm";
import { Prisma, SubmissionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearAdminSession, getAdminSession } from "@/lib/auth/admin-session";
import { processAdminSubmissionDecision } from "@/lib/admin/decision";
import { prisma } from "@/lib/db";
import {
  formValuesFromSubmission,
  buildCustomerSnapshot,
  buildPetSnapshots,
  storedDogTerms,
  type SubmissionQuote,
} from "@/lib/submission-data";
import { sendSubmissionEmails } from "@/lib/email";
import type { DecisionAction } from "@/lib/decision-emails";
import { signatureToBuffer } from "@/lib/validate";
import { isPickupDropoffTimeAllowed } from "@/lib/booking-time";
import { parseDateTime } from "@/lib/pricing";
import { dateKey, dateRange } from "@/lib/platform/rules";
import { archiveSubmissionRevision } from "@/lib/services/submission-revision";
import { repriceAdminSubmission } from "@/lib/admin/submission-pricing";
import { reconcileRewardHolds, rewardOnAcceptance } from "@/lib/services/booking-rewards";
import { lockCustomerProfile } from "@/lib/services/customer-profile";
import { cancelAdminBooking, scheduleCancellationConfirmation } from "@/lib/services/cancellation";

function revalidateBooking(submissionId: string) {
  for (const path of ["/admin", "/admin/requests", "/admin/calendar", "/admin/reports", "/admin/customers", "/admin/payments", "/account", "/account/dogs", "/account/profile", "/book", `/admin/submissions/${submissionId}`, `/account/bookings/${submissionId}`]) {
    revalidatePath(path);
  }
}

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  return session;
}

export async function logoutAdminAction() {
  await clearAdminSession();
  redirect("/admin/login");
}

export async function decideSubmissionAction(formData: FormData) {
  const session = await requireAdmin();
  const submissionId = String(formData.get("submissionId") || "");
  const action = String(formData.get("action") || "") as DecisionAction;
  const meetGreetAt = String(formData.get("meetGreetAt") || "").trim();
  const revision = Number(formData.get("revision"));
  const expectedStatus = String(formData.get("expectedStatus") || "");

  if (
    !submissionId ||
    !["accept", "reject", "meet_greet"].includes(action) ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    !Object.values(SubmissionStatus).includes(
      expectedStatus as SubmissionStatus,
    )
  ) {
    throw new Error("Invalid admin decision.");
  }

  const decision = await processAdminSubmissionDecision({
    submissionId,
    action,
    adminEmail: session.email,
    meetGreetAt: meetGreetAt || undefined,
    expectedRevision: revision,
    expectedStatus,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/submissions/${submissionId}`);
  revalidatePath(`/account/bookings/${submissionId}`);
  if (decision.notificationFailed)
    throw new Error(
      "Decision saved, but the customer email could not be delivered. Check the email log and contact the customer.",
    );
}

export async function decideSubmissionActionWithState(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    await decideSubmissionAction(formData);
    return { message: "Decision saved and customer notified." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to process this booking.",
    };
  }
}

export type AdminFormState = {
  ok?: boolean;
  message?: string;
  error?: string;
};

async function sendLatestSubmissionReceipt(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      submissionPets: { orderBy: { position: "asc" } },
    },
  });

  if (!submission) {
    return;
  }

  const values = formValuesFromSubmission({
    firstTimeBooking: submission.firstTimeBooking,
    dropoffAt: submission.dropoffAt,
    pickupAt: submission.pickupAt,
    prescreenAnswers: submission.prescreenAnswers,
    prescreenNotes: submission.prescreenNotes,
    signatureData: submission.signatureData,
    customerSnapshot: submission.customerSnapshot,
    petSnapshot: submission.petSnapshot,
    submissionPets: submission.submissionPets,
  });

  await sendSubmissionEmails(
    values,
    signatureToBuffer(submission.signatureData),
    submission.id,
    {
      revision: submission.revision,
      isUpdate: true,
      quote: submission.quotedBreakdown as unknown as SubmissionQuote,
      sendAdminNotification: true,
      agreementVersion: submission.agreementVersion,
    },
  );

  return values.email;
}

async function updateSubmissionInternal(formData: FormData) {
  await requireAdmin();

  const submissionId = String(formData.get("submissionId") || "");
  const status = String(formData.get("status") || "") as SubmissionStatus;
  const dropoffAt = String(formData.get("dropoffAt") || "");
  const pickupAt = String(formData.get("pickupAt") || "");
  const prescreenNotes = String(formData.get("prescreenNotes") || "").trim();

  if (!submissionId || !Object.values(SubmissionStatus).includes(status)) {
    throw new Error("Invalid submission update.");
  }
  if (status === "CANCELLED") throw new Error("Use Cancel order to confirm cancellation separately.");

  const dropoffDate = parseDateTime(dropoffAt.slice(0, 10), dropoffAt.slice(11));
  const pickupDate = parseDateTime(pickupAt.slice(0, 10), pickupAt.slice(11));

  if (
    !dropoffDate ||
    !pickupDate ||
    pickupDate <= dropoffDate ||
    !isPickupDropoffTimeAllowed(dropoffAt.slice(11,16), dropoffAt.slice(0,10)) ||
    !isPickupDropoffTimeAllowed(pickupAt.slice(11,16), pickupAt.slice(0,10))
  ) {
    throw new Error("Invalid date or price.");
  }

  dateRange(dateKey(dropoffDate), dateKey(pickupDate));
  await prisma.$transaction(async (tx) => {
    await lockCapacity(tx);
    const current = await tx.submission.findUniqueOrThrow({
      where: { id: submissionId },
      include: { submissionPets: true },
    });
    if (Number(formData.get("revision")) !== current.revision) throw new Error("This booking changed. Refresh before editing.");
    if (current.status === "CANCELLED") throw new Error("This booking is cancelled. Create a new request instead.");
    const expectedStatus = formData.get("expectedStatus");
    if (expectedStatus && expectedStatus !== current.status) throw new Error("This booking changed. Refresh before editing.");
    const withinConfirmedStay = current.status === "ACCEPTED" &&
      dropoffDate >= (current.acceptedDropoffAt ?? current.dropoffAt) &&
      pickupDate <= (current.acceptedPickupAt ?? current.pickupAt);
    if (status === "ACCEPTED" && !withinConfirmedStay)
      await assertCapacity(
        tx,
        dropoffDate,
        pickupDate,
        Math.max(1, current.submissionPets.length),
        current.id,
      );
    const settings = await getSettings(tx);
    await archiveSubmissionRevision(tx, current);
    const terms = storedDogTerms(current);
    for (const [index, term] of terms.entries()) {
      for (const kind of ["lateDropoff", "earlyPickup"] as const) {
        const key = `${kind}${index + 1}`;
        if (!formData.has(key) || !current.submissionPets.length) continue;
        const value = String(formData.get(key) || "");
        const parsed = parseDateTime(value.slice(0, 10), value.slice(11));
        if (value && (!parsed || parsed < dropoffDate || parsed > pickupDate))
          throw new Error("Each dog's actual arrival and pickup must fall within the stay.");
        term[`${kind}At`] = value || undefined;
      }
    }
    const rewardState = status === "ACCEPTED" ? await rewardOnAcceptance(tx, current) : current.rewardState;
    const pricing = await repriceAdminSubmission(tx, current, {
      ...formValuesFromSubmission(current),
      dropoffDate: dropoffAt.slice(0, 10),
      dropoffTime: dropoffAt.slice(11, 16),
      pickupDate: pickupAt.slice(0, 10),
      pickupTime: pickupAt.slice(11, 16),
      prescreenNotes,
    }, status, terms);
    await tx.submission.update({
      where: { id: submissionId },
      data: {
        status,
        ...pricing,
        rewardState,
        holdExpiresAt:
          current.holdExpiresAt === null
            ? null
            : new Date(Date.now() + settings.holdHours * 3600000),
        dropoffAt: dropoffDate,
        pickupAt: pickupDate,
        prescreenNotes: prescreenNotes || null,
      },
    });
    await reconcileRewardHolds(tx, current.customerId);
  });

  let receiptSentTo: string | undefined;
  let receiptError = false;
  try {
    receiptSentTo = await sendLatestSubmissionReceipt(submissionId);
  } catch {
    receiptError = true;
  }

  revalidateBooking(submissionId);

  return { submissionId, receiptSentTo, receiptError };
}

export async function updateSubmissionAction(formData: FormData) {
  const result = await updateSubmissionInternal(formData);
  if (result.receiptError) {
    throw new Error(
      "Order was saved, but one or more customer or admin emails could not be sent.",
    );
  }
}

export async function updateSubmissionActionWithState(
  _prevState: AdminFormState | null,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const result = await updateSubmissionInternal(formData);
    if (result.receiptError) {
      return {
        ok: false,
        error:
          "Order was saved, but one or more customer or admin emails could not be sent. Check the email settings or log, then save again to retry.",
      };
    }
    return {
      ok: true,
      message: result.receiptSentTo
        ? `Order updated. The latest receipt was sent to ${result.receiptSentTo}, and an update notification was sent to the admins.`
        : "Order updated. The latest receipt was sent to the customer, and an update notification was sent to the admins.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update order.",
    };
  }
}

export async function updateCustomerPetAction(formData: FormData) {
  await requireAdmin();

  const submissionId = String(formData.get("submissionId") || "");
  const customerId = String(formData.get("customerId") || "");
  const petId = String(formData.get("petId") || "");
  const secondPetId = String(formData.get("secondPetId") || "");
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const backupContact = String(formData.get("backupContact") || "").trim();
  const emergencyContactName = String(
    formData.get("emergencyContactName") || "",
  ).trim();
  const emergencyContactPhone = String(
    formData.get("emergencyContactPhone") || "",
  ).trim();
  const wechatId = String(formData.get("wechatId") || "").trim();
  const petName = String(formData.get("petName") || "").trim();
  const petBreed = String(formData.get("petBreed") || "").trim();
  const petWeightLb = Number(formData.get("petWeightLb") || "");
  const petAgeYearsRaw = String(formData.get("petAgeYears") || "").trim();
  const petAgeYears = petAgeYearsRaw ? Number(petAgeYearsRaw) : null;
  const secondPetName = String(formData.get("secondPetName") || "").trim();
  const secondPetBreed = String(formData.get("secondPetBreed") || "").trim();
  const secondPetWeightLb = Number(formData.get("secondPetWeightLb") || "");
  const secondPetAgeYearsRaw = String(
    formData.get("secondPetAgeYears") || "",
  ).trim();
  const secondPetAgeYears = secondPetAgeYearsRaw
    ? Number(secondPetAgeYearsRaw)
    : null;

  if (
    !submissionId ||
    !customerId ||
    !petId ||
    !firstName ||
    !lastName ||
    !email ||
    !phone ||
    !backupContact ||
    !emergencyContactName ||
    !emergencyContactPhone ||
    !petName ||
    !petBreed ||
    !petAgeYearsRaw ||
    !Number.isFinite(petWeightLb) ||
    petWeightLb <= 0 ||
    (petAgeYears !== null &&
      (!Number.isFinite(petAgeYears) || petAgeYears < 0)) ||
    (secondPetId &&
      (!secondPetName ||
        !secondPetBreed ||
        !secondPetAgeYearsRaw ||
        !Number.isFinite(secondPetWeightLb) ||
        secondPetWeightLb <= 0 ||
        (secondPetAgeYears !== null &&
          (!Number.isFinite(secondPetAgeYears) || secondPetAgeYears < 0))))
  ) {
    throw new Error("Invalid customer or pet update.");
  }

  await prisma.$transaction(async (tx) => {
    await lockCapacity(tx);
    const current = await tx.submission.findUniqueOrThrow({
      where: { id: submissionId },
      include: { submissionPets: true },
    });
    if (Number(formData.get("revision")) !== current.revision) {
      throw new Error("This booking changed. Refresh before editing.");
    }
    if (current.status === "CANCELLED") throw new Error("This booking is cancelled. Its order details cannot be edited.");
    if (current.customerId !== customerId || current.petId !== petId ||
        (current.submissionPets.find(pet => pet.position === 2)?.petId || "") !== secondPetId) {
      throw new Error("Customer or dogs do not match this booking. Refresh before editing.");
    }
    await lockCustomerProfile(tx, customerId);
    const existingCustomer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
    const values = {
      ...formValuesFromSubmission(current),
      firstName, lastName, email, phone, backupContact, emergencyContactName, emergencyContactPhone, wechatId,
      petName, petBreed, petWeightLb: String(petWeightLb), petAgeYears: petAgeYearsRaw,
      secondPetName, secondPetBreed, secondPetWeightLb: String(secondPetWeightLb), secondPetAgeYears: secondPetAgeYearsRaw,
    };
    await archiveSubmissionRevision(tx, current);
    const pricing = await repriceAdminSubmission(tx, current, values);
    await tx.customer.update({
      where: { id: customerId },
      data: {
        ...(existingCustomer.phone !== phone
          ? { smsMarketingOptIn: false }
          : {}),
        ...(existingCustomer.email !== email
          ? { emailMarketingOptIn: false }
          : {}),
        firstName,
        lastName,
        email,
        phone,
        backupContact,
        emergencyContactName,
        emergencyContactPhone,
        wechatId: wechatId || null,
      },
    });
    await tx.pet.update({
      where: { id: petId },
      data: {
        name: petName,
        breed: petBreed,
        weightLb: petWeightLb,
        ageYears: petAgeYears,
      },
    });
    if (secondPetId) {
      await tx.pet.update({
        where: { id: secondPetId },
        data: {
          name: secondPetName,
          breed: secondPetBreed,
          weightLb: secondPetWeightLb,
          ageYears: secondPetAgeYears,
        },
      });
    }
    await tx.submission.update({
      where: { id: submissionId },
      data: {
        ...pricing,
        customerSnapshot: buildCustomerSnapshot(values) as unknown as Prisma.InputJsonValue,
        petSnapshot: buildPetSnapshots(values)[0] as unknown as Prisma.InputJsonValue,
      },
    });
  });

  revalidateBooking(submissionId);
  try {
    await sendLatestSubmissionReceipt(submissionId);
  } catch {
    throw new Error("Customer and dogs were saved and the price recalculated, but the update email could not be sent. Check the email log.");
  }
}

export async function updateCustomerPetActionWithState(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    await updateCustomerPetAction(formData);
    return { message: "Customer and dogs updated. The order price was recalculated and the latest receipt sent." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update customer and dogs." };
  }
}

export async function cancelSubmissionActionWithState(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  if (formData.get("confirmCancellation") !== "on") {
    return { error: "Confirm that you want to cancel this order. Refunds must be handled separately." };
  }
  const submissionId = String(formData.get("submissionId") || "");
  const revision = Number(formData.get("revision"));
  const expectedStatus = String(formData.get("expectedStatus") || "") as SubmissionStatus;
  if (!submissionId || !Number.isInteger(revision) || revision < 1 || !Object.values(SubmissionStatus).includes(expectedStatus)) {
    return { error: "Invalid cancellation request. Refresh before continuing." };
  }
  try {
    const booking = await cancelAdminBooking(submissionId, revision, expectedStatus);
    revalidateBooking(submissionId);
    const scheduled = await scheduleCancellationConfirmation(booking);
    return scheduled
      ? { message: "Order cancelled and availability released. The confirmation email will be sent in the background. Refunds are handled separately." }
      : { error: "Order cancelled and availability released, but the confirmation email could not be scheduled. Check the email log and contact the customer. Refunds are handled separately." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to cancel order." };
  }
}
