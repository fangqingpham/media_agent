import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { buildPostMessages } from "@/prompts/postGenerator";
import { scanCompliance, mergeRisk } from "@/lib/compliance";
import {
  CONTENT_TYPES,
  PLATFORMS,
  isVideoType,
  isCarouselType,
  type ContentType,
  type Platform,
  type RiskLevel,
} from "@/lib/contentTypes";

export type GenerateParams = {
  brandId: string;
  platform: Platform;
  contentType: ContentType;
  pillarId?: string | null;
  audienceId?: string | null;
  cta?: string | null;
  tone?: string | null;
  userInstruction?: string | null;
};

// A typed error so routes can map to the right HTTP status.
export class PostServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function assembleInput(p: GenerateParams, userId: string) {
  if (!PLATFORMS.includes(p.platform)) {
    throw new PostServiceError(`Invalid platform: ${p.platform}`);
  }
  if (!CONTENT_TYPES.includes(p.contentType)) {
    throw new PostServiceError(`Invalid content type: ${p.contentType}`);
  }

  const { data: brand, error: brandErr } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("id", p.brandId)
    .single();
  if (brandErr || !brand) throw new PostServiceError("Brand not found", 404);
  if (brand.owner_id !== userId) throw new PostServiceError("Forbidden", 403);

  // active Brand Brain is required
  const { data: brief } = await supabaseAdmin
    .from("brand_briefs")
    .select("*")
    .eq("brand_id", p.brandId)
    .eq("status", "active")
    .maybeSingle();
  if (!brief || !brief.system_context) {
    throw new PostServiceError(
      "No active Brand Brain found. Generate and activate a brief in the Content Brain first.",
      409
    );
  }

  const [{ data: voice }, pillarRes, audienceRes] = await Promise.all([
    supabaseAdmin.from("brand_voice").select("words_to_avoid").eq("brand_id", p.brandId).maybeSingle(),
    p.pillarId
      ? supabaseAdmin.from("content_pillars").select("name, description").eq("id", p.pillarId).maybeSingle()
      : Promise.resolve({ data: null }),
    p.audienceId
      ? supabaseAdmin.from("target_audiences").select("name, description").eq("id", p.audienceId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    brand,
    brief,
    messages: buildPostMessages({
      systemContext: brief.system_context,
      brandName: brand.name,
      complianceNotes: brand.compliance_notes,
      wordsToAvoid: voice?.words_to_avoid ?? [],
      platform: p.platform,
      contentType: p.contentType,
      pillar: pillarRes.data,
      audience: audienceRes.data,
      cta: p.cta,
      tone: p.tone,
      userInstruction: p.userInstruction,
    }),
  };
}

async function callModel(messages: ReturnType<typeof buildPostMessages>) {
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.8,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    throw new PostServiceError(`OpenAI request failed: ${msg}`, 502);
  }

  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new PostServiceError("Model returned invalid JSON. Try regenerating.", 502);
  }
}

// Builds the row fields from parsed AI output + deterministic compliance.
function buildContentFields(parsed: Record<string, unknown>, contentType: ContentType) {
  const text = [
    parsed.title,
    parsed.hook,
    parsed.caption,
    parsed.platform_caption,
    parsed.cta,
  ]
    .filter(Boolean)
    .join(" \n ");

  const aiRisk = (["low", "medium", "high"].includes(parsed.compliance_risk as string)
    ? parsed.compliance_risk
    : "low") as RiskLevel;
  const scan = scanCompliance(text);
  const merged = mergeRisk(aiRisk, scan);

  const reasonParts = [parsed.compliance_reason as string].filter(Boolean);
  if (scan.matched.length > 0) {
    reasonParts.push(`Auto-flagged terms: ${scan.matched.join(", ")}.`);
  }

  const claims = new Set<string>(
    Array.isArray(parsed.claims_to_check) ? (parsed.claims_to_check as string[]) : []
  );
  scan.matched.forEach((m) => claims.add(m));

  return {
    title: (parsed.title as string) ?? null,
    hook: (parsed.hook as string) ?? null,
    caption: (parsed.caption as string) ?? null,
    platform_caption: (parsed.platform_caption as string) ?? null,
    cta: (parsed.cta as string) ?? null,
    visual_idea: (parsed.visual_idea as string) ?? null,
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
    video_script: isVideoType(contentType) ? parsed.video_script ?? null : null,
    carousel_outline: isCarouselType(contentType) ? parsed.carousel_outline ?? null : null,
    compliance_risk: merged.risk,
    compliance_reason: reasonParts.join(" ") || null,
    human_approval_required: merged.humanApprovalRequired,
    claims_to_check: Array.from(claims),
    raw_response: parsed,
  };
}

export async function generatePost(p: GenerateParams, userId: string) {
  const { brand, brief, messages } = await assembleInput(p, userId);
  const parsed = await callModel(messages);
  const content = buildContentFields(parsed, p.contentType);

  const { data, error } = await supabaseAdmin
    .from("post_drafts")
    .insert({
      owner_id: userId,
      brand_id: brand.id,
      brief_id: brief.id,
      pillar_id: p.pillarId ?? null,
      audience_id: p.audienceId ?? null,
      platform: p.platform,
      content_type: p.contentType,
      status: "draft",
      tone: p.tone ?? null,
      user_instruction: p.userInstruction ?? null,
      model: OPENAI_MODEL,
      ...content,
    })
    .select()
    .single();
  if (error) throw new PostServiceError(`Could not save draft: ${error.message}`, 500);
  return data;
}

export async function regeneratePost(id: string, userId: string) {
  const { data: existing, error } = await supabaseAdmin
    .from("post_drafts")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !existing) throw new PostServiceError("Draft not found", 404);
  if (existing.owner_id !== userId) throw new PostServiceError("Forbidden", 403);

  const params: GenerateParams = {
    brandId: existing.brand_id,
    platform: existing.platform,
    contentType: existing.content_type,
    pillarId: existing.pillar_id,
    audienceId: existing.audience_id,
    cta: existing.cta,
    tone: existing.tone,
    userInstruction: existing.user_instruction,
  };

  const { brief, messages } = await assembleInput(params, userId);
  const parsed = await callModel(messages);
  const content = buildContentFields(parsed, existing.content_type);

  const { data, error: upErr } = await supabaseAdmin
    .from("post_drafts")
    .update({ brief_id: brief.id, model: OPENAI_MODEL, ...content })
    .eq("id", id)
    .select()
    .single();
  if (upErr) throw new PostServiceError(`Could not update draft: ${upErr.message}`, 500);
  return data;
}
