"use server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { lockCapacity } from "@/lib/platform/capacity";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
export async function setBookingBlock(_state: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {error:"Enter a valid email."};
  if (!["true", "false"].includes(String(form.get("blocked")))) return {error:"Choose Block or Unblock."};
  const blocked = form.get("blocked") === "true";
  const reason = String(form.get("reason") || "").trim().slice(0,1000);
  await prisma.$transaction(async tx => {
    await lockCapacity(tx);
    await tx.bookingBlocklist.upsert({where:{email},create:{email,blocked,reason,updatedBy:admin.email},update:{blocked,reason,updatedBy:admin.email}});
    await tx.bookingBlocklistEvent.create({data:{email,blocked,reason,actorEmail:admin.email}});
  });
  revalidatePath("/admin/customers");
  return {message:blocked ? "Booking block saved." : "Booking block removed."};
}
