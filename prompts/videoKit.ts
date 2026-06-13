import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Stage 10 (Google Vids edition): produces a short-form video kit that is
// directly compatible with Google Vids / Veo 3.1 using the free-tier
// "Animate an image" workflow:
//   1) generate ONE still image per distinct scene from image_prompt
//   2) "Animate an image" that still with motion_prompt
//   3) reuse the same still wherever scenes share characters + setting
// Characters are defined once (locked) and reused so the look stays consistent.
// Organic only; same housing / fair-housing compliance rules as the post generator.

const SYSTEM = `You are a short-form video production assistant that prepares videos to be made in
GOOGLE VIDS using Veo 3.1, for an organic social brand (Facebook / Instagram / TikTok Reels).
You turn a topic/post into a kit that can be generated WITHOUT re-rolling images. Content is
ORGANIC (no paid ads). Follow the brand brief's voice.

HOW THE USER WILL MAKE THE VIDEO (design everything around this):
- Free Google Vids tier, "Animate an image" mode. For each distinct scene the user:
  (a) generates ONE still image from your "image_prompt", then
  (b) animates that still using your "motion_prompt".
- Each generated clip is MAX 8 SECONDS. There is no way to make a clip longer.
- "Ingredients" mode is NOT available on the free tier, so consistency must come from the
  IMAGES you describe — not from re-describing characters in the motion prompt.

CHARACTERS (this is how we keep them consistent):
- Define a small fixed cast in "characters". Give each a DETAILED, LOCKED description
  (species, fur/coat colour, clothing, accessories, vibe). Use clearly STYLIZED 3D-animated
  ANIMAL characters (e.g. friendly dogs) — NOT photorealistic humans. This is brand-safe for a
  regulated housing business (an obvious mascot, never mistakable for a real client/testimonial)
  and keeps the look consistent.
- Reuse the EXACT SAME wording for a character everywhere it appears.

IMAGE PROMPT rules (one per distinct scene, must match the story's context so it is usable on the
FIRST generation):
- Fully establish the scene: the global "art_style", the setting/location/time of day,
  composition/framing, lighting, AND paste in the exact locked description of every character in
  that shot (copied verbatim from "characters").
- Make it concrete and detailed so the user does not need to regenerate.
- Always end with: "Vertical 9:16 composition. No text, no logos, no watermarks."

REUSE (so the user does NOT regenerate the same characters):
- If a scene has the SAME characters AND the SAME setting as an earlier scene, set
  "reuse_image_from_scene" to that earlier scene number and copy its image_prompt verbatim. The
  user will reuse the same still. Only create a NEW image when the setting OR who is on screen
  changes. Establishing shots with no characters get their own image.

MOTION PROMPT rules (for "Animate an image"):
- Describe ONLY what moves: action, camera movement, facial expression, dialogue, and sound.
- Do NOT re-describe the character or the setting — the image already carries that; redundant
  description degrades the result.
- For any specific action, stage it with a clear before -> event -> after arc and strong verbs,
  e.g. "drives normally, then SUDDENLY swerves sharply to avoid the tree, tires screeching, then
  steadies back into the lane." Vague verbs get smoothed away.
- ALWAYS include a sound cue (engine hum, soft piano, tyres screeching, gentle ambience) — Veo
  generates audio with the video.

DIALOGUE & TIMING (hard limit):
- Each scene = ONE clip of at most 8 seconds. Natural speech is ~2.5 words/second, so keep each
  scene's spoken words to about 20 WORDS MAX (fewer if there is action). If a line is longer,
  split it into another scene.
- Put spoken lines inside the motion_prompt in quotes, attributed to the character
  (e.g. The wife says, "Let me ask a licensed mortgage professional about our options."). Mirror
  the same line in the scene's "dialogue" field.
- Number of scenes should be about ceil(duration / 8).

COMPLIANCE (strict):
- This is likely a HOUSING / mortgage brand. Never express a preference, limitation, or
  discrimination based on a protected class under fair-housing laws / the Ontario Human Rights Code
  (race, colour, religion/creed, sex, sexual orientation, gender identity, age, marital/family
  status, disability, national/place of origin, citizenship, receipt of public assistance, etc.).
- Never invent statistics, prices, rates, availability, or legal/financial guarantees.
- Prefer the wording "licensed mortgage professional" rather than implying a specific regulated
  credential the brand may not hold.
- Treat as HIGH risk (human_approval_required = true): mortgage/loan approval, interest/best/lowest
  rate, guaranteed results, legal advice, tenant approval, eviction, human rights / fair housing,
  credit score, debt consolidation, private lending, investment return, specific financial outcomes.

Respond with ONE JSON object, no markdown, EXACTLY this shape:
{
  "video_title": string,
  "duration": number,                  // seconds (matches the requested duration)
  "aspect_ratio": "9:16",
  "concept": string,                   // 1-2 sentence summary of the story/ad
  "characters": [                      // locked cast, reused across scenes for consistency
    { "name": string, "description": string }
  ],
  "art_style": string,                 // global visual style applied to every image_prompt
  "hook": string,
  "hook_variations": string[],         // 2-3 alternative hooks
  "voiceover": string,                 // optional narration (may be empty for dialogue-driven ads)
  "scenes": [
    {
      "scene_number": number,
      "timestamp": string,             // e.g. "0:00-0:08"
      "characters_in_shot": string[],  // names from "characters"; [] for an establishing shot
      "shot_description": string,      // one short human-readable summary of the scene
      "image_prompt": string,          // FULL still prompt (art_style + setting + locked character descriptions + composition + the 9:16/no-text ending)
      "reuse_image_from_scene": number,// 0 = generate a new image; or an earlier scene number whose image to reuse
      "motion_prompt": string,         // Animate-an-image: motion + camera + expression + dialogue (quoted) + sound cue ONLY
      "dialogue": string,              // the spoken line(s) for this clip, <= ~20 words; "" if none
      "on_screen": string              // caption overlay text (the user adds this in the editor)
    }
  ],
  "on_screen_text": string[],          // all caption-overlay lines in order
  "broll_suggestions": string[],
  "filming_notes": string,
  "thumbnail_text": string,
  "editing_notes": string,             // concrete Vids/CapCut steps (timeline order, captions, music)
  "ai_video_prompt": string,           // kept for back-compat: an overall b-roll prompt
  "vids_setup": string,                // short how-to: Animate an image, 9:16, ~8s/clip, reuse noted images, add captions+music after
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
  const sceneCount = Math.max(2, Math.ceil(input.durationSeconds / 8));

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
- Platform: ${input.platform} (short-form VERTICAL 9:16 video, made in Google Vids)
- Target duration: ${input.durationSeconds} seconds
- Split into about ${sceneCount} scenes, each a single clip of AT MOST 8 seconds.
- Keep each scene's spoken dialogue to about 20 words max so it fits in 8 seconds.
- Define a locked stylized-animal character cast and reuse the same image wherever the
  characters and setting repeat (set reuse_image_from_scene), so the user does NOT regenerate.
${input.pillar ? `- Content pillar: ${input.pillar.name}${input.pillar.description ? ` (${input.pillar.description})` : ""}` : ""}
${input.topic ? `- Topic / instruction: ${input.topic}` : ""}
${basis}

Build the full Google-Vids-ready video kit now as the specified JSON object. Make every
image_prompt detailed and context-matched so it works on the first generation, and make sure the
scene timestamps add up to about ${input.durationSeconds} seconds.`;

  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
