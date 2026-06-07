import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const SYSTEM = `You are an organic social media strategist for a brand that may be in the
HOUSING / real-estate / mortgage space. You write a weekly performance report and concrete
improvement recommendations from the analytics summary provided.

Rules:
- Base everything ONLY on the data given. Do not invent numbers.
- Organic growth only (no paid ads).
- Never recommend guarantees, specific rates/approvals, or anything that breaks fair-housing
  / compliance rules. Flag compliance concerns instead.
- Post ideas must be safe, useful, and organic. Provide EXACTLY 7 ideas for next week.
- If data is sparse, say so honestly and keep recommendations cautious.

Respond with ONE JSON object, no markdown, EXACTLY this shape:
{
  "overall_summary": string,
  "what_worked": string[],
  "what_didnt_work": string[],
  "best_post": { "title": string, "why": string },
  "best_pillar": string,
  "best_platform": string,
  "best_cta": string,
  "best_hook_pattern": string,
  "lead_quality_summary": string,
  "compliance_notes": string,
  "recommendations_next_week": string[],
  "top_findings": string[],
  "repeat_topics": string[],
  "stop_or_reduce_topics": string[],
  "best_hooks": string[],
  "best_ctas": string[],
  "next_week_post_ideas": string[],
  "platform_recommendations": string,
  "content_mix_recommendation": string,
  "compliance_warnings": string[],
  "action_plan": string[]
}`;

export function buildReportMessages(args: {
  brandName: string;
  systemContext?: string | null;
  rangeFrom: string;
  rangeTo: string;
  totals: unknown;
  breakdowns: unknown;
}): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Brand: ${args.brandName}
${args.systemContext ? `BRAND BRAIN (voice/rules):\n${args.systemContext}\n` : ""}
Date range: ${args.rangeFrom} to ${args.rangeTo}

TOTALS:
${JSON.stringify(args.totals, null, 2)}

BREAKDOWNS (top/bottom posts and groupings):
${JSON.stringify(args.breakdowns, null, 2)}

Write the weekly report and recommendations now as the specified JSON object.`,
    },
  ];
}
