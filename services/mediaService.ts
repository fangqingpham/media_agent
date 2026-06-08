import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ASSET_TYPES,
  ASSET_SOURCES,
  STORAGE_BUCKET,
  safeFileName,
  fileKindFromMime,
} from "@/lib/mediaTypes";

export class MediaError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function assertBrandOwned(brandId: string, userId: string) {
  const { data } = await supabaseAdmin.from("brands").select("owner_id").eq("id", brandId).single();
  if (!data || data.owner_id !== userId) throw new MediaError("Forbidden", 403);
}

async function loadOwnedAsset(id: string, userId: string) {
  const { data, error } = await supabaseAdmin.from("media_assets").select("*").eq("id", id).single();
  if (error || !data) throw new MediaError("Asset not found", 404);
  if (data.owner_id !== userId) throw new MediaError("Forbidden", 403);
  return data;
}

async function loadOwnedPost(id: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("post_drafts")
    .select("id, owner_id, platform")
    .eq("id", id)
    .single();
  if (error || !data) throw new MediaError("Post not found", 404);
  if (data.owner_id !== userId) throw new MediaError("Forbidden", 403);
  return data;
}

// ---------------- Storage ----------------

/**
 * Create a short-lived signed upload URL so the browser can upload the file
 * bytes DIRECTLY to Supabase Storage (keeping large files out of Next.js API
 * routes). Returns the path + token + the eventual public URL. If the bucket
 * isn't configured yet, returns a clear, actionable error.
 */
export async function createUploadUrl(brandId: string, filename: string, userId: string) {
  await assertBrandOwned(brandId, userId);
  const path = `${userId}/${brandId}/${Date.now()}_${safeFileName(filename)}`;

  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    // Most likely the bucket doesn't exist yet.
    throw new MediaError(
      `Storage not ready: ${error?.message || "unknown"}. Create a PUBLIC bucket named "${STORAGE_BUCKET}" in Supabase → Storage, then retry. (External Canva/CapCut/stock links work without storage.)`,
      503
    );
  }

  const publicUrl = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  return { path, token: data.token, signedUrl: data.signedUrl, publicUrl };
}

// ---------------- Assets ----------------

export async function listAssets(userId: string, brandId?: string) {
  let q = supabaseAdmin.from("media_assets").select("*").eq("owner_id", userId);
  if (brandId) q = q.eq("brand_id", brandId);
  const { data } = await q.order("created_at", { ascending: false });
  return data ?? [];
}

export async function createAsset(input: Record<string, unknown>, userId: string) {
  const brandId = String(input.brand_id || "");
  if (!brandId) throw new MediaError("brand_id is required", 400);
  await assertBrandOwned(brandId, userId);

  const title = String(input.title || "").trim();
  if (!title) throw new MediaError("Title is required", 400);

  const assetType = String(input.asset_type || "image");
  if (!ASSET_TYPES.includes(assetType as never)) throw new MediaError("Invalid asset_type", 400);

  const source = String(input.source || "upload");
  if (!ASSET_SOURCES.includes(source as never)) throw new MediaError("Invalid source", 400);

  const fileUrl = (input.file_url as string) || null;
  const externalLink = (input.external_edit_link as string) || null;

  // each source needs at least one reference
  if (source === "upload" && !fileUrl)
    throw new MediaError("Upload assets need a file_url (upload the file first).", 400);
  if (source === "stock" && !fileUrl)
    throw new MediaError("Stock assets need a URL.", 400);
  if (source === "external" && !externalLink && !fileUrl)
    throw new MediaError("External assets need a Canva/CapCut link or URL.", 400);

  const platforms = Array.isArray(input.platforms) ? (input.platforms as string[]) : [];
  const tags = Array.isArray(input.tags)
    ? (input.tags as string[])
    : String(input.tags || "").split(",").map((t) => t.trim()).filter(Boolean);

  const row = {
    owner_id: userId,
    brand_id: brandId,
    pillar_id: (input.pillar_id as string) || null,
    title,
    asset_type: assetType,
    platforms,
    tags,
    source,
    file_url: fileUrl,
    storage_path: (input.storage_path as string) || null,
    external_edit_link: externalLink,
    thumbnail_url: (input.thumbnail_url as string) || null,
    file_kind: (input.file_kind as string) || fileKindFromMime(input.mime_type as string),
    mime_type: (input.mime_type as string) || null,
    notes: (input.notes as string) || null,
  };

  const { data, error } = await supabaseAdmin.from("media_assets").insert(row).select().single();
  if (error) throw new MediaError(`Could not save asset: ${error.message}`, 500);
  return data;
}

export async function updateAsset(id: string, input: Record<string, unknown>, userId: string) {
  await loadOwnedAsset(id, userId);
  const editable = [
    "title", "asset_type", "platforms", "tags", "pillar_id",
    "file_url", "external_edit_link", "thumbnail_url", "notes", "file_kind",
  ];
  const update: Record<string, unknown> = {};
  for (const k of editable) if (input[k] !== undefined) update[k] = input[k];

  if (update.asset_type && !ASSET_TYPES.includes(update.asset_type as never))
    throw new MediaError("Invalid asset_type", 400);
  if (update.tags !== undefined && !Array.isArray(update.tags))
    update.tags = String(update.tags).split(",").map((t) => t.trim()).filter(Boolean);
  if (Object.keys(update).length === 0) throw new MediaError("No editable fields provided", 400);

  const { data, error } = await supabaseAdmin
    .from("media_assets")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new MediaError(`Could not update asset: ${error.message}`, 500);
  return data;
}

export async function deleteAsset(id: string, userId: string) {
  const asset = await loadOwnedAsset(id, userId);
  // best-effort: remove the underlying storage object for uploads
  if (asset.storage_path) {
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([asset.storage_path as string]).catch(() => {});
  }
  const { error } = await supabaseAdmin.from("media_assets").delete().eq("id", id);
  if (error) throw new MediaError(`Could not delete asset: ${error.message}`, 500);
  return { ok: true };
}

export async function getAsset(id: string, userId: string) {
  const asset = await loadOwnedAsset(id, userId);
  const usage = await getAssetUsage(id, userId);
  return { asset, ...usage };
}

// ---------------- Attach / detach ----------------

export async function listPostMedia(postId: string, userId: string) {
  await loadOwnedPost(postId, userId);
  const { data: links } = await supabaseAdmin
    .from("post_media_assets")
    .select("media_id")
    .eq("post_id", postId);
  const ids = (links ?? []).map((l) => l.media_id) as string[];
  if (ids.length === 0) return [];
  const { data: assets } = await supabaseAdmin.from("media_assets").select("*").in("id", ids);
  return assets ?? [];
}

export async function attachMedia(postId: string, mediaId: string, userId: string) {
  const post = await loadOwnedPost(postId, userId);
  await loadOwnedAsset(mediaId, userId);

  const { error } = await supabaseAdmin
    .from("post_media_assets")
    .insert({ owner_id: userId, post_id: postId, media_id: mediaId });
  if (error) {
    if (error.code === "23505") throw new MediaError("That media is already attached to this post.", 409);
    throw new MediaError(`Could not attach media: ${error.message}`, 500);
  }

  // usage log + last_used_date
  await supabaseAdmin.from("media_usage_logs").insert({
    owner_id: userId,
    media_id: mediaId,
    post_id: postId,
    platform: post.platform as string,
    note: "Attached to post",
  });
  await supabaseAdmin
    .from("media_assets")
    .update({ last_used_date: new Date().toISOString() })
    .eq("id", mediaId);

  return listPostMedia(postId, userId);
}

export async function detachMedia(postId: string, mediaId: string, userId: string) {
  await loadOwnedPost(postId, userId);
  const { error } = await supabaseAdmin
    .from("post_media_assets")
    .delete()
    .eq("post_id", postId)
    .eq("media_id", mediaId);
  if (error) throw new MediaError(`Could not remove media: ${error.message}`, 500);
  // usage log is intentionally kept as history
  return listPostMedia(postId, userId);
}

// ---------------- Usage ----------------

export async function getAssetUsage(mediaId: string, userId: string) {
  await loadOwnedAsset(mediaId, userId);

  const { data: logs } = await supabaseAdmin
    .from("media_usage_logs")
    .select("*")
    .eq("owner_id", userId)
    .eq("media_id", mediaId)
    .order("used_at", { ascending: false });

  const { data: links } = await supabaseAdmin
    .from("post_media_assets")
    .select("post_id")
    .eq("media_id", mediaId);
  const postIds = (links ?? []).map((l) => l.post_id) as string[];

  let posts: Record<string, unknown>[] = [];
  if (postIds.length) {
    const { data } = await supabaseAdmin
      .from("post_drafts")
      .select("id, title, platform, status, scheduled_for")
      .in("id", postIds);
    posts = data ?? [];
  }

  return { usage_logs: logs ?? [], used_in_posts: posts };
}
