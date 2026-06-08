import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Stage 8: drafts replies for an organic KEYWORD campaign comment, e.g. a user
// commenting "RENEWAL" under a "Comment RENEWAL for the checklist" post.
// Public reply must be safe to post publicly; the actual offer/details go to DM.

const SYSTEM = `You draft replies for an ORGANIC keyword lead-capture campaign for a brand that may be
in the HOUSING / real-estate / mortgage space. A person commented a campaign keyword (e.g.
"RENEWAL") under a post that offered a free checklist/resource. Draft a short, friendly public
reply plus a private DM that delivers the offer and asks ONE qualifying question.

Follow the brand brief's voice. Output is for HUMAN REVIEW — nothing is sent automatically.

STRICT SAFETY RULES (non-negotiable):
- NEVER make guarantees: no "guaranteed approval", "best/lowest rate", "we promise", no
  promised financial outcomes, savings figures, or tenant-approval promises.
- NEVER give legal advice. For legal / eviction / tenant-rights topics, recommend a licensed
  professional or the appropriate authority.
- NEVER quote or promise specific mortgage rates, approvals, or financial results.
- The PUBLIC reply must NOT ask for any private or financial information (no income, credit,
  SIN, account, address). Keep it to: thanks + "check your DM/inbox". Move everything sensitive
  to the DM.
- The DM may ask ONE light qualifying question, but must not demand sensitive financial details
  up front; invite a professional conversation instead.
- FAIR HOUSING — if the offer is a tenant-screening / landlord checklist, any criteria you
  mention must be objective and lawful ONLY (e.g. income verification, employment, references,
  credit check WITH consent). You must NOT reference, imply, or invite filtering by any ground
  protected under the Ontario Human Rights Code: race, ancestry, place of origin, colour,
  ethnic origin, citizenship, creed/religion, sex, sexual orientation, gender identity, gender
  expression, age, marital status, family status, disability, or receipt of public assistance.
- Keep replies concise, warm, professional, human.

Respond with ONE JSON object, no markdown, EXACTLY this shape:
{
  "public_reply": string,            // safe to post publicly; no request for private info
  "dm_reply": string,                // private; delivers the offer, light qualifying ask
  "follow_up_question": string,      // one good qualifying question for DM
  "suggested_cta": string,           // soft next step (e.g. book a quick call); else ""
  "suggested_lead_category": string, // best-fit lead category for this person
  "compliance_risk": "low" | "medium" | "high",
  "human_approval_required": boolean,
  "risk_reason": string              // short reason if medium/high; else ""
}`;

export function buildKeywordReplyMessages(args: {
  systemContext: string; // activated Brand Brain
  brandName: string;
  complianceNotes?: string | null;
  platform: string;
  keyword: string;
  offerName?: string | null;
  leadCategory?: string | null;
  comment: string;
  personName?: string | null;
}): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `BRAND BRAIN (voice + rules, source of truth):
${args.systemContext}

Brand: ${args.brandName}
${args.complianceNotes ? `Brand compliance notes: ${args.complianceNotes}\n` : ""}Platform: ${args.platform}
Campaign keyword: ${args.keyword}
Offer/resource to deliver: ${args.offerName || "(the checklist/resource promised in the post)"}
Intended lead category: ${args.leadCategory || "(infer the best fit)"}
Commenter name: ${args.personName || "(unknown)"}

THE COMMENT THEY POSTED:
"""${args.comment}"""

Draft the replies now as the specified JSON object. The public_reply must be safe to post
publicly and must NOT request private or financial information — direct them to the DM. If the
offer is a tenant/landlord screening checklist, keep all criteria lawful and never reference
protected grounds.`,
    },
  ];
}
