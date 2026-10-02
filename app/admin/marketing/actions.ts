"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import type { ActionState } from "@/components/ActionForm";
import { marketingConfig } from "@/lib/marketing/config";
import {
  holidays,
  validateCampaign,
  type Holiday,
} from "@/lib/marketing/templates";
import { syncHolidayCampaigns } from "@/lib/marketing/worker";
const text = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();
function refresh() {
  revalidatePath("/admin/marketing", "layout");
}
function readiness() {
  const config = marketingConfig();
  if (!config.ready || !config.enabled)
    throw new Error(
      `Sending is disabled. ${config.missing.length ? `Configure ${config.missing.join(", ")}.` : "Set MARKETING_ENABLED=true after checking the sender settings."}`,
    );
}
function failure(error: unknown): ActionState {
  return {
    error: error instanceof Error ? error.message : "Unable to save campaign.",
  };
}
export async function saveCampaign(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  try {
    const data = {
      name: text(form, "name"),
      subject: text(form, "subject"),
      body: text(form, "body"),
      excludeStart: text(form, "excludeStart"),
      excludeEnd: text(form, "excludeEnd"),
      scheduledAt: new Date(`${text(form, "sendDate")}T17:00:00Z`),
    };
    validateCampaign(data);
    const id = text(form, "id");
    if (id) {
      const result = await prisma.marketingCampaign.updateMany({
        where: { id, status: "DRAFT" },
        data,
      });
      if (!result.count)
        throw new Error(
          "Only drafts can be edited. Refresh to see the current status.",
        );
    } else
      await prisma.marketingCampaign.create({
        data: { ...data, createdBy: admin.email },
      });
    refresh();
    return {
      message:
        "Draft saved. Open it below to preview the email and schedule sending.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function campaignAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  try {
    const id = text(form, "id"),
      action = text(form, "action");
    await prisma.$transaction(async (tx) => {
      const campaign = await tx.marketingCampaign.findUniqueOrThrow({
        where: { id },
      });
      if (action === "schedule" || action === "resume") {
        readiness();
        if (form.get("confirmed") !== "on")
          throw new Error(
            "Confirm the email content, eligible audience and sending date before scheduling.",
          );
        if (
          action === "schedule"
            ? campaign.status !== "DRAFT"
            : campaign.status !== "PAUSED"
        )
          throw new Error("Campaign status changed. Refresh the page.");
        if (campaign.excludeStart <= new Date().toISOString().slice(0, 10))
          throw new Error("The stay period has already started.");
        if (action === "schedule" && campaign.scheduledAt < new Date())
          throw new Error("Choose a future sending date before scheduling.");
        const updated = await tx.marketingCampaign.updateMany({
          where: { id, status: campaign.status },
          data: { status: campaign.startedAt ? "RUNNING" : "SCHEDULED" },
        });
        if (!updated.count)
          throw new Error("Campaign status changed. Refresh the page.");
      } else if (action === "pause") {
        await tx.marketingCampaign.updateMany({
          where: { id, status: { in: ["SCHEDULED", "RUNNING"] } },
          data: { status: "PAUSED" },
        });
      } else if (action === "cancel") {
        await tx.marketingCampaign.updateMany({
          where: {
            id,
            status: { in: ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED"] },
          },
          data: { status: "CANCELLED", completedAt: new Date() },
        });
        await tx.marketingDelivery.updateMany({
          where: { campaignId: id, status: "PENDING" },
          data: { status: "SKIPPED", detail: "Campaign cancelled." },
        });
      } else throw new Error("Unknown action.");
    });
    refresh();
    return {
      message:
        "Campaign updated. A message already being sent may finish; all remaining recipients follow the new status.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function saveHolidayRule(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  try {
    const holiday = text(form, "holiday") as Holiday;
    if (!(holiday in holidays)) throw new Error("Choose a supported holiday.");
    const enabled = form.get("enabled") === "on",
      subject = text(form, "subject"),
      body = text(form, "body");
    if (
      !subject ||
      subject.length > 150 ||
      /[\r\n]/.test(subject) ||
      body.length < 10 ||
      body.length > 10000
    )
      throw new Error("Check the email subject and message length.");
    if (enabled) {
      readiness();
      if (form.get("confirmed") !== "on")
        throw new Error("Confirm automatic sending before enabling this rule.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(17317003)::text`;
      await tx.marketingRule.upsert({
        where: { holiday },
        create: { holiday, enabled, subject, body, updatedBy: admin.email },
        update: { enabled, subject, body, updatedBy: admin.email },
      });
      if (!enabled)
        await tx.marketingCampaign.updateMany({
          where: {
            annualKey: { startsWith: `${holiday}-` },
            status: { in: ["SCHEDULED", "RUNNING"] },
          },
          data: { status: "PAUSED" },
        });
      else
        await tx.marketingCampaign.updateMany({
          where: {
            annualKey: { startsWith: `${holiday}-` },
            status: "SCHEDULED",
            startedAt: null,
          },
          data: { subject, body },
        });
    });
    if (enabled) await syncHolidayCampaigns();
    refresh();
    return {
      message: enabled
        ? "Annual rule enabled. Future holiday campaigns are listed below; past sending dates are skipped. Previously paused campaigns remain paused."
        : "Rule saved and disabled. Unfinished campaigns from this rule are paused.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function suppressEmail(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  const email = text(form, "email").toLowerCase(),
    reason = text(form, "reason").slice(0, 300);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !reason
  )
    return {
      error: "Enter an email and a reason, such as bounced or complaint.",
    };
  await prisma.marketingSuppression.upsert({
    where: { email },
    create: { email, reason },
    update: { reason },
  });
  refresh();
  return { message: "Address excluded from all future promotional emails." };
}
export async function resolveDelivery(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  const id = text(form, "id"),
    outcome = text(form, "outcome");
  if (
    form.get("checked") !== "on" ||
    !["accepted", "not-sent", "retry"].includes(outcome)
  )
    return { error: "Check the real mailbox and confirm the result." };
  const item = await prisma.marketingDelivery.findUniqueOrThrow({
    where: { id },
    include: { campaign: true },
  });
  if (outcome === "retry") {
    try {
      readiness();
    } catch (error) {
      return failure(error);
    }
    if (
      item.status !== "FAILED" ||
      ["CANCELLED", "PAUSED"].includes(item.campaign.status) ||
      item.campaign.excludeStart <= new Date().toISOString().slice(0, 10)
    )
      return {
        error:
          "Only failed deliveries in active, unexpired campaigns can be retried.",
      };
    await prisma.$transaction(async (tx) => {
      const updated = await tx.marketingDelivery.updateMany({
        where: { id, status: "FAILED" },
        data: {
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: new Date(),
          detail:
            "Admin verified the message was not sent and requested retry.",
        },
      });
      if (updated.count)
        await tx.marketingCampaign.updateMany({
          where: { id: item.campaignId, status: "COMPLETED" },
          data: { status: "RUNNING", completedAt: null },
        });
    });
  } else {
    await prisma.marketingDelivery.updateMany({
      where: { id, status: "UNKNOWN" },
      data: {
        status: outcome === "accepted" ? "ACCEPTED" : "FAILED",
        detail:
          outcome === "accepted"
            ? "Admin confirmed this message in Sent mail."
            : "Admin verified this message was not sent.",
      },
    });
  }
  refresh();
  return { message: "Delivery record updated." };
}
