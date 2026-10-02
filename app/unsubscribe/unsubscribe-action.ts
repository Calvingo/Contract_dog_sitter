"use server";
import { unsubscribe } from "@/lib/marketing/unsubscribe";
import type { ActionState } from "@/components/ActionForm";
export async function unsubscribeAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  return (await unsubscribe(String(form.get("token") || "")))
    ? { message: "You are unsubscribed from promotional emails." }
    : {
        error: "This link is invalid. Please update your account preferences.",
      };
}
