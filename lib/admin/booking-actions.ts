import type { DecisionAction } from "@/lib/decision-emails";

export function bookingDecisionActions(status: string): DecisionAction[] {
  if (status === "PENDING" || status === "NEEDS_REVIEW")
    return ["accept", "reject", "meet_greet"];
  if (status === "MEET_GREET_REQUESTED") return ["accept", "reject"];
  return [];
}
