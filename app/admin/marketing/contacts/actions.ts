"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { changeMarketingContact } from "@/lib/marketing/contacts";

export async function manageMarketingContact(_state: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requirePlatformAdmin();
  const action = String(form.get("action") || "");
  try {
    await changeMarketingContact(String(form.get("customerId") || "").trim(), action, admin.email);
    revalidatePath("/admin/marketing", "layout");
    revalidatePath("/admin/customers");
    revalidatePath("/account/profile");
    return { message: action === "enable" ? "Promotions enabled."
      : action === "delete" ? "Email deleted from the marketing list. You can restore it under Deleted emails."
      : action === "restore" ? "Email restored. Promotions remain blocked until you enable them."
      : "Promotions blocked. Pending promotional emails have been skipped." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update this email. Please try again." };
  }
}
