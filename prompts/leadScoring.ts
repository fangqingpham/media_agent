import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LEAD_CATEGORIES } from "@/lib/leadTypes";

const SYSTEM = `You score sales leads for a brand that may be in the HOUSING / real-estate /
mortgage space. Be realistic and cautious — do not inflate scores.

Score 0–100 weighing: buying intent, urgency, service fit, completeness of information,
clarity of need, risk/sensitivity, and whether follow-up is needed. A vague one-word
message ("Interested") should score LOW. A specific, urgent, well-described need with
contact details should score HIGH.

Map score to priority: 0–39 low, 40–64 medium, 65–84 high, 85–100 urgent (adjust by urgency).

Suggested categories (pick the closest): ${LEAD_CATEGORIES.join(", ")}.

Never promise rates, approvals, or guarantees in the follow-up message. For sensitive
financial/legal topics, the follow-up should invite a private, licensed professional review.

Respond with ONE JSON object, no markdown, EXACTLY this shape:
{
  "lead_score": number,                  // 0-100 integer
  "priority": "low" | "medium" | "high" | "urgent",
  "lead_category": string,               // closest category from the list
  "reason": string,                      // why this score
  "suggested_next_action": string,
  "suggested_follow_up_message": string, // safe, friendly; no guarantees/rates
  "missing_information_to_collect": string[]
}`;

export function buildScoringMessages(args: {
  brandName: string;
  message: string;
  intentSummary?: string | null;
  category?: string | null;
  platform?: string | null;
}): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Brand: ${args.brandName}
Platform: ${args.platform ?? "unknown"}
${args.category ? `Suggested category so far: ${args.category}` : ""}
${args.intentSummary ? `Intent summary: ${args.intentSummary}` : ""}

LEAD MESSAGE / CONTEXT:
"""${args.message}"""

Score this lead now as the specified JSON object.`,
    },
  ];
}
