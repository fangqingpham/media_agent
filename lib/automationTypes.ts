// Stage 14: triggers, safe actions, and HARD guardrails for the automation engine.

export const TRIGGERS = [
  "post_scheduled_due",
  "post_published",
  "interaction_created",
  "keyword_matched",
  "lead_created",
  "lead_score_updated",
  "followup_due",
  "performance_threshold_met",
  "compliance_risk_detected",
  "publish_failed",
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TRIGGER_LABELS: Record<Trigger, string> = {
  post_scheduled_due: "A scheduled post is due",
  post_published: "A post was published",
  interaction_created: "A new comment/DM arrived",
  keyword_matched: "A keyword was matched",
  lead_created: "A new lead was created",
  lead_score_updated: "A lead score crossed a threshold",
  followup_due: "A follow-up is overdue",
  performance_threshold_met: "A post passed a performance threshold",
  compliance_risk_detected: "A high-risk post needs review",
  publish_failed: "A publish attempt failed",
};

// SAFE actions only. Everything here is internal workflow — no platform-side
// engagement, no auto-sending of public/sensitive content.
export const SAFE_ACTIONS = [
  "create_task", // alias of reminder
  "reminder",
  "notify_admin",
  "create_lead_candidate",
  "send_to_compliance_review",
  "recommend_repurpose",
  "update_status",
  "generate_reply_draft", // DRAFT only — never sent
  "generate_next_post_ideas",
] as const;
export type SafeAction = (typeof SAFE_ACTIONS)[number];

export const ACTION_LABELS: Record<SafeAction, string> = {
  create_task: "Create a task/reminder",
  reminder: "Create a reminder",
  notify_admin: "Notify admin",
  create_lead_candidate: "Flag as lead candidate",
  send_to_compliance_review: "Send to compliance review",
  recommend_repurpose: "Recommend repurpose",
  update_status: "Update status (safe values only)",
  generate_reply_draft: "Generate a reply draft (not sent)",
  generate_next_post_ideas: "Recommend generating next post ideas",
};

// HARD-BLOCKED actions. A rule containing any of these is rejected at save time
// and skipped at run time — no exceptions, regardless of how it's labelled.
export const BLOCKED_ACTIONS = [
  "auto_like",
  "auto_follow",
  "scrape",
  "mass_comment",
  "cold_dm",
  "auto_send_dm",
  "auto_send_reply",
  "send_dm",
  "publish_unapproved",
  "publish_high_risk",
  "auto_publish",
];

// status values a rule may set via update_status — never to a posted/published/
// scheduled state (those must go through the human/compliance/publish gates).
export const ALLOWED_STATUS_TARGETS = [
  "draft",
  "needs_review",
  "pending_approval",
  "rejected",
  "follow_up_later",
];

export class AutomationGuardError extends Error {}

// Throws if actions contain anything outside the safe allowlist.
export function validateActions(actions: unknown): { type: string; params?: Record<string, unknown> }[] {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new AutomationGuardError("A rule needs at least one action.");
  }
  const out: { type: string; params?: Record<string, unknown> }[] = [];
  for (const a of actions) {
    const type = (a && typeof a === "object" ? (a as Record<string, unknown>).type : a) as string;
    if (typeof type !== "string") throw new AutomationGuardError("Each action needs a type.");
    if (BLOCKED_ACTIONS.includes(type)) {
      throw new AutomationGuardError(`Action "${type}" is not allowed — the engine never performs platform-side engagement or auto-sends content.`);
    }
    if (!SAFE_ACTIONS.includes(type as SafeAction)) {
      throw new AutomationGuardError(`Unknown action "${type}".`);
    }
    out.push({ type, params: (a as Record<string, unknown>)?.params as Record<string, unknown> | undefined });
  }
  return out;
}

export function isSafeAction(type: string): boolean {
  return SAFE_ACTIONS.includes(type as SafeAction) && !BLOCKED_ACTIONS.includes(type);
}
