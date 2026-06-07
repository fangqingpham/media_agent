import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canTransition } from "@/lib/statusFlow";

export class WorkflowError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function loadOwnedPost(postId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("post_drafts")
    .select("*")
    .eq("id", postId)
    .single();
  if (error || !data) throw new WorkflowError("Draft not found", 404);
  if (data.owner_id !== userId) throw new WorkflowError("Forbidden", 403);
  return data;
}

/** Validates the transition, updates status, and records history. */
export async function changePostStatus(
  postId: string,
  toStatus: string,
  userId: string,
  note?: string | null
) {
  const post = await loadOwnedPost(postId, userId);
  const fromStatus = post.status as string;

  if (!canTransition(fromStatus, toStatus)) {
    throw new WorkflowError(
      `Invalid status transition: ${fromStatus} → ${toStatus}`,
      422
    );
  }

  if (fromStatus !== toStatus) {
    const { error: upErr } = await supabaseAdmin
      .from("post_drafts")
      .update({ status: toStatus })
      .eq("id", postId);
    if (upErr) throw new WorkflowError(`Could not update status: ${upErr.message}`, 500);

    const { error: histErr } = await supabaseAdmin
      .from("approval_status_history")
      .insert({
        post_id: postId,
        owner_id: userId,
        from_status: fromStatus,
        to_status: toStatus,
        note: note ?? null,
        changed_by: userId,
      });
    if (histErr) {
      // history is important but shouldn't silently corrupt; surface it
      throw new WorkflowError(`Status changed but history failed: ${histErr.message}`, 500);
    }
  }

  const { data } = await supabaseAdmin
    .from("post_drafts")
    .select("*")
    .eq("id", postId)
    .single();
  return data;
}

export async function getStatusHistory(postId: string, userId: string) {
  await loadOwnedPost(postId, userId);
  const { data, error } = await supabaseAdmin
    .from("approval_status_history")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  if (error) throw new WorkflowError(error.message, 400);
  return data;
}

function isValidUrl(u: string) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ManualLogInput = {
  scheduledAt?: string | null;
  postedAt?: string | null;
  postUrl?: string | null;
  finalCaption?: string | null;
  notes?: string | null;
};

/** Upserts the single manual post log for a post (unique post_id). */
export async function saveManualLog(postId: string, userId: string, input: ManualLogInput) {
  const post = await loadOwnedPost(postId, userId);

  if (input.postUrl && !isValidUrl(input.postUrl)) {
    throw new WorkflowError("Invalid post URL (must start with http:// or https://)", 400);
  }

  const row = {
    post_id: postId,
    owner_id: userId,
    platform: post.platform,
    scheduled_at: input.scheduledAt ?? null,
    posted_at: input.postedAt ?? null,
    post_url: input.postUrl ?? null,
    final_caption: input.finalCaption ?? null,
    notes: input.notes ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("manual_post_logs")
    .upsert(row, { onConflict: "post_id" })
    .select()
    .single();
  if (error) throw new WorkflowError(`Could not save manual log: ${error.message}`, 500);
  return data;
}

export async function getManualLog(postId: string, userId: string) {
  await loadOwnedPost(postId, userId);
  const { data } = await supabaseAdmin
    .from("manual_post_logs")
    .select("*")
    .eq("post_id", postId)
    .maybeSingle();
  return data;
}

export type PerformanceInput = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  dms?: number;
  leads?: number;
  notes?: string | null;
};

export async function savePerformance(postId: string, userId: string, input: PerformanceInput) {
  await loadOwnedPost(postId, userId);
  const num = (v: unknown) => (typeof v === "number" && v >= 0 ? Math.floor(v) : 0);

  const row = {
    post_id: postId,
    owner_id: userId,
    views: num(input.views),
    likes: num(input.likes),
    comments: num(input.comments),
    shares: num(input.shares),
    saves: num(input.saves),
    dms: num(input.dms),
    leads: num(input.leads),
    notes: input.notes ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("post_performance_basic")
    .upsert(row, { onConflict: "post_id" })
    .select()
    .single();
  if (error) throw new WorkflowError(`Could not save performance: ${error.message}`, 500);
  return data;
}

export async function getPerformance(postId: string, userId: string) {
  await loadOwnedPost(postId, userId);
  const { data } = await supabaseAdmin
    .from("post_performance_basic")
    .select("*")
    .eq("post_id", postId)
    .maybeSingle();
  return data;
}
