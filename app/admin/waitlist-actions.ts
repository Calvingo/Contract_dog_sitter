"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { prisma } from "@/lib/db";
import type { ActionState } from "@/components/ActionForm";

export async function acknowledgeWaitlistAlert(_state: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  await prisma.waitlistAlert.updateMany({
    where: { id: String(form.get("id") || ""), acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedBy: admin.email },
  });
  for (const path of ["/admin", "/admin/requests", "/admin/calendar"]) revalidatePath(path);
  return { message: "Reminder reviewed. Waiting-list requests are unchanged." };
}
