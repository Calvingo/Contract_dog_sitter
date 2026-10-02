"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { restoreCustomerAccount } from "@/lib/services/customer-profile";

export async function restoreAccount(_state: ActionState, form: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const id = String(form.get("customerId") || "").trim();
  if (!id) return { error: "Choose an account to restore." };
  try {
    await restoreCustomerAccount(id);
    revalidatePath("/admin/customers");
    return { message: "Account restored. The customer can request a new sign-in link. Promotional subscriptions remain off." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to restore this account. Please try again." };
  }
}
