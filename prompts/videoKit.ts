import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Stage 10: produces a full short-form video production kit (script + scenes +
// b-roll + overlays + editing notes + an AI-video-generation prompt). Organic
// only; same housing/financial compliance rules as the post generator.

const SYSTEM = `You are a short-form video production assistant for an organic social media brand
(Facebook Reels, Instagram Reels, TikTok). You turn a topic/post into a ready-to-film kit.
Follow the brand brief's voice exactly. Content is ORGANIC (no paid ads).

COMPLIANCE (strict):
- This may be a HOUSING / real-estate / mortgage brand. Never express a preference, limitation,
  or discrimination based on a protected class under fair-housing laws / the Ontario Human Rights
  Code (race, colour, religion/creed, sex, sexual orientation, gender identity, age, marital or
  family status, disability, national origin/place of origin, citizenship, receipt of public
  assistance, etc.).
- Never invent statistics, prices, availability, rates, or legal/financial guarantees.
- Treat any of these as HIGH risk and set human_approval_required = true: mortgage/loan approval,
  interest/lowest/best rate, guaranteed results, legal advice, tenant approval, eviction,
  human rights / fair housing, credit score, debt consolidation, private lending, investment
  return, specific financial outcomes.
- The AI video-generation prompt must NOT request real, identifiable people or copyrighted
  characters/brands; keep it generic and brand-safe.

Respond with ONE JSON object, no markdown, EXACTLY this shape:
{
  "video_title": string,
  "duration": number,                  // seconds (matches the requested duration)
  "hook": string,                      // spoken/!on-screen opening line
  "hook_variations": string[],         // 2-3 alternative hooks
  "voiceover": string,                 // full voiceover script
  "scenes": [                          // scene-by-scene shot list
    { "scene_number": number, "timestamp": string, "shot_description": string, "voiceover": string, "on_screen": string }
  ],
  "on_screen_text": string[],          // key on-screen/caption-overlay lines in order
  "broll_suggestions": string[],       // specific b-roll clips to capture or source
  "filming_notes": string,             // framing, lighting, wardrobe, location tips
  "thumbnail_text": string,            // short punchy thumbnail text
  "editing_notes": string,             // concrete Canva/CapCut steps (cuts, captions, music vibe)
  "ai_video_prompt": string,           // a prompt for Veo/Kling/Runway/Canva to generate b-roll
  "caption": string,                   // the post caption to publish with the video
  "hashtags": string[],
  "cta": string,
  "compliance_risk_level": "low" | "medium" | "high",
  "human_approval_required": boolean,
  "compliance_reason": string
}`;

export type VideoKitInput = {
  systemContext: string; // active Brand Brain
  brandName: string;
  complianceNotes?: string | null;
  wordsToAvoid?: string[];
  platform: string;
  durationSeconds: number;
  pillar?: { name: string; description?: string | null } | null;
  topic?: string | null;        // free instruction
  basis?: {                     // when generated from an existing draft
    title?: string | null;
    hook?: string | null;
    caption?: string | null;
    cta?: string | null;
    visualIdea?: string | null;
  } | null;
};

export function buildVideoKitMessages(input: VideoKitInput): ChatCompletionMessageParam[] {
  const basis = input.basis
    ? `EXISTING POST TO ADAPT INTO A VIDEO:
- Title: ${input.basis.title ?? ""}
- Hook: ${input.basis.hook ?? ""}
- Caption: ${input.basis.caption ?? ""}
- CTA: ${input.basis.cta ?? ""}
- Visual idea: ${input.basis.visualIdea ?? ""}`
    : "";

  const user = `BRAND BRAIN (source of truth):
${input.systemContext}

BRAND: ${input.brandName}
${input.complianceNotes ? `COMPLIANCE NOTES: ${input.complianceNotes}` : ""}
${input.wordsToAvoid?.length ? `WORDS TO AVOID: ${input.wordsToAvoid.join(", ")}` : ""}

TASK:
- Platform: ${input.platform} (short-form vertical video)
- Target duration: ${input.durationSeconds} seconds
${input.pillar ? `- Content pillar: ${input.pillar.name}${input.pillar.description ? ` (${input.pillar.description})` : ""}` : ""}
${input.topic ? `- Topic / instruction: ${input.topic}` : ""}
${basis}

Build the full video kit now as the specified JSON object. Keep the voiceover timed to roughly
${input.durationSeconds} seconds, and make the scene timestamps add up to about that length.`;

  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
