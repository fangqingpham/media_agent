import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptToken } from "@/lib/tokenCrypto";
import { listPagePosts, listPostComments } from "@/lib/facebook";
import { classifyInteraction, generateReply } from "@/services/interactionService";

export class SyncError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Cap how many NEW comments we process (and AI-classify) per run, to bound cost/time.
const MAX_NEW_PER_RUN = 40;
const MAX_POSTS = 25;
const MAX_COMMENTS_PER_POST = 50;

async function log(jobId: string, userId: string, level: string, message: string) {
  await supabaseAdmin.from("social_sync_logs").insert({ job_id: jobId, owner_id: userId, level, message });
}

// Connected accounts + last successful sync time + whether messaging is supported.
export async function getSyncStatus(userId: string) {
  const { data: accounts } = await supabaseAdmin
    .from("social_accounts")
    .select("id, platform, account_name, account_id, status, scopes, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  const out = [];
  for (const a of accounts ?? []) {
    const { data: lastJob } = await supabaseAdmin
      .from("social_sync_jobs")
      .select("status, finished_at, imported_count, skipped_count, error_message, created_at")
      .eq("owner_id", userId)
      .eq("account_id", a.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const scopes = (a.scopes as string[]) ?? [];
    out.push({
      ...a,
      comments_supported: a.platform === "facebook" && scopes.includes("pages_read_engagement"),
      // messaging needs pages_messaging + advanced access — not part of our current scopes
      messages_supported: scopes.includes("pages_messaging"),
      last_sync: lastJob ?? null,
    });
  }
  return out;
}

export async function listSyncJobs(userId: string, limit = 20) {
  const { data } = await supabaseAdmin
    .from("social_sync_jobs")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// Map our published Facebook post ids -> our internal post_drafts id, so imported
// comments can be linked to the post they belong to.
async function buildPublishedMap(userId: string): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin
    .from("publish_attempts")
    .select("post_id, platform_post_id")
    .eq("owner_id", userId)
    .eq("status", "success");
  const map = new Map<string, string>();
  for (const r of data ?? []) if (r.platform_post_id && r.post_id) map.set(r.platform_post_id as string, r.post_id as string);
  return map;
}

async function syncOneFacebookAccount(userId: string, account: Record<string, unknown>) {
  // start a job
  const { data: job } = await supabaseAdmin
    .from("social_sync_jobs")
    .insert({ owner_id: userId, account_id: account.id, platform: "facebook", status: "running" })
    .select()
    .single();
  const jobId = job!.id as string;

  try {
    // decrypt the Page token
    const { data: tok } = await supabaseAdmin
      .from("social_tokens")
      .select("encrypted_token")
      .eq("account_id", account.id)
      .maybeSingle();
    if (!tok) throw new SyncError("No stored token for this Page. Reconnect it.", 409);
    const pageToken = decryptToken(tok.encrypted_token as string);
    const pageId = account.account_id as string;

    const publishedMap = await buildPublishedMap(userId);

    const posts = await listPagePosts(pageId, pageToken, MAX_POSTS);
    await log(jobId, userId, "info", `Fetched ${posts.length} Page posts.`);

    let imported = 0;
    let skipped = 0;
    let scanned = 0;

    for (const post of posts) {
      if (imported >= MAX_NEW_PER_RUN) break;
      scanned++;
      let comments;
      try {
        comments = await listPostComments(post.id, pageToken, MAX_COMMENTS_PER_POST);
      } catch (e) {
        await log(jobId, userId, "warn", `Could not read comments on ${post.id}: ${e instanceof Error ? e.message : "error"}`);
        continue;
      }

      for (const c of comments) {
        if (imported >= MAX_NEW_PER_RUN) break;
        if (!c.message || !c.message.trim()) continue;
        // skip the Page's own comments/replies
        if (c.from?.id && c.from.id === pageId) continue;

        // dedupe
        const { data: exists } = await supabaseAdmin
          .from("imported_social_items")
          .select("id")
          .eq("owner_id", userId)
          .eq("platform", "facebook")
          .eq("external_id", c.id)
          .maybeSingle();
        if (exists) { skipped++; continue; }

        // create the interaction (reuses the Stage 4 inbox)
        const relatedPostId = publishedMap.get(post.id) ?? null;
        const { data: interaction, error: iErr } = await supabaseAdmin
          .from("social_interactions")
          .insert({
            owner_id: userId,
            brand_id: account.brand_id,
            related_post_id: relatedPostId,
            platform: "facebook",
            interaction_type: "public_comment",
            person_name: c.from?.name ?? null,
            profile_url: null,
            original_message: c.message,
            status: "new",
            notes: `Imported via API sync${c.permalink_url ? ` · ${c.permalink_url}` : ""}`,
          })
          .select()
          .single();
        if (iErr || !interaction) {
          await log(jobId, userId, "warn", `Could not save a comment: ${iErr?.message}`);
          continue;
        }

        // ledger entry (dedupe + traceability)
        await supabaseAdmin.from("imported_social_items").insert({
          owner_id: userId,
          account_id: account.id,
          platform: "facebook",
          item_type: "comment",
          external_id: c.id,
          interaction_id: interaction.id,
          raw: c,
        });

        // Stage 4 AI: classify + draft a reply (best-effort; never abort the run)
        try { await classifyInteraction(interaction.id, userId); } catch { /* keep going */ }
        try { await generateReply(interaction.id, userId); } catch { /* no active Brain etc. */ }

        imported++;
      }
    }

    await supabaseAdmin
      .from("social_sync_jobs")
      .update({ status: "success", scanned_count: scanned, imported_count: imported, skipped_count: skipped, finished_at: new Date().toISOString() })
      .eq("id", jobId);
    await log(jobId, userId, "info", `Done: ${imported} imported, ${skipped} duplicates skipped, ${scanned} posts scanned.`);

    return { accountId: account.id as string, accountName: account.account_name as string, imported, skipped, scanned, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    await supabaseAdmin
      .from("social_sync_jobs")
      .update({ status: "failed", error_message: msg, finished_at: new Date().toISOString() })
      .eq("id", jobId);
    await supabaseAdmin.from("sync_error_logs").insert({ owner_id: userId, job_id: jobId, platform: "facebook", context: "sync", error_message: msg });
    await log(jobId, userId, "error", msg);
    return { accountId: account.id as string, accountName: account.account_name as string, ok: false, error: msg };
  }
}

// Run a Facebook comment sync across the owner's connected Page(s).
export async function runFacebookSync(userId: string, accountId?: string) {
  let q = supabaseAdmin
    .from("social_accounts")
    .select("*")
    .eq("owner_id", userId)
    .eq("platform", "facebook")
    .eq("status", "connected");
  if (accountId) q = q.eq("id", accountId);
  const { data: accounts } = await q;

  if (!accounts || accounts.length === 0) {
    throw new SyncError("No connected Facebook Page. Connect one in Settings → Social accounts first.", 409);
  }

  const results = [];
  for (const a of accounts) results.push(await syncOneFacebookAccount(userId, a));
  const imported = results.reduce((n, r) => n + (r.imported ?? 0), 0);
  const skipped = results.reduce((n, r) => n + (r.skipped ?? 0), 0);
  return { platform: "facebook", accounts: results.length, imported, skipped, results };
}
