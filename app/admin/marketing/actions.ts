"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import type { ActionState } from "@/components/ActionForm";
import { getMarketingConfig, marketingConfig } from "@/lib/marketing/config";
import { sendCampaignTest } from "@/lib/marketing/test-email";
import {
  holidays,
  validateCampaign,
  type Holiday,
} from "@/lib/marketing/templates";
import { saveMarketingImage } from "@/lib/marketing/images";
import { runMarketing, syncHolidayCampaigns } from "@/lib/marketing/worker";
const text = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();

export async function saveMarketingSettings(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const postalAddress = text(form, "postalAddress");
  const enabled = form.get("enabled") === "on";
  if (
    !postalAddress ||
    postalAddress.length > 500 ||
    /[^\s]+@[^\s]+/.test(postalAddress)
  )
    return {
      error:
        "Enter your business street address or registered mailing box, including city, state and ZIP code.",
    };
  const config = marketingConfig({ postalAddress, enabled });
  if (enabled && (!config.ready || config.environmentPaused))
    return {
      error: `Save the address with sending turned off first. Complete deployment setup before enabling sending: ${config.missing.join(", ")}${config.environmentPaused ? " · deployment pause is active (MARKETING_ENABLED=false)" : ""}.`,
    };
  await prisma.marketingSettings.upsert({
    where: { id: "default" },
    create: { postalAddress, enabled, updatedBy: admin.email },
    update: { postalAddress, enabled, updatedBy: admin.email },
  });
  refresh();
  return {
    message: enabled
      ? "Sending enabled. Only campaigns you explicitly schedule will send."
      : "Settings saved. Promotional sending is paused; drafts and admin tests remain available.",
  };
}

export async function sendTestEmail(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  try {
    const message = await sendCampaignTest(text(form, "id"), admin.email);
    refresh();
    return { message };
  } catch (error) {
    return failure(error);
  }
}

export async function updateSubscriber(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const id = text(form, "customerId"),
    enabled = form.get("subscribed") === "on",
    reason = text(form, "reason");
  if (
    !id ||
    !reason ||
    reason.length > 250 ||
    (enabled && form.get("confirmed") !== "on")
  )
    return {
      error:
        "Record the customer's request and confirm permission before subscribing them.",
    };
  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUniqueOrThrow({ where: { id } });
    if (
      customer.emailMarketingOptIn === enabled &&
      customer.marketingConsentUpdatedAt
    )
      return;
    await tx.customer.update({
      where: { id },
      data: {
        emailMarketingOptIn: enabled,
        marketingConsentUpdatedAt: new Date(),
      },
    });
    await tx.marketingConsentEvent.create({
      data: {
        customerId: id,
        emailOptIn: enabled,
        smsOptIn: false,
        source: `admin:${admin.email}: ${reason}`,
      },
    });
  });
  refresh();
  revalidatePath("/admin/customers");
  revalidatePath("/account/profile");
  return {
    message:
      "Email preference saved. Suppressed addresses remain excluded from promotions.",
  };
}
function refresh() {
  revalidatePath("/admin/marketing", "layout");
}
async function readiness() {
  const config = await getMarketingConfig();
  if (!config.ready || !config.enabled)
    throw new Error(
      `Sending is disabled. ${config.missing.length ? `Configure ${config.missing.join(", ")}.` : config.environmentPaused ? "Remove the deployment pause (MARKETING_ENABLED=false)." : "Enable sending in Email settings after checking the sender settings."}`,
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
  let savedId = "";
  try {
    const data = {
      name: text(form, "name"),
      subject: text(form, "subject"),
      body: text(form, "body"),
      allCustomers: true,
      excludeStart: "",
      excludeEnd: "",
      scheduledAt: new Date(`${text(form, "sendDate")}T17:00:00Z`),
    };
    validateCampaign(data);
    const imagePath = await saveMarketingImage(form);
    const id = text(form, "id");
    if (id) {
      const result = await prisma.marketingCampaign.updateMany({
        where: { id, status: "DRAFT" },
        data: { ...data, imagePath },
      });
      if (!result.count)
        throw new Error(
          "Only drafts can be edited. Refresh to see the current status.",
        );
      savedId = id;
    } else
      savedId = (
        await prisma.marketingCampaign.create({
          data: { ...data, imagePath, createdBy: admin.email },
        })
      ).id;
    refresh();
  } catch (error) {
    return failure(error);
  }
  redirect(`/admin/marketing/campaigns/${savedId}`);
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
      if (action === "schedule" || action === "send" || action === "resume") {
        await readiness();
        if (form.get("confirmed") !== "on")
          throw new Error(
            "Confirm the email content, eligible audience and sending date before scheduling.",
          );
        if (
          action !== "resume"
            ? campaign.status !== "DRAFT"
            : campaign.status !== "PAUSED"
        )
          throw new Error("Campaign status changed. Refresh the page.");
        if (
          !campaign.allCustomers &&
          campaign.excludeStart <= new Date().toISOString().slice(0, 10)
        )
          throw new Error("The stay period has already started.");
        if (
          action === "schedule" &&
          campaign.scheduledAt.toISOString().slice(0, 10) <
            new Date().toISOString().slice(0, 10)
        )
          throw new Error("Choose a future sending date before scheduling.");
        const updated = await tx.marketingCampaign.updateMany({
          where: { id, status: campaign.status },
          data: {
            status: campaign.startedAt ? "RUNNING" : "SCHEDULED",
            ...(action === "send" ? { scheduledAt: new Date() } : {}),
          },
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
    if (action === "send") await runMarketing();
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
      await readiness();
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
      await readiness();
    } catch (error) {
      return failure(error);
    }
    if (
      item.status !== "FAILED" ||
      ["CANCELLED", "PAUSED"].includes(item.campaign.status) ||
      (!item.campaign.allCustomers &&
        item.campaign.excludeStart <= new Date().toISOString().slice(0, 10))
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
