import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reservesCapacity } from "@/lib/platform/rules";
import { marketingConfig } from "./config";
import {
  holidays,
  holidaySchedule,
  emailContent,
  type Holiday,
} from "./templates";
import { unsubscribeToken } from "./unsubscribe";
import { deliverEmail, ProviderError, type EmailPayload } from "./provider";

export async function syncHolidayCampaigns(now = new Date()) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(17317003)::text`;
    const rules = await tx.marketingRule.findMany({ where: { enabled: true } });
    for (const rule of rules) {
      if (!(rule.holiday in holidays)) continue;
      const holiday = rule.holiday as Holiday;
      for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
        const schedule = holidaySchedule(holiday, year);
        // Enabling a rule does not send retroactive promotions.
        if (schedule.scheduledAt < now) continue;
        await tx.marketingCampaign.upsert({
          where: { annualKey: `${holiday}-${year}` },
          update: {},
          create: {
            annualKey: `${holiday}-${year}`,
            name: `${holidays[holiday].name} ${year}`,
            subject: rule.subject,
            body: rule.body,
            ...schedule,
            status: "SCHEDULED",
            createdBy: rule.updatedBy,
          },
        });
      }
    }
  });
}

export async function runMarketing(
  options: {
    send?: typeof deliverEmail;
    now?: Date;
    budgetMs?: number;
    limit?: number;
  } = {},
) {
  const config = marketingConfig();
  if (!config.enabled || !config.ready)
    return { processed: 0, disabled: true, missing: config.missing };
  const now = options.now || new Date();
  const run = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(17317002)::text`;
    const active = await tx.marketingRun.findFirst({
      where: {
        finishedAt: null,
        startedAt: { gt: new Date(now.getTime() - 300000) },
      },
    });
    if (active) return null;
    await tx.marketingRun.updateMany({
      where: { finishedAt: null },
      data: {
        finishedAt: now,
        error:
          "Previous worker stopped before completion. In-flight messages need review.",
      },
    });
    await tx.marketingDelivery.updateMany({
      where: {
        status: "SENDING",
        lastAttemptAt: { lt: new Date(now.getTime() - 300000) },
      },
      data: {
        status: "UNKNOWN",
        detail:
          "Worker stopped during sending. Check Sent mail; this message will not be automatically retried.",
      },
    });
    return tx.marketingRun.create({ data: { startedAt: now } });
  });
  if (!run) return { processed: 0, busy: true };
  let processed = 0;
  const deadline = Date.now() + (options.budgetMs ?? 45000);
  try {
    await syncHolidayCampaigns(now);
    const due = await prisma.marketingCampaign.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    });
    for (const campaign of due) {
      await prisma.$transaction(async (tx) => {
        // Compare-and-set lets pause/cancel win if it happened before this transaction.
        const claimed = await tx.marketingCampaign.updateMany({
          where: { id: campaign.id, status: "SCHEDULED" },
          data: { status: "RUNNING", startedAt: now },
        });
        if (!claimed.count) return;
        if (campaign.excludeStart <= now.toISOString().slice(0, 10)) {
          await tx.marketingCampaign.update({
            where: { id: campaign.id },
            data: { status: "CANCELLED", completedAt: now },
          });
          return;
        }
        const customers = await tx.customer.findMany({
          where: { emailMarketingOptIn: true },
          select: { id: true, email: true },
        });
        await tx.marketingDelivery.createMany({
          data: customers.map((c) => ({
            campaignId: campaign.id,
            customerId: c.id,
            email: c.email,
          })),
          skipDuplicates: true,
        });
      });
    }
    while (processed < (options.limit ?? 40) && Date.now() < deadline) {
      const item = await prisma.marketingDelivery.findFirst({
        where: {
          status: "PENDING",
          nextAttemptAt: { lte: new Date() },
          campaign: { status: "RUNNING" },
        },
        orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
        include: { campaign: true },
      });
      if (!item) break;
      const claimed = await prisma.marketingDelivery.updateMany({
        where: {
          id: item.id,
          status: "PENDING",
          campaign: { status: "RUNNING" },
        },
        data: {
          status: "SENDING",
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          ...(!item.firstAttemptAt ? { firstAttemptAt: new Date() } : {}),
        },
      });
      if (!claimed.count) continue;
      processed++;
      const customer = await prisma.customer.findUnique({
        where: { id: item.customerId },
        include: {
          submissions: {
            where: {
              dropoffAt: {
                lte: new Date(`${item.campaign.excludeEnd}T23:59:59.999Z`),
              },
              pickupAt: {
                gte: new Date(`${item.campaign.excludeStart}T00:00:00Z`),
              },
            },
            include: { submissionPets: true, payments: true },
          },
        },
      });
      const suppression = await prisma.marketingSuppression.findUnique({
        where: { email: item.email.toLowerCase() },
      });
      const current = await prisma.marketingCampaign.findUniqueOrThrow({
        where: { id: item.campaignId },
      });
      if (["PAUSED", "CANCELLED"].includes(current.status)) {
        await prisma.marketingDelivery.update({
          where: { id: item.id },
          data: {
            status: current.status === "PAUSED" ? "PENDING" : "SKIPPED",
            detail: "Campaign paused or cancelled before delivery.",
          },
        });
        continue;
      }
      const reason = !customer?.emailMarketingOptIn
        ? "No longer subscribed."
        : customer.email !== item.email
          ? "Customer email changed."
          : suppression
            ? `Suppressed: ${suppression.reason}`
            : item.campaign.excludeStart <=
                new Date().toISOString().slice(0, 10)
              ? "Stay period has already started."
              : customer.submissions.some((s) => reservesCapacity(s))
                ? "Already has an active booking in this stay period."
                : null;
      if (reason) {
        await prisma.marketingDelivery.update({
          where: { id: item.id },
          data: { status: "SKIPPED", detail: reason },
        });
        continue;
      }
      const unsubscribeUrl = `${config.baseUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken(customer!.id, item.email))}`;
      const oneClickUrl = `${config.baseUrl}/api/marketing/unsubscribe?token=${encodeURIComponent(unsubscribeToken(customer!.id, item.email))}`;
      const payload: EmailPayload = item.payload
        ? (item.payload as unknown as EmailPayload)
        : {
            from: config.from,
            to: [item.email],
            subject: item.campaign.subject,
            ...emailContent(
              item.campaign.body,
              `${config.baseUrl}/book`,
              unsubscribeUrl,
              config.address,
            ),
            headers: {
              "List-Unsubscribe": `<${oneClickUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          };
      await prisma.marketingDelivery.update({
        where: { id: item.id },
        data: { payload: payload as unknown as Prisma.InputJsonValue },
      });
      try {
        const providerId = await (options.send || deliverEmail)(
          payload,
          item.id,
        );
        await prisma.marketingDelivery.update({
          where: { id: item.id },
          data: {
            status: "ACCEPTED",
            providerId,
            detail: "Accepted by SMTP server. Inbox delivery is not confirmed.",
          },
        });
      } catch (error) {
        const known = error instanceof ProviderError;
        const ambiguous = !known || error.ambiguous;
        const retry =
          known && error.retryable && !ambiguous && item.attempts < 2;
        await prisma.marketingDelivery.update({
          where: { id: item.id },
          data: {
            status: ambiguous ? "UNKNOWN" : retry ? "PENDING" : "FAILED",
            detail: known
              ? error.message
              : "Sending interrupted; check Sent mail before taking any further action.",
            nextAttemptAt: new Date(Date.now() + 3600000),
          },
        });
      }
    }
    const running = await prisma.marketingCampaign.findMany({
      where: { status: "RUNNING" },
      select: { id: true },
    });
    for (const c of running) {
      const pending = await prisma.marketingDelivery.count({
        where: { campaignId: c.id, status: { in: ["PENDING", "SENDING"] } },
      });
      if (!pending)
        await prisma.marketingCampaign.updateMany({
          where: { id: c.id, status: "RUNNING" },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
    }
    await prisma.requestRateLimit.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await prisma.marketingRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), processed },
    });
    return { processed };
  } catch (error) {
    await prisma.marketingRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        processed,
        error:
          "Marketing worker stopped. Check server logs and delivery records.",
      },
    });
    throw error;
  }
}
