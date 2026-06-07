// Shared Stage 5 constants — single source of truth for the leads UI.

export const LEAD_CATEGORIES = [
  "Mortgage Renewal",
  "Refinance",
  "First-Time Buyer",
  "Debt Consolidation",
  "Tenant Placement",
  "Property Management",
  "Home Buying",
  "Home Selling",
  "Private Lending Borrower",
  "Lender/Mortgage Agent Signup",
  "General Inquiry",
] as const;
export type LeadCategory = (typeof LEAD_CATEGORIES)[number];

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "waiting_for_reply",
  "qualified",
  "unqualified",
  "booked_call",
  "converted",
  "closed_lost",
  "follow_up_later",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  waiting_for_reply: "Waiting for reply",
  qualified: "Qualified",
  unqualified: "Unqualified",
  booked_call: "Booked call",
  converted: "Converted",
  closed_lost: "Closed (lost)",
  follow_up_later: "Follow up later",
};

export const LEAD_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

// "hot" = high or urgent priority (used by the dashboard filter)
export const HOT_PRIORITIES = ["high", "urgent"];
