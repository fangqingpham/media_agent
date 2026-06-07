import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { CONTENT_TYPE_LABELS, type ContentType } from "@/lib/contentTypes";

export type GenInput = {
  systemContext: string; // from the activated Brand Brain (brand_briefs.system_context)
  brandName: string;
  complianceNotes?: string | null;
  wordsToAvoid?: string[];
  platform: string;
  contentType: ContentType;
  pillar?: { name: string; description?: string | null } | null;
  audience?: { name: string; description?: string | null } | null;
  cta?: string | null;
  tone?: string | null;
  userInstruction?: string | null;
};

const SYSTEM = `You are an organic social media post generator for a brand.
You ONLY create organic content (no paid ads). Follow the brand brief exactly.

You must follow these compliance rules strictly:
- This may be a HOUSING / real-estate brand. Never express a preference, limitation,
  or discrimination based on a protected class (race, colour, religion, sex, disability,
  family status, national origin, age, or any class protected under fair-housing laws /
  the Ontario Human Rights Code).
- Never invent statistics, prices, availability, rates, or legal/financial guarantees.
- Treat any mention of these as HIGH risk and set human_approval_required = true:
  mortgage approval, loan approval, interest rates, lowest/best rate, guaranteed results,
  legal advice, tenant approval, eviction, human rights / fair housing, credit score,
  debt consolidation, private lending, investment return, specific financial outcomes.
- When unsure, raise the risk level and explain why.

Respond with ONE JSON object, no markdown, EXACTLY this shape:
{
  "title": string,                       // short internal topic label
  "hook": string,                        // scroll-stopping first line
  "caption": string,                     // the main body
  "platform_caption": string,            // version tuned for the target platform
  "hashtags": string[],                  // relevant, not spammy; [] if not applicable
  "cta": string,                         // call to action
  "visual_idea": string,                 // what image/video to pair with it
  "video_script": null | { "duration_seconds": number, "scenes": [ { "timestamp": string, "voiceover": string, "on_screen": string } ] },
  "carousel_outline": null | [ { "slide": number, "headline": string, "body": string } ],
  "compliance_risk": "low" | "medium" | "high",
  "compliance_reason": string,
  "human_approval_required": boolean,
  "claims_to_check": string[]            // any factual/financial/legal claims a human should verify
}

Rules for the optional fields:
- Include "video_script" ONLY for video-script content types; otherwise null.
- Include "carousel_outline" ONLY for carousel content types; otherwise null.`;

export function buildPostMessages(input: GenInput): ChatCompletionMessageParam[] {
  const typeLabel = CONTENT_TYPE_LABELS[input.contentType] ?? input.contentType;

  const user = `BRAND BRAIN (source of truth):
${input.systemContext}

BRAND: ${input.brandName}
${input.complianceNotes ? `COMPLIANCE NOTES: ${input.complianceNotes}` : ""}
${input.wordsToAvoid?.length ? `WORDS TO AVOID: ${input.wordsToAvoid.join(", ")}` : ""}

TASK:
- Platform: ${input.platform}
- Content type: ${typeLabel}
${input.pillar ? `- Content pillar: ${input.pillar.name}${input.pillar.description ? ` (${input.pillar.description})` : ""}` : ""}
${input.audience ? `- Target audience: ${input.audience.name}${input.audience.description ? ` (${input.audience.description})` : ""}` : ""}
${input.cta ? `- Preferred CTA: ${input.cta}` : ""}
${input.tone ? `- Desired tone: ${input.tone}` : ""}
${input.userInstruction ? `- Extra instruction: ${input.userInstruction}` : ""}

Generate the post now as the specified JSON object.`;

  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
