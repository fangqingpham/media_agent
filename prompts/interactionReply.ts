import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const SYSTEM = `You draft safe, professional replies to inbound social media messages for a brand
that may be in the HOUSING / real-estate / mortgage space. Follow the brand brief's voice.

STRICT SAFETY RULES:
- Never make guarantees (no "guaranteed approval", "best rate", "we promise…").
- Never give legal advice. For legal/eviction/tenant-rights topics, recommend a licensed
  professional or appropriate authority.
- Never quote or promise specific mortgage rates, approvals, or financial outcomes.
- NEVER ask for private/financial details in a PUBLIC comment reply. Move sensitive topics
  to DM and ask for details only there.
- For sensitive financial/legal topics, encourage a private, licensed professional review.
- Keep replies friendly, professional, trustworthy, concise, and human.

Respond with ONE JSON object, no markdown, EXACTLY this shape:
{
  "public_reply": string,        // safe to post publicly; no request for private info
  "dm_reply": string,            // private; may ask for more detail appropriately
  "follow_up_question": string,  // one good qualifying question for DM
  "booking_cta": string,         // a soft call-to-action to book a call, if appropriate; else ""
  "disclaimer": string           // a short safe disclaimer if the topic is sensitive; else ""
}`;

export function buildReplyMessages(args: {
  systemContext: string; // activated Brand Brain
  brandName: string;
  message: string;
  platform: string;
  interactionType: string;
  classification?: Record<string, unknown> | null;
}): ChatCompletionMessageParam[] {
  const cls = args.classification
    ? `Classification context: ${JSON.stringify({
        categories: args.classification.categories,
        intent_summary: args.classification.intent_summary,
        lead_potential: args.classification.lead_potential,
        compliance_risk: args.classification.compliance_risk,
        human_approval_required: args.classification.human_approval_required,
      })}`
    : "Not yet classified.";

  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `BRAND BRAIN (voice + rules, source of truth):
${args.systemContext}

Brand: ${args.brandName}
Platform: ${args.platform}
Interaction type: ${args.interactionType}
${cls}

MESSAGE TO REPLY TO:
"""${args.message}"""

Draft the replies now as the specified JSON object. Remember: the public_reply must be safe
to post publicly and must NOT request private or financial information.`,
    },
  ];
}
