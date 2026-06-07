// Stage 3: allowed status transitions. Centralized so every status change
// (from any page or endpoint) is validated the same way and recorded in history.

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  idea: ["draft", "pending_approval"],
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected", "needs_revision", "draft"],
  needs_revision: ["draft", "pending_approval"],
  rejected: ["draft"],
  approved: ["ready_to_post"],
  ready_to_post: ["scheduled_manually", "posted"],
  scheduled_manually: ["posted"],
  scheduled: ["posted"], // legacy Stage 2 status, kept for back-compat
  posted: [],
};

export function canTransition(from: string, to: string): boolean {
  if (from === to) return true; // no-op edits allowed
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedNext(from: string): string[] {
  return STATUS_TRANSITIONS[from] ?? [];
}
