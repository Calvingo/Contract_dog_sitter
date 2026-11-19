import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { availability, getSettings } from "@/lib/platform/capacity";
import { dateKey, dateRange, stayDates, todayKey } from "@/lib/platform/rules";
import { getAppBaseUrl } from "@/lib/app-url";
import { BRAND_NAME, getEnv, parseAdminEmails, sendMail } from "@/lib/mailer";
import { logEmail } from "@/lib/email-log";

export const waitingListWhere = {
  waitlistedAt: { not: null },
  status: { in: ["PENDING", "NEEDS_REVIEW", "MEET_GREET_REQUESTED"] },
} satisfies Prisma.SubmissionWhereInput;

async function candidates(tx: Prisma.TransactionClient) {
  return tx.submission.findMany({
    where: { ...waitingListWhere, cancellationRequestedAt: null, pickupAt: { gte: new Date(`${todayKey()}T00:00:00Z`) } },
    select: { id: true, dropoffAt: true, pickupAt: true },
  });
}

type CapacityDay = Awaited<ReturnType<typeof availability>>["days"][number];
type CapacitySnapshot = Map<string, CapacityDay>;

// A settings change can affect bookings years apart. Each read stays within the
// existing one-year availability limit and only retained dates are compared.
async function readDates(tx: Prisma.TransactionClient, dates: string[]): Promise<CapacitySnapshot> {
  const sorted = [...new Set(dates)].sort();
  const result: CapacitySnapshot = new Map();
  for (let i = 0; i < sorted.length;) {
    const start = sorted[i];
    let last = i;
    while (last + 1 < sorted.length && Date.parse(sorted[last + 1]) - Date.parse(start) <= 366 * 86400000) last++;
    const wanted = new Set(sorted.slice(i, last + 1));
    for (const day of (await availability(start, sorted[last], tx)).days) {
      if (wanted.has(day.date)) result.set(day.date, day);
    }
    i = last + 1;
  }
  return result;
}

// Call inside the capacity lock, before a write. Include pickup dates so changes
// to includePickupDay are also compared against the same pre-write snapshot.
export async function snapshotWaitlistCapacity(tx: Prisma.TransactionClient, affectedDates?: string[]) {
  const affected = affectedDates ? new Set(affectedDates) : null;
  const today = todayKey();
  const dates = (await candidates(tx)).flatMap(booking => dateRange(dateKey(booking.dropoffAt), dateKey(booking.pickupAt)))
    .filter(date => date >= today && (!affected || affected.has(date)));
  return readDates(tx, dates);
}

export async function recordWaitlistOpenings(
  tx: Prisma.TransactionClient,
  before: CapacitySnapshot,
  eventKey: string,
  reason: string,
) {
  if (!before.size) return undefined;
  const current = await readDates(tx, [...before.keys()]);
  const opened = [...current.values()].filter(day => {
    const prior = before.get(day.date)!;
    return !day.closed && day.remaining > (prior.closed ? 0 : prior.remaining);
  });
  if (!opened.length) return undefined;
  const settings = await getSettings(tx);
  const openedDates = new Set(opened.map(day => day.date));
  const matchedDates = new Set<string>();
  let candidateCount = 0;
  for (const booking of await candidates(tx)) {
    const matches = stayDates(booking.dropoffAt, booking.pickupAt, settings.includePickupDay).filter(date => openedDates.has(date));
    if (matches.length) {
      candidateCount++;
      matches.forEach(date => matchedDates.add(date));
    }
  }
  if (!candidateCount) return undefined;
  const dates = [...matchedDates].sort();
  const alert = await tx.waitlistAlert.upsert({
    where: { eventKey }, update: {},
    create: {
      eventKey, reason, dates, candidateCount,
      remaining: Object.fromEntries(dates.map(date => [date, current.get(date)!.remaining])),
    },
  });
  return alert.id;
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendWaitlistNotification(id: string) {
  // Claim once before SMTP. The durable dashboard notice survives crashes/mail
  // failures, while duplicate callbacks cannot send the same alert twice.
  const claimed = await prisma.waitlistAlert.updateMany({
    where: { id, emailAttemptedAt: null }, data: { emailAttemptedAt: new Date() },
  });
  if (!claimed.count) return;
  const alert = await prisma.waitlistAlert.findUniqueOrThrow({ where: { id } });
  const recipients = [...new Set(parseAdminEmails().map(email => email.trim().toLowerCase()))];
  const subject = `${BRAND_NAME} — Space available: review the waiting list`;
  let failed = false;
  for (const to of recipients.length ? recipients : ["unconfigured"]) {
    let error: unknown;
    try {
      if (to === "unconfigured") throw new Error("No administrator notification recipients configured.");
      const remaining = alert.remaining as Record<string, number>;
      const links = alert.dates.map(date => `<li>${escape(date)}: ${remaining[date]} space(s) at the time of this change. <a href="${escape(getAppBaseUrl())}/admin/requests?view=waitlist&amp;date=${date}">Review waiting list</a></li>`).join("");
      await sendMail({
        from: `"${BRAND_NAME}" <${getEnv("GMAIL_USER")}>`, to, subject,
        html: `<h2>Space has opened up</h2><p>${escape(alert.reason)}</p><ul>${links}</ul><p>${alert.candidateCount} waiting-list request(s) overlap these dates. Review current availability for the entire stay and contact the customers. No request has been automatically accepted.</p>`,
      });
    } catch (cause) { error = cause; failed = true; }
    try {
      await logEmail({ type: "ADMIN_NOTIFICATION", to, subject: `${subject} (${id})`, status: error ? "FAILED" : "SENT", error: error instanceof Error ? error.message : error ? String(error) : undefined });
    } catch (cause) { failed = true; console.error("Could not log waiting-list notification", { id, cause }); }
  }
  await prisma.waitlistAlert.update({ where: { id }, data: { emailFailed: failed, emailSentAt: failed ? null : new Date() } });
}

export async function scheduleWaitlistNotification(id?: string) {
  if (!id) return;
  try {
    after(async () => {
      try { await sendWaitlistNotification(id); }
      catch (error) {
        console.error("Waiting-list notification failed", { id, error });
        await prisma.waitlistAlert.update({ where: { id }, data: { emailFailed: true } });
      }
    });
  } catch (error) {
    // The capacity change and the dashboard alert are already committed.
    console.error("Unable to schedule waiting-list email", { id, error });
    try {
      await prisma.waitlistAlert.update({ where: { id }, data: { emailFailed: true } });
      await logEmail({ type: "ADMIN_NOTIFICATION", to: parseAdminEmails().join(", ") || "unconfigured",
        subject: `${BRAND_NAME} — Waiting-list reminder (${id})`, status: "FAILED",
        error: `Unable to schedule notification: ${error instanceof Error ? error.message : String(error)}` });
    }
    catch (cause) { console.error("Unable to record waiting-list email failure", { id, cause }); }
  }
}
