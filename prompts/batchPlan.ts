import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Stage 10: groups several posts into one efficient filming session.

const SYSTEM = `You are a video production planner. Given several short-form video posts a creator
wants to film, you produce an efficient batch recording plan that minimizes setup changes.

Group the posts sensibly by what would let the creator film them back-to-back — same OUTFIT,
same LOCATION/SET, or same TOPIC theme. Estimate realistic filming time (short-form clips are
quick, but allow for setup, retakes, and resets). Provide a concrete shot checklist.

Respond with ONE JSON object, no markdown, EXACTLY this shape:
{
  "groups": [
    {
      "group_name": string,
      "group_by": "outfit" | "location" | "topic",
      "posts": string[],          // the post titles in this group
      "shots": string[]           // specific shots to capture for this group
    }
  ],
  "shot_checklist": string[],     // a flat, ordered checklist for the whole session
  "estimated_minutes": number     // total realistic filming time for the session
}`;

export type BatchPlanInput = {
  brandName: string;
  posts: {
    title: string;
    platform: string;
    content_type: string;
    hook?: string | null;
    visual_idea?: string | null;
  }[];
};

export function buildBatchPlanMessages(input: BatchPlanInput): ChatCompletionMessageParam[] {
  const list = input.posts
    .map(
      (p, i) =>
        `${i + 1}. [${p.platform}/${p.content_type}] ${p.title}` +
        (p.hook ? ` — hook: ${p.hook}` : "") +
        (p.visual_idea ? ` — visual: ${p.visual_idea}` : "")
    )
    .join("\n");

  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `BRAND: ${input.brandName}

POSTS TO FILM IN ONE SESSION:
${list}

Produce the batch recording plan now as the specified JSON object.`,
    },
  ];
}
