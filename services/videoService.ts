import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { buildVideoKitMessages, type VideoKitInput } from "@/prompts/videoKit";
import { buildBatchPlanMessages } from "@/prompts/batchPlan";
import { scanCompliance, mergeRisk } from "@/lib/compliance";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { RiskLevel } from "@/lib/contentTypes";

export class VideoError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const DURATIONS = [15, 30, 45];
const PLATFORMS = ["facebook", "instagram", "tiktok"];

async function callJson(messages: ChatCompletionMessageParam[], temperature = 0.8) {
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    throw new VideoError(`OpenAI request failed: ${msg}`, 502);
  }
  try {
    return JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
  } catch {
    throw new VideoError("Model returned invalid JSON. Try again.", 502);
  }
}

// Loads brand + active Brain + words-to-avoid + optional pillar (mirrors postService).
async function loadBrandContext(brandId: string, userId: string, pillarId?: string | null) {
  const { data: brand } = await supabaseAdmin.from("brands").select("*").eq("id", brandId).single();
  if (!brand) throw new VideoError("Brand not found", 404);
  if (brand.owner_id !== userId) throw new VideoError("Forbidden", 403);

  const { data: brief } = await supabaseAdmin
    .from("brand_briefs")
    .select("id, system_context")
    .eq("brand_id", brandId)
    .eq("status", "active")
    .maybeSingle();
  if (!brief || !brief.system_context) {
    throw new VideoError("No active Brand Brain found. Activate a brief in the Content Brain first.", 409);
  }

  const [{ data: voice }, pillarRes] = await Promise.all([
    supabaseAdmin.from("brand_voice").select("words_to_avoid").eq("brand_id", brandId).maybeSingle(),
    pillarId
      ? supabaseAdmin.from("content_pillars").select("name, description").eq("id", pillarId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return { brand, brief, wordsToAvoid: voice?.words_to_avoid ?? [], pillar: pillarRes.data };
}

function deriveCompliance(parsed: Record<string, unknown>) {
  const sceneText = Array.isArray(parsed.scenes)
    ? (parsed.scenes as Record<string, unknown>[])
        .map((s) => [s.dialogue, s.on_screen, s.motion_prompt].filter(Boolean).join(" "))
        .join(" ")
    : "";
  const text = [
    parsed.hook,
    parsed.voiceover,
    Array.isArray(parsed.on_screen_text) ? (parsed.on_screen_text as string[]).join(" ") : "",
    sceneText,
    parsed.caption,
    parsed.cta,
  ]
    .filter(Boolean)
    .join("\n");
  const aiRisk = (["low", "medium", "high"].includes(parsed.compliance_risk_level as string)
    ? parsed.compliance_risk_level
    : "low") as RiskLevel;
  const scan = scanCompliance(text);
  const merged = mergeRisk(aiRisk, scan);
  const reason = [parsed.compliance_reason as string]
    .filter(Boolean)
    .concat(scan.matched.length ? [`Auto-flagged: ${scan.matched.join(", ")}.`] : [])
    .join(" ");
  return { risk: merged.risk, humanApproval: merged.humanApprovalRequired, reason: reason || null };
}

// Persists a kit + its scenes; returns the saved kit.
async function saveKit(
  parsed: Record<string, unknown>,
  meta: {
    userId: string;
    brandId: string;
    postId?: string | null;
    pillarId?: string | null;
    platform: string;
    durationSeconds: number;
    topic?: string | null;
  }
) {
  const compliance = deriveCompliance(parsed);
  const { data: kit, error } = await supabaseAdmin
    .from("video_kits")
    .insert({
      owner_id: meta.userId,
      brand_id: meta.brandId,
      post_id: meta.postId ?? null,
      pillar_id: meta.pillarId ?? null,
      platform: meta.platform,
      duration_seconds: meta.durationSeconds,
      title: (parsed.video_title as string) ?? null,
      hook: (parsed.hook as string) ?? null,
      hook_variations: Array.isArray(parsed.hook_variations) ? parsed.hook_variations : [],
      voiceover: (parsed.voiceover as string) ?? null,
      on_screen_text: Array.isArray(parsed.on_screen_text) ? parsed.on_screen_text : [],
      broll_suggestions: Array.isArray(parsed.broll_suggestions) ? parsed.broll_suggestions : [],
      filming_notes: (parsed.filming_notes as string) ?? null,
      thumbnail_text: (parsed.thumbnail_text as string) ?? null,
      editing_notes: (parsed.editing_notes as string) ?? null,
      ai_video_prompt: (parsed.ai_video_prompt as string) ?? null,
      caption: (parsed.caption as string) ?? null,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      cta: (parsed.cta as string) ?? null,
      compliance_risk: compliance.risk,
      compliance_reason: compliance.reason,
      human_approval_required: compliance.humanApproval,
      topic: meta.topic ?? null,
      model: OPENAI_MODEL,
      raw_response: parsed,
    })
    .select()
    .single();
  if (error) throw new VideoError(`Could not save kit: ${error.message}`, 500);

  // scene-by-scene shot list rows
  const scenes = Array.isArray(parsed.scenes) ? (parsed.scenes as Record<string, unknown>[]) : [];
  if (scenes.length) {
    const rows = scenes.map((s, i) => ({
      owner_id: meta.userId,
      kit_id: kit.id,
      scene_number: Number(s.scene_number) || i + 1,
      timestamp_label: (s.timestamp as string) ?? null,
      shot_description: (s.shot_description as string) ?? null,
      voiceover: (s.voiceover as string) ?? (s.dialogue as string) ?? null,
      on_screen: (s.on_screen as string) ?? null,
    }));
    await supabaseAdmin.from("video_scenes").insert(rows);
  }

  return kit;
}

export type GenerateKitParams = {
  brandId: string;
  platform: string;
  durationSeconds: number;
  pillarId?: string | null;
  topic?: string | null;
  postId?: string | null;
};

export async function generateVideoKit(p: GenerateKitParams, userId: string) {
  if (!PLATFORMS.includes(p.platform)) throw new VideoError("Invalid platform", 400);
  if (!DURATIONS.includes(p.durationSeconds)) throw new VideoError("Duration must be 15, 30, or 45", 400);

  const ctx = await loadBrandContext(p.brandId, userId, p.pillarId);

  let basis: VideoKitInput["basis"] = null;
  if (p.postId) {
    const { data: post } = await supabaseAdmin
      .from("post_drafts")
      .select("owner_id, title, hook, caption, platform_caption, cta, visual_idea")
      .eq("id", p.postId)
      .single();
    if (!post || post.owner_id !== userId) throw new VideoError("Post not found", 404);
    basis = {
      title: post.title,
      hook: post.hook,
      caption: post.platform_caption || post.caption,
      cta: post.cta,
      visualIdea: post.visual_idea,
    };
  }

  const parsed = await callJson(
    buildVideoKitMessages({
      systemContext: ctx.brief.system_context as string,
      brandName: ctx.brand.name as string,
      complianceNotes: ctx.brand.compliance_notes as string,
      wordsToAvoid: ctx.wordsToAvoid as string[],
      platform: p.platform,
      durationSeconds: p.durationSeconds,
      pillar: ctx.pillar,
      topic: p.topic,
      basis,
    })
  );

  return saveKit(parsed, {
    userId,
    brandId: p.brandId,
    postId: p.postId ?? null,
    pillarId: p.pillarId ?? null,
    platform: p.platform,
    durationSeconds: p.durationSeconds,
    topic: p.topic ?? null,
  });
}

// "Generate video production kit" from a draft detail page.
export async function generateKitFromDraft(
  postId: string,
  userId: string,
  durationSeconds = 30
) {
  const { data: post } = await supabaseAdmin
    .from("post_drafts")
    .select("owner_id, brand_id, platform, pillar_id")
    .eq("id", postId)
    .single();
  if (!post || post.owner_id !== userId) throw new VideoError("Post not found", 404);

  return generateVideoKit(
    {
      brandId: post.brand_id as string,
      platform: post.platform as string,
      durationSeconds,
      pillarId: post.pillar_id as string,
      postId,
    },
    userId
  );
}

export async function listKits(userId: string, opts: { brandId?: string; postId?: string } = {}) {
  let q = supabaseAdmin.from("video_kits").select("*").eq("owner_id", userId);
  if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  if (opts.postId) q = q.eq("post_id", opts.postId);
  const { data } = await q.order("created_at", { ascending: false });
  return data ?? [];
}

async function loadOwnedKit(id: string, userId: string) {
  const { data, error } = await supabaseAdmin.from("video_kits").select("*").eq("id", id).single();
  if (error || !data) throw new VideoError("Kit not found", 404);
  if (data.owner_id !== userId) throw new VideoError("Forbidden", 403);
  return data;
}

export async function getKit(id: string, userId: string) {
  const kit = await loadOwnedKit(id, userId);
  const { data: scenes } = await supabaseAdmin
    .from("video_scenes")
    .select("*")
    .eq("kit_id", id)
    .order("scene_number", { ascending: true });
  const { data: notes } = await supabaseAdmin
    .from("video_production_notes")
    .select("*")
    .eq("kit_id", id)
    .order("created_at", { ascending: false });
  return { kit, scenes: scenes ?? [], notes: notes ?? [] };
}

export async function updateKit(id: string, input: Record<string, unknown>, userId: string) {
  await loadOwnedKit(id, userId);
  const editable = [
    "title", "hook", "voiceover", "filming_notes", "thumbnail_text",
    "editing_notes", "ai_video_prompt", "caption", "cta", "hashtags",
  ];
  const update: Record<string, unknown> = {};
  for (const k of editable) if (input[k] !== undefined) update[k] = input[k];
  if (Object.keys(update).length === 0) throw new VideoError("No editable fields provided", 400);
  const { data, error } = await supabaseAdmin
    .from("video_kits")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new VideoError(`Could not update kit: ${error.message}`, 500);
  return data;
}

export async function deleteKit(id: string, userId: string) {
  await loadOwnedKit(id, userId);
  const { error } = await supabaseAdmin.from("video_kits").delete().eq("id", id);
  if (error) throw new VideoError(`Could not delete kit: ${error.message}`, 500);
  return { ok: true };
}

export async function attachKitToPost(kitId: string, postId: string, userId: string) {
  await loadOwnedKit(kitId, userId);
  const { data: post } = await supabaseAdmin
    .from("post_drafts")
    .select("owner_id")
    .eq("id", postId)
    .single();
  if (!post || post.owner_id !== userId) throw new VideoError("Post not found", 404);
  const { data, error } = await supabaseAdmin
    .from("video_kits")
    .update({ post_id: postId })
    .eq("id", kitId)
    .select()
    .single();
  if (error) throw new VideoError(`Could not attach kit: ${error.message}`, 500);
  return data;
}

export async function addProductionNote(kitId: string, note: string, userId: string) {
  const kit = await loadOwnedKit(kitId, userId);
  if (!note || !note.trim()) throw new VideoError("Note is empty", 400);
  const { data, error } = await supabaseAdmin
    .from("video_production_notes")
    .insert({ owner_id: userId, kit_id: kitId, post_id: kit.post_id, note: note.trim() })
    .select()
    .single();
  if (error) throw new VideoError(`Could not add note: ${error.message}`, 500);
  return data;
}

// ---------------- Batch recording plans ----------------

export async function generateBatchPlan(
  p: { brandId: string; postIds: string[]; title?: string | null },
  userId: string
) {
  if (!p.brandId) throw new VideoError("brand_id is required", 400);
  if (!Array.isArray(p.postIds) || p.postIds.length < 2)
    throw new VideoError("Select at least 2 posts for a batch plan", 400);
  if (p.postIds.length > 12) throw new VideoError("Batch plans support up to 12 posts", 400);

  const ctx = await loadBrandContext(p.brandId, userId);

  const { data: posts } = await supabaseAdmin
    .from("post_drafts")
    .select("id, title, platform, content_type, hook, visual_idea, owner_id")
    .in("id", p.postIds);
  const owned = (posts ?? []).filter((x) => x.owner_id === userId);
  if (owned.length < 2) throw new VideoError("Could not find enough of your posts to plan", 400);

  const parsed = await callJson(
    buildBatchPlanMessages({
      brandName: ctx.brand.name as string,
      posts: owned.map((x) => ({
        title: (x.title as string) || "(untitled)",
        platform: x.platform as string,
        content_type: x.content_type as string,
        hook: x.hook as string,
        visual_idea: x.visual_idea as string,
      })),
    }),
    0.5
  );

  const { data, error } = await supabaseAdmin
    .from("batch_recording_plans")
    .insert({
      owner_id: userId,
      brand_id: p.brandId,
      title: p.title || `Batch plan (${owned.length} posts)`,
      post_ids: owned.map((x) => x.id),
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      shot_checklist: Array.isArray(parsed.shot_checklist) ? parsed.shot_checklist : [],
      estimated_minutes: Number(parsed.estimated_minutes) || null,
      model: OPENAI_MODEL,
      raw_response: parsed,
    })
    .select()
    .single();
  if (error) throw new VideoError(`Could not save plan: ${error.message}`, 500);
  return data;
}

export async function listBatchPlans(userId: string, brandId?: string) {
  let q = supabaseAdmin.from("batch_recording_plans").select("*").eq("owner_id", userId);
  if (brandId) q = q.eq("brand_id", brandId);
  const { data } = await q.order("created_at", { ascending: false });
  return data ?? [];
}

export async function getBatchPlan(id: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("batch_recording_plans")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new VideoError("Plan not found", 404);
  if (data.owner_id !== userId) throw new VideoError("Forbidden", 403);
  return data;
}

export async function deleteBatchPlan(id: string, userId: string) {
  await getBatchPlan(id, userId);
  const { error } = await supabaseAdmin.from("batch_recording_plans").delete().eq("id", id);
  if (error) throw new VideoError(`Could not delete plan: ${error.message}`, 500);
  return { ok: true };
}
