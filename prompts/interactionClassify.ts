import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { CLASSIFICATION_CATEGORIES } from "@/lib/interactionTypes";

const SYSTEM = `You classify inbound social media messages (comments/DMs) for a brand,
which may be in the HOUSING / real-estate / mortgage space. Be accurate and cautious.

Allowed categories (pick ALL that apply): ${CLASSIFICATION_CATEGORIES.join(", ")}.

Treat as higher compliance risk and likely "human_approval_required" any message about:
mortgage approval, loan approval, interest rates, lowest/best rate, guarantees,
legal advice, eviction, tenant rights, human rights / fair housing, credit score,
debt consolidation, private lending, investment returns, complaints/disputes, or
personal financial details.

Respond with ONE JSON object, no markdown, EXACTLY this shape:
{
  "categories": string[],
  "intent_summary": string,
  "lead_potential": "none" | "low" | "medium" | "high",
  "urgency": "low" | "medium" | "high",
  "compliance_risk": "low" | "medium" | "high",
  "human_approval_required": boolean,
  "risk_reason": string,
  "suggested_next_action": string,
  "is_lead_candidate": boolean,
  "suggested_lead_category": string
}`;

export function buildClassifyMessages(args: {
  message: string;
  platform: string;
  interactionType: string;
  brandName: string;
  complianceNotes?: string | null;
}): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Brand: ${args.brandName}
${args.complianceNotes ? `Compliance notes: ${args.complianceNotes}` : ""}
Platform: ${args.platform}
Interaction type: ${args.interactionType}

MESSAGE TO CLASSIFY:
"""${args.message}"""

Classify it now as the specified JSON object.`,
    },
  ];
}
