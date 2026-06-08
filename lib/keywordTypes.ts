// Shared Stage 8 constants — single source of truth for the keyword-campaign UI.
import { LEAD_CATEGORIES } from "./leadTypes";

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "ended"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};

// Common keyword starting points (admin can type any keyword).
export const SUGGESTED_KEYWORDS = [
  "RENEWAL",
  "LANDLORD",
  "REFI",
  "BUY",
  "SELL",
  "LOAN",
  "CHECKLIST",
] as const;

// Re-export lead categories so the campaign form and the leads form stay in sync.
export { LEAD_CATEGORIES };

/**
 * Normalize a keyword for storage + matching: uppercase, trim, collapse internal
 * whitespace away, strip surrounding punctuation. "renewal!" -> "RENEWAL".
 */
export function normalizeKeyword(raw: string): string {
  return (raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

/**
 * Does a free-text comment contain the campaign keyword as a whole token?
 * Case-insensitive, ignores surrounding punctuation. "RENEWAL please" matches
 * "RENEWAL"; "renewals" does NOT match "RENEWAL" (word-boundary on the token).
 */
export function commentMatchesKeyword(comment: string, keyword: string): boolean {
  const k = normalizeKeyword(keyword);
  if (!k) return false;
  // tokens of letters/numbers in the comment, uppercased
  const tokens: string[] = comment.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  return tokens.includes(k);
}
