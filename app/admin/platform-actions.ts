"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import {
  lockCapacity,
} from "@/lib/platform/capacity";
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
