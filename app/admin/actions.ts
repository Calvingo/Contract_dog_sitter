"use server";

import { SubmissionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearAdminSession, getAdminSession } from "@/lib/auth/admin-session";
import { processAdminSubmissionDecision } from "@/lib/admin/decision";
import { prisma } from "@/lib/db";
import {
  formValuesFromSubmission,
  getSubmissionQuote,
  type SubmissionQuote,
} from "@/lib/submission-data";
import { sendSubmissionEmails } from "@/lib/email";
import type { DecisionAction } from "@/lib/decision-emails";
import { signatureToBuffer } from "@/lib/validate";
import { DEPOSIT_PERCENT } from "@/lib/pricing";

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

  if (!submissionId || !["accept", "reject", "meet_greet"].includes(action)) {
    throw new Error("Invalid admin decision.");
  }

  await processAdminSubmissionDecision({
    submissionId,
    action,
    adminEmail: session.email,
    meetGreetAt: meetGreetAt || undefined,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/submissions/${submissionId}`);
}

export type AdminFormState = {
  ok?: boolean;
  message?: string;
  error?: string;
};

function buildAdminReceiptQuote(
  values: Parameters<typeof getSubmissionQuote>[0],
  quotedTotal: number
): SubmissionQuote {
  const latestQuote = getSubmissionQuote(values);
  return {
    ...latestQuote,
    totalPrice: quotedTotal,
    depositAmount: Math.round(
      quotedTotal * (DEPOSIT_PERCENT / 100) * 100
    ) / 100,
  };
}

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

  await sendSubmissionEmails(values, signatureToBuffer(submission.signatureData), submission.id, {
    revision: submission.revision,
    isUpdate: true,
    quote: buildAdminReceiptQuote(values, submission.quotedTotal.toNumber()),
    sendAdminNotification: false,
  });

  return values.email;
}

async function updateSubmissionInternal(formData: FormData) {
  await requireAdmin();

  const submissionId = String(formData.get("submissionId") || "");
  const status = String(formData.get("status") || "") as SubmissionStatus;
  const dropoffAt = String(formData.get("dropoffAt") || "");
  const pickupAt = String(formData.get("pickupAt") || "");
  const quotedTotal = String(formData.get("quotedTotal") || "");
  const prescreenNotes = String(formData.get("prescreenNotes") || "").trim();

  if (!submissionId || !Object.values(SubmissionStatus).includes(status)) {
    throw new Error("Invalid submission update.");
  }

  const dropoffDate = new Date(dropoffAt);
  const pickupDate = new Date(pickupAt);
  const quotedTotalNumber = Number(quotedTotal);

  if (
    Number.isNaN(dropoffDate.getTime()) ||
    Number.isNaN(pickupDate.getTime()) ||
    pickupDate <= dropoffDate ||
    !Number.isFinite(quotedTotalNumber) ||
    quotedTotalNumber < 0
  ) {
    throw new Error("Invalid date or price.");
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      status,
      dropoffAt: dropoffDate,
      pickupAt: pickupDate,
      quotedTotal: quotedTotalNumber,
      prescreenNotes: prescreenNotes || null,
      lastEditedAt: new Date(),
      revision: { increment: 1 },
    },
  });

  let receiptSentTo: string | undefined;
  let receiptError = false;
  try {
    receiptSentTo = await sendLatestSubmissionReceipt(submissionId);
  } catch {
    receiptError = true;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/submissions/${submissionId}`);

  return { submissionId, receiptSentTo, receiptError };
}

export async function updateSubmissionAction(formData: FormData) {
  const result = await updateSubmissionInternal(formData);
  if (result.receiptError) {
    throw new Error(
      "Order was saved, but the latest receipt could not be emailed to the customer."
    );
  }
}

export async function updateSubmissionActionWithState(
  _prevState: AdminFormState | null,
  formData: FormData
): Promise<AdminFormState> {
  try {
    const result = await updateSubmissionInternal(formData);
    if (result.receiptError) {
      return {
        ok: false,
        error:
          "Order was saved, but the latest receipt could not be emailed. Check the email settings or log, then save again to retry.",
      };
    }
    return {
      ok: true,
      message: result.receiptSentTo
        ? `Order updated and the latest receipt was sent to ${result.receiptSentTo}.`
        : "Order updated and the latest receipt was sent to the customer.",
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
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const backupContact = String(formData.get("backupContact") || "").trim();
  const emergencyContactName = String(formData.get("emergencyContactName") || "").trim();
  const emergencyContactPhone = String(formData.get("emergencyContactPhone") || "").trim();
  const wechatId = String(formData.get("wechatId") || "").trim();
  const petName = String(formData.get("petName") || "").trim();
  const petBreed = String(formData.get("petBreed") || "").trim();
  const petWeightLb = Number(formData.get("petWeightLb") || "");
  const petAgeYearsRaw = String(formData.get("petAgeYears") || "").trim();
  const petAgeYears = petAgeYearsRaw ? Number(petAgeYearsRaw) : null;
  const secondPetName = String(formData.get("secondPetName") || "").trim();
  const secondPetBreed = String(formData.get("secondPetBreed") || "").trim();
  const secondPetWeightLb = Number(formData.get("secondPetWeightLb") || "");
  const secondPetAgeYearsRaw = String(formData.get("secondPetAgeYears") || "").trim();
  const secondPetAgeYears = secondPetAgeYearsRaw ? Number(secondPetAgeYearsRaw) : null;

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
    !Number.isFinite(petWeightLb) ||
    petWeightLb <= 0 ||
    (petAgeYears !== null && (!Number.isFinite(petAgeYears) || petAgeYears < 0))
    || (secondPetId && (!secondPetName || !secondPetBreed || !Number.isFinite(secondPetWeightLb) || secondPetWeightLb <= 0 || (secondPetAgeYears !== null && (!Number.isFinite(secondPetAgeYears) || secondPetAgeYears < 0))))
  ) {
    throw new Error("Invalid customer or pet update.");
  }

  const updates = [
    prisma.customer.update({
      where: { id: customerId },
      data: {
        firstName,
        lastName,
        email,
        phone,
        backupContact,
        emergencyContactName,
        emergencyContactPhone,
        wechatId: wechatId || null,
      },
    }),
    prisma.pet.update({
      where: { id: petId },
      data: {
        name: petName,
        breed: petBreed,
        weightLb: petWeightLb,
        ageYears: petAgeYears,
      },
    }),
  ];
  if (secondPetId) {
    updates.push(prisma.pet.update({
      where: { id: secondPetId },
      data: { name: secondPetName, breed: secondPetBreed, weightLb: secondPetWeightLb, ageYears: secondPetAgeYears },
    }));
  }
  await prisma.$transaction(updates);

  revalidatePath("/admin");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/submissions/${submissionId}`);
}
