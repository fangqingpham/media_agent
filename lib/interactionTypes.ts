// Shared Stage 4 constants — single source of truth for the interactions UI.

export const INTERACTION_TYPES = [
  "public_comment",
  "private_dm",
  "story_reply",
  "post_reply",
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_TYPE_LABELS: Record<string, string> = {
  public_comment: "Public comment",
  private_dm: "Private DM",
  story_reply: "Story reply",
  post_reply: "Post reply",
};

export const INTERACTION_STATUSES = [
  "new",
  "classified",
  "reply_drafted",
  "replied_manually",
  "needs_follow_up",
  "ignored",
  "spam",
  "lead_candidate",
] as const;
export type InteractionStatus = (typeof INTERACTION_STATUSES)[number];

export const INTERACTION_STATUS_LABELS: Record<string, string> = {
  new: "New",
  classified: "Classified",
  reply_drafted: "Reply drafted",
  replied_manually: "Replied (manual)",
  needs_follow_up: "Needs follow-up",
  ignored: "Ignored",
  spam: "Spam",
  lead_candidate: "Lead candidate",
};

export const CLASSIFICATION_CATEGORIES = [
  "lead", "FAQ", "complaint", "spam",
  "mortgage_question", "mortgage_renewal", "refinance", "debt_consolidation",
  "first_time_buyer", "landlord_question", "tenant_placement", "property_management",
  "home_buying", "home_selling", "loan_private_lending", "urgent", "needs_human_review",
] as const;

export const LEAD_POTENTIAL = ["none", "low", "medium", "high"] as const;
export type LeadPotential = (typeof LEAD_POTENTIAL)[number];
