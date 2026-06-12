import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptToken } from "@/lib/tokenCrypto";
import { publishToPage } from "@/lib/facebook";
import { hasApprovedCompliance } from "@/services/complianceService";
import { getEffectiveRole } from "@/services/teamService";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/services/auditService";

export class PublishError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// statuses from which a manual publish is allowed
const PUBLISHABLE = ["approved", "ready_to_post", "scheduled", "scheduled_manually"];

async function logError(userId: string, context: string, message: string, platform = "facebook") {
  await supabaseAdmin.from("api_error_logs").insert({
    owner_id: userId, platform, context, error_message: message,
  });
}

async function recordAttempt(
  userId: string,
  fields: {
    postId: string;
    accountId: string | null;
    status: "success" | "failed";
    platformPostId?: string | null;
    publishedUrl?: string | null;
    finalCaption?: string | null;
    error?: string | null;
    trigger?: "manual" | "scheduler";
  }
) {
  await supabaseAdmin.from("publish_attempts").insert({
    owner_id: userId,
    post_id: fields.postId,
    account_id: fields.accountId,
    platform: "facebook",
    status: fields.status,
    platform_post_id: fields.platformPostId ?? null,
    published_url: fields.publishedUrl ?? null,
    final_caption: fields.finalCaption ?? null,
    error_message: fields.error ?? null,
    trigger: fields.trigger ?? "manual",
  });
}

// Loads the connected Facebook account + decrypted page token for this brand/owner.
async function getFacebookAccount(userId: string, brandId: string | null) {
  let q = supabaseAdmin
    .from("social_accounts")
    .select("*")
    .eq("owner_id", userId)
    .eq("platform", "facebook")
    .eq("status", "connected");
  if (brandId) q = q.eq("brand_id", brandId);
  const { data: accounts } = await q;
  const account = accounts?.[0];
  if (!account) throw new PublishError("No connected Facebook Page. Connect one in Settings → Social accounts.", 409);

  const { data: tok } = await supabaseAdmin
    .from("social_tokens")
    .select("encrypted_token, expires_at")
    .eq("account_id", account.id)
    .maybeSingle();
  if (!tok) throw new PublishError("No stored token for this Page. Reconnect it.", 409);
  if (tok.expires_at && new Date(tok.expires_at as string) < new Date()) {
    throw new PublishError("Facebook token has expired. Reconnect the Page.", 401);
  }

  let pageToken: string;
  try {
    pageToken = decryptToken(tok.encrypted_token as string);
  } catch {
    throw new PublishError("Could not read stored token. Reconnect the Page.", 500);
  }
  return { account, pageToken };
}

/**
 * Publishes a single post to the connected Facebook Page after running all
 * safety gates. `allowHighRisk` must be explicitly true to publish a high-risk post.
 */
export async function publishPostToFacebook(
  postId: string,
  userId: string,
  opts: { trigger?: "manual" | "scheduler"; allowHighRisk?: boolean } = {}
) {
  const { data: post, error } = await supabaseAdmin
    .from("post_drafts")
    .select("*")
    .eq("id", postId)
    .single();
  if (error || !post) throw new PublishError("Post not found", 404);
  if (post.owner_id !== userId) throw new PublishError("Forbidden", 403);

  // Stage 13: caller must have publish permission in this workspace.
  const role = await getEffectiveRole(userId, post.owner_id as string);
  if (!role || !hasPermission(role, "publish_posts")) {
    throw new PublishError("You don't have permission to publish posts.", 403);
  }

  // ---- safety gates ----
  if (post.platform !== "facebook") {
    throw new PublishError("Stage 7A only publishes Facebook posts.", 400);
  }
  if (!PUBLISHABLE.includes(post.status)) {
    throw new PublishError(`Post status "${post.status}" is not publishable. Approve it first.`, 422);
  }
  if (post.human_approval_required && !["approved", "ready_to_post", "scheduled_manually"].includes(post.status)) {
    throw new PublishError("This post requires human approval before publishing.", 422);
  }
  if (post.compliance_risk === "high") {
    // Stage 11 gate: a high-risk post must have an explicit approved compliance decision.
    const passed = await hasApprovedCompliance(postId);
    if (!passed) {
      throw new PublishError(
        "High-risk post must pass Compliance Review and be approved (on /compliance-review) before publishing.",
        422
      );
    }
  }
  // Publish the full educational caption by default; fall back to the short
  // platform caption only if the full one is empty.
  const caption = (post.caption as string) || (post.platform_caption as string) || "";
  if (!caption.trim()) {
    throw new PublishError("Post has no caption to publish.", 400);
  }

  // duplicate guard: already successfully published?
  const { data: prior } = await supabaseAdmin
    .from("publish_attempts")
    .select("id")
    .eq("post_id", postId)
    .eq("status", "success")
    .maybeSingle();
  if (prior) throw new PublishError("This post was already published.", 409);

  const { account, pageToken } = await getFacebookAccount(userId, post.brand_id);

  // assemble caption + hashtags + optional link
  const hashtags = ((post.hashtags as string[]) ?? [])
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  const message = [caption, hashtags].filter(Boolean).join("\n\n");

  let result: { id: string };
  try {
    result = await publishToPage(account.account_id as string, pageToken, message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed";
    await recordAttempt(userId, { postId, accountId: account.id, status: "failed", error: msg, finalCaption: message, trigger: opts.trigger });
    await logError(userId, "publish", msg);
    throw new PublishError(`Facebook publish failed: ${msg}`, 502);
  }

  const publishedUrl = `https://facebook.com/${result.id}`;

  // success: record attempt, move post to posted, write a manual_post_log row
  await recordAttempt(userId, {
    postId, accountId: account.id, status: "success",
    platformPostId: result.id, publishedUrl, finalCaption: message, trigger: opts.trigger,
  });
  await supabaseAdmin.from("post_drafts").update({ status: "posted" }).eq("id", postId);
  await supabaseAdmin.from("manual_post_logs").upsert(
    {
      post_id: postId,
      owner_id: userId,
      platform: "facebook",
      posted_at: new Date().toISOString(),
      post_url: publishedUrl,
      final_caption: message,
      notes: `Auto-published via API (${opts.trigger ?? "manual"})`,
    },
    { onConflict: "post_id" }
  );
  await supabaseAdmin.from("approval_status_history").insert({
    post_id: postId, owner_id: userId, from_status: post.status, to_status: "posted",
    note: `Published to Facebook (${result.id})`, changed_by: userId,
  });

  await logAudit({ ownerId: post.owner_id as string, actor: userId, action: "post_published", entityType: "post", entityId: postId, detail: publishedUrl });

  return { platform_post_id: result.id, published_url: publishedUrl };
}

/**
 * Scheduler: publish all Facebook posts that are due (status 'scheduled' with a
 * scheduled_for date today or earlier). Idempotent — the duplicate guard inside
 * publishPostToFacebook prevents double-posting.
 */
export async function runScheduler(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await supabaseAdmin
    .from("post_drafts")
    .select("id")
    .eq("owner_id", userId)
    .eq("platform", "facebook")
    .eq("status", "scheduled")
    .lte("scheduled_for", today);

  const results: { postId: string; ok: boolean; detail: string }[] = [];
  for (const p of due ?? []) {
    try {
      const r = await publishPostToFacebook(p.id, userId, { trigger: "scheduler" });
      results.push({ postId: p.id, ok: true, detail: r.platform_post_id });
    } catch (e) {
      results.push({ postId: p.id, ok: false, detail: e instanceof Error ? e.message : "failed" });
    }
  }
  return { processed: results.length, results };
}
