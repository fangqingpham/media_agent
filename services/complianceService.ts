import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { buildComplianceReviewMessages } from "@/prompts/complianceReview";
import { scanCompliance, mergeRisk } from "@/lib/compliance";
import { scanSensitive } from "@/lib/interactionCompliance";
import type { RiskLevel } from "@/lib/contentTypes";

export class ComplianceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Build the reviewable text from a post's fields.
function postText(post: Record<string, unknown>): string {
  return [
    post.title,
    post.hook,
    (post.platform_caption as string) || (post.caption as string),
    post.cta,
    Array.isArray(post.hashtags) ? (post.hashtags as string[]).join(" ") : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadOwnedReview(id: string, userId: string) {
  const { data, error } = await supabaseAdmin.from("compliance_reviews").select("*").eq("id", id).single();
  if (error || !data) throw new ComplianceError("Review not found", 404);
  if (data.owner_id !== userId) throw new ComplianceError("Forbidden", 403);
  return data;
}

/**
 * Core: review a piece of content. Runs the AI reviewer AND the deterministic
 * scanners, merges (taking the worse), saves a review + its flags. Works for a
 * post (postId) or ad-hoc text.
 */
export async function reviewContent(
  args: { text?: string; postId?: string; brandId?: string | null },
  userId: string
) {
  let text = (args.text || "").trim();
  let brandId = args.brandId ?? null;
  let postId = args.postId ?? null;

  if (postId) {
    const { data: post } = await supabaseAdmin.from("post_drafts").select("*").eq("id", postId).single();
    if (!post || post.owner_id !== userId) throw new ComplianceError("Post not found", 404);
    text = postText(post);
    brandId = post.brand_id as string;
  }
  if (!text) throw new ComplianceError("No content to review", 400);

  // optional brand context (active Brain) for tone-aware rewrite
  let brandContext: string | null = null;
  let complianceNotes: string | null = null;
  if (brandId) {
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("owner_id, compliance_notes")
      .eq("id", brandId)
      .single();
    if (brand && brand.owner_id !== userId) throw new ComplianceError("Forbidden", 403);
    complianceNotes = (brand?.compliance_notes as string) ?? null;
    const { data: brief } = await supabaseAdmin
      .from("brand_briefs")
      .select("system_context")
      .eq("brand_id", brandId)
      .eq("status", "active")
      .maybeSingle();
    brandContext = (brief?.system_context as string) ?? null;
  }

  // ---- AI review ----
  let parsed: Record<string, unknown>;
  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: buildComplianceReviewMessages({ content: text, brandContext, complianceNotes }),
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "review failed";
    throw new ComplianceError(`Compliance review failed: ${msg}`, 502);
  }

  // ---- deterministic scanners (model can't soften these) ----
  const scan = scanCompliance(text);
  const sensitive = scanSensitive(text);
  const aiRisk = (["low", "medium", "high"].includes(parsed.risk_level as string)
    ? parsed.risk_level
    : "low") as RiskLevel;
  const merged = mergeRisk(aiRisk, scan);
  let finalRisk = merged.risk as RiskLevel;
  if (sensitive.forceApproval && finalRisk !== "high") finalRisk = finalRisk === "low" ? "medium" : finalRisk;
  const scannerMatched = [...new Set([...scan.matched, ...sensitive.matched])];
  const humanApproval =
    merged.humanApprovalRequired || sensitive.forceApproval || !!parsed.human_approval_required || finalRisk === "high";

  const disclaimers = Array.isArray(parsed.disclaimer_needed) ? (parsed.disclaimer_needed as string[]) : [];
  // high risk is never auto-publishable here; it must get an explicit decision
  const canPublish = finalRisk !== "high" && parsed.can_publish !== false;

  const { data: review, error } = await supabaseAdmin
    .from("compliance_reviews")
    .insert({
      owner_id: userId,
      brand_id: brandId,
      post_id: postId,
      source_text: text,
      risk_level: finalRisk,
      why_risky: (parsed.why_risky as string) ?? null,
      issues_found: Array.isArray(parsed.issues_found) ? parsed.issues_found : [],
      safer_rewrite: (parsed.safer_rewrite as string) ?? null,
      disclaimers,
      disclaimer_required: disclaimers.length > 0,
      human_approval_required: humanApproval,
      can_publish: canPublish,
      reviewer_notes: (parsed.reviewer_notes as string) ?? null,
      scanner_matched: scannerMatched,
      model: OPENAI_MODEL,
      raw_response: parsed,
    })
    .select()
    .single();
  if (error) throw new ComplianceError(`Could not save review: ${error.message}`, 500);

  // flags: AI risky phrases + scanner matches
  const flags: Record<string, unknown>[] = [];
  for (const phrase of (Array.isArray(parsed.risky_phrases) ? parsed.risky_phrases : []) as string[]) {
    flags.push({ owner_id: userId, review_id: review.id, flag_type: "ai_phrase", phrase, source: "ai" });
  }
  for (const label of scannerMatched) {
    flags.push({ owner_id: userId, review_id: review.id, flag_type: "keyword", phrase: label, detail: "Deterministic scanner match", source: "scanner" });
  }
  if (flags.length) await supabaseAdmin.from("compliance_flags").insert(flags);

  return getReview(review.id, userId);
}

export async function getReview(id: string, userId: string) {
  const review = await loadOwnedReview(id, userId);
  const { data: flags } = await supabaseAdmin.from("compliance_flags").select("*").eq("review_id", id);
  const { data: decisions } = await supabaseAdmin
    .from("compliance_decisions")
    .select("*")
    .eq("review_id", id)
    .order("created_at", { ascending: false });
  return { review, flags: flags ?? [], decisions: decisions ?? [] };
}

// Latest review (+ flags/decisions/rewrites) for a post, or null.
export async function getPostCompliance(postId: string, userId: string) {
  const { data: post } = await supabaseAdmin.from("post_drafts").select("*").eq("id", postId).single();
  if (!post || post.owner_id !== userId) throw new ComplianceError("Post not found", 404);

  const { data: review } = await supabaseAdmin
    .from("compliance_reviews")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let flags: Record<string, unknown>[] = [];
  let decisions: Record<string, unknown>[] = [];
  if (review) {
    const [{ data: f }, { data: d }] = await Promise.all([
      supabaseAdmin.from("compliance_flags").select("*").eq("review_id", review.id),
      supabaseAdmin.from("compliance_decisions").select("*").eq("review_id", review.id).order("created_at", { ascending: false }),
    ]);
    flags = f ?? [];
    decisions = d ?? [];
  }
  const { data: rewrites } = await supabaseAdmin
    .from("compliance_rewrite_history")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });

  return { post, review: review ?? null, flags, decisions, rewrites: rewrites ?? [] };
}

// Posts that need review: medium/high risk, approval required, or have risky claims.
export async function listReviewQueue(userId: string, brandId?: string) {
  let q = supabaseAdmin
    .from("post_drafts")
    .select("id, title, platform, status, compliance_risk, human_approval_required, claims_to_check, brand_id, updated_at")
    .eq("owner_id", userId)
    .neq("status", "posted")
    .neq("status", "rejected");
  if (brandId) q = q.eq("brand_id", brandId);
  const { data: posts } = await q.order("updated_at", { ascending: false });

  const flagged = (posts ?? []).filter(
    (p) =>
      p.compliance_risk === "high" ||
      p.compliance_risk === "medium" ||
      p.human_approval_required ||
      (Array.isArray(p.claims_to_check) && p.claims_to_check.length > 0)
  );

  // attach latest decision so the UI can show "reviewed/approved"
  const ids = flagged.map((p) => p.id);
  const latestDecision = new Map<string, string>();
  if (ids.length) {
    const { data: decisions } = await supabaseAdmin
      .from("compliance_decisions")
      .select("post_id, decision, created_at")
      .in("post_id", ids)
      .order("created_at", { ascending: false });
    for (const d of decisions ?? []) if (d.post_id && !latestDecision.has(d.post_id)) latestDecision.set(d.post_id, d.decision);
  }
  return flagged.map((p) => ({ ...p, latest_decision: latestDecision.get(p.id) ?? null }));
}

// Record an admin decision. Approving a high-risk post is what unlocks publishing.
export async function decideReview(
  reviewId: string,
  decision: string,
  note: string | null,
  userId: string
) {
  if (!["approved", "rejected", "needs_changes"].includes(decision))
    throw new ComplianceError("Invalid decision", 400);
  const review = await loadOwnedReview(reviewId, userId);

  const { data, error } = await supabaseAdmin
    .from("compliance_decisions")
    .insert({
      owner_id: userId,
      review_id: reviewId,
      post_id: review.post_id,
      decision,
      note: note ?? null,
      decided_by: userId,
    })
    .select()
    .single();
  if (error) throw new ComplianceError(`Could not save decision: ${error.message}`, 500);

  // reflect a rejection on the post so it can't move forward
  if (review.post_id && decision === "rejected") {
    await supabaseAdmin.from("post_drafts").update({ status: "rejected" }).eq("id", review.post_id);
  }
  return data;
}

// Apply the AI safer-rewrite to the post's caption, logging before/after.
export async function applyRewrite(reviewId: string, userId: string) {
  const review = await loadOwnedReview(reviewId, userId);
  if (!review.post_id) throw new ComplianceError("This review is not attached to a post.", 400);
  if (!review.safer_rewrite) throw new ComplianceError("No safer rewrite available.", 400);

  const { data: post } = await supabaseAdmin
    .from("post_drafts")
    .select("platform_caption, caption")
    .eq("id", review.post_id)
    .single();
  const before = (post?.platform_caption as string) || (post?.caption as string) || "";

  await supabaseAdmin
    .from("post_drafts")
    .update({ platform_caption: review.safer_rewrite })
    .eq("id", review.post_id);

  await supabaseAdmin.from("compliance_rewrite_history").insert({
    owner_id: userId,
    review_id: reviewId,
    post_id: review.post_id,
    before_text: before,
    after_text: review.safer_rewrite,
    applied: true,
  });

  return { ok: true, applied_to_post: review.post_id };
}

// Used by the publish gate (Stage 7): has this post passed compliance review?
export async function hasApprovedCompliance(postId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("compliance_decisions")
    .select("id")
    .eq("post_id", postId)
    .eq("decision", "approved")
    .limit(1)
    .maybeSingle();
  return !!data;
}
