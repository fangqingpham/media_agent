import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { buildBrandBriefMessages } from "@/prompts/brandBrief";

/**
 * Generates a new versioned brand brief via OpenAI.
 * Enforces ownership in code because the admin client bypasses RLS.
 */
export async function generateBrandBrief(brandId: string, userId: string) {
  const { data: brand, error } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .single();
  if (error || !brand) throw new Error("Brand not found");
  if (brand.owner_id !== userId) throw new Error("Forbidden");

  const [{ data: voice }, { data: audiences }, { data: pillars }] =
    await Promise.all([
      supabaseAdmin.from("brand_voice").select("*").eq("brand_id", brandId).maybeSingle(),
      supabaseAdmin.from("target_audiences").select("*").eq("brand_id", brandId),
      supabaseAdmin.from("content_pillars").select("*").eq("brand_id", brandId),
    ]);

  const snapshot = { brand, voice, audiences, pillars };

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: buildBrandBriefMessages(snapshot),
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Model returned invalid JSON");
  }

  const { data: last } = await supabaseAdmin
    .from("brand_briefs")
    .select("version")
    .eq("brand_id", brandId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((last?.version as number | undefined) ?? 0) + 1;

  const { data: brief, error: insErr } = await supabaseAdmin
    .from("brand_briefs")
    .insert({
      brand_id: brandId,
      version,
      model: OPENAI_MODEL,
      status: "draft",
      system_context: parsed.system_context ?? null,
      voice_summary: parsed.voice_summary ?? null,
      audience_summary: parsed.audience_summary ?? null,
      pillars_summary: parsed.pillars_summary ?? null,
      sample_hooks: parsed.sample_hooks ?? [],
      sample_ctas: parsed.sample_ctas ?? [],
      compliance_flags: parsed.compliance_flags ?? [],
      raw_response: parsed,
      input_snapshot: snapshot,
      created_by: userId,
    })
    .select()
    .single();
  if (insErr) throw insErr;
  return brief;
}

/** Sets a brief as the single active version, archiving any previous active one. */
export async function activateBrief(briefId: string, brandId: string, userId: string) {
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("owner_id")
    .eq("id", brandId)
    .single();
  if (!brand || brand.owner_id !== userId) throw new Error("Forbidden");

  await supabaseAdmin
    .from("brand_briefs")
    .update({ status: "archived" })
    .eq("brand_id", brandId)
    .eq("status", "active");

  const { data, error } = await supabaseAdmin
    .from("brand_briefs")
    .update({ status: "active" })
    .eq("id", briefId)
    .eq("brand_id", brandId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
