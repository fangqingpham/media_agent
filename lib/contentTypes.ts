// Shared Stage 2 constants — single source of truth for the UI and validation.

export const PLATFORMS = ["facebook", "instagram", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CONTENT_TYPES = [
  "facebook_post",
  "instagram_caption",
  "tiktok_caption",
  "video_script_15s",
  "video_script_30s",
  "video_script_45s",
  "carousel_outline",
  "story_idea",
  "qa_post",
  "myth_busting_post",
  "warning_post",
  "case_study_post",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  facebook_post: "Facebook post",
  instagram_caption: "Instagram caption",
  tiktok_caption: "TikTok caption",
  video_script_15s: "15-second video script",
  video_script_30s: "30-second video script",
  video_script_45s: "45-second video script",
  carousel_outline: "Carousel outline",
  story_idea: "Story idea",
  qa_post: "Q&A post",
  myth_busting_post: "Myth-busting post",
  warning_post: "Warning post",
  case_study_post: "Case-study style post",
};

export const POST_STATUSES = [
  "idea",
  "draft",
  "pending_approval",
  "approved",
  "ready_to_post",
  "scheduled",
  "scheduled_manually",
  "posted",
  "rejected",
  "needs_revision",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  idea: "Idea",
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  ready_to_post: "Ready to post",
  scheduled: "Scheduled",
  scheduled_manually: "Scheduled (manual)",
  posted: "Posted",
  rejected: "Rejected",
  needs_revision: "Needs revision",
};

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export function isVideoType(t: string) {
  return t.startsWith("video_script_");
}
export function isCarouselType(t: string) {
  return t === "carousel_outline";
}
