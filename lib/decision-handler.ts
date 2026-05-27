import {
  decisionActionLabel,
  sendDecisionEmail,
  type DecisionAction,
} from "./decision-emails";
import { verifyDecisionToken } from "./token";

const VALID_ACTIONS: DecisionAction[] = ["accept", "reject", "meet_greet"];

export type DecisionResult =
  | { ok: true; action: DecisionAction; owner: string; email: string; petName: string }
  | { ok: false; status: number; title: string; message: string };

export async function processDecision(
  token: string | null,
  action: string | null
): Promise<DecisionResult> {
  if (!token || !action || !VALID_ACTIONS.includes(action as DecisionAction)) {
    return {
      ok: false,
      status: 400,
      title: "Invalid link",
      message:
        "This decision link is invalid. Please use the buttons in the admin email, or open the plain link below each button.",
    };
  }

  const payload = verifyDecisionToken(token);
  if (!payload) {
    return {
      ok: false,
      status: 403,
      title: "Link expired or invalid",
      message:
        "This link has expired, was already used with an old deployment, or APP_SECRET changed. Ask the customer to resubmit, or contact them directly.",
    };
  }

  const decisionAction = action as DecisionAction;
  await sendDecisionEmail(payload, decisionAction);

  const owner = `${payload.firstName} ${payload.lastName}`.trim();
  const label = decisionActionLabel(decisionAction);

  return {
    ok: true,
    action: decisionAction,
    owner,
    email: payload.email,
    petName: payload.petName,
  };
}

export function decisionResultMessage(result: DecisionResult): {
  title: string;
  message: string;
  success: boolean;
} {
  if (result.ok) {
    return {
      success: true,
      title: decisionActionLabel(result.action),
      message: `A notification email has been sent to ${result.owner} (${result.email}) regarding ${result.petName}.`,
    };
  }
  return {
    success: false,
    title: result.title,
    message: result.message,
  };
}
