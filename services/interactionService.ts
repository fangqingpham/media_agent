import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { buildClassifyMessages } from "@/prompts/interactionClassify";
import { buildReplyMessages } from "@/prompts/interactionReply";
import { scanSensitive } from "@/lib/interactionCompliance";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export class InteractionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function loadOwned(id: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("social_interactions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new InteractionError("Interaction not found", 404);
  if (data.owner_id !== userId) throw new InteractionError("Forbidden", 403);
  return data;
}

async function callModel(messages: ChatCompletionMessageParam[]) {
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.6,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    throw new InteractionError(`OpenAI request failed: ${msg}`, 502);
  }
  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new InteractionError("Model returned invalid JSON. Try again.", 502);
  }
}

const RISK_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 };

export async function classifyInteraction(id: string, userId: string) {
  const it = await loadOwned(id, userId);
  if (!it.original_message || !it.original_message.trim()) {
    throw new InteractionError("Interaction has no message to classify", 400);
  }

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("name, compliance_notes")
    .eq("id", it.brand_id)
    .single();

  const parsed = await callModel(
    buildClassifyMessages({
      message: it.original_message,
      platform: it.platform,
      interactionType: it.interaction_type,
      brandName: brand?.name ?? "the brand",
      complianceNotes: brand?.compliance_notes ?? null,
    })
  );

  // deterministic sensitive scan overrides
  const scan = scanSensitive(it.original_message);
  let risk = (["low", "medium", "high"].includes(parsed.compliance_risk as string)
    ? (parsed.compliance_risk as string)
    : "low");
  if (scan.forceApproval && RISK_ORDER[risk] < RISK_ORDER.high) risk = "high";
  const humanApproval = !!parsed.human_approval_required || scan.forceApproval;

  const reason = [parsed.risk_reason as string]
    .filter(Boolean)
    .concat(scan.matched.length ? [`Auto-flagged: ${scan.matched.join(", ")}.`] : [])
    .join(" ");

  const categories = Array.isArray(parsed.categories) ? (parsed.categories as string[]) : [];
  const isLead =
    !!parsed.is_lead_candidate || categories.includes("lead") ||
    ["low", "medium", "high"].includes((parsed.lead_potential as string)) &&
      (parsed.lead_potential as string) !== "none" && (parsed.lead_potential as string) !== undefined;

  const { data, error } = await supabaseAdmin
    .from("social_interactions")
    .update({
      categories,
      intent_summary: (parsed.intent_summary as string) ?? null,
      lead_potential: (["none", "low", "medium", "high"].includes(parsed.lead_potential as string)
        ? parsed.lead_potential
        : null),
      urgency: (["low", "medium", "high"].includes(parsed.urgency as string) ? parsed.urgency : null),
      compliance_risk: risk,
      human_approval_required: humanApproval,
      risk_reason: reason || null,
      suggested_next_action: (parsed.suggested_next_action as string) ?? null,
      is_lead_candidate: isLead,
      suggested_lead_category: (parsed.suggested_lead_category as string) ?? null,
      classified_at: new Date().toISOString(),
      model: OPENAI_MODEL,
      raw_classification: parsed,
      status: it.status === "new" ? "classified" : it.status,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new InteractionError(`Could not save classification: ${error.message}`, 500);
  return data;
}

export async function generateReply(id: string, userId: string) {
  const it = await loadOwned(id, userId);
  if (!it.original_message || !it.original_message.trim()) {
    throw new InteractionError("Interaction has no message to reply to", 400);
  }

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("name")
    .eq("id", it.brand_id)
    .single();

  const { data: brief } = await supabaseAdmin
    .from("brand_briefs")
    .select("system_context")
    .eq("brand_id", it.brand_id)
    .eq("status", "active")
    .maybeSingle();
  if (!brief || !brief.system_context) {
    throw new InteractionError(
      "No active Brand Brain found. Activate a brief in the Content Brain first.",
      409
    );
  }

  const parsed = await callModel(
    buildReplyMessages({
      systemContext: brief.system_context,
      brandName: brand?.name ?? "the brand",
      message: it.original_message,
      platform: it.platform,
      interactionType: it.interaction_type,
      classification: it.raw_classification ?? null,
    })
  );

  const replyDrafts = {
    public_reply: (parsed.public_reply as string) ?? "",
    dm_reply: (parsed.dm_reply as string) ?? "",
    follow_up_question: (parsed.follow_up_question as string) ?? "",
    booking_cta: (parsed.booking_cta as string) ?? "",
    disclaimer: (parsed.disclaimer as string) ?? "",
  };

  const { data, error } = await supabaseAdmin
    .from("social_interactions")
    .update({
      reply_drafts: replyDrafts,
      raw_reply: parsed,
      model: OPENAI_MODEL,
      status: ["new", "classified"].includes(it.status) ? "reply_drafted" : it.status,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new InteractionError(`Could not save reply: ${error.message}`, 500);
  return data;
}

export async function changeInteractionStatus(
  id: string,
  toStatus: string,
  userId: string,
  note?: string | null
) {
  const it = await loadOwned(id, userId);
  const from = it.status as string;

  if (from !== toStatus) {
    const { error: upErr } = await supabaseAdmin
      .from("social_interactions")
      .update({ status: toStatus })
      .eq("id", id);
    if (upErr) throw new InteractionError(`Could not update status: ${upErr.message}`, 500);

    const { error: histErr } = await supabaseAdmin.from("interaction_status_history").insert({
      interaction_id: id,
      owner_id: userId,
      from_status: from,
      to_status: toStatus,
      note: note ?? null,
      changed_by: userId,
    });
    if (histErr) throw new InteractionError(`Status changed but history failed: ${histErr.message}`, 500);
  }

  const { data } = await supabaseAdmin.from("social_interactions").select("*").eq("id", id).single();
  return data;
}
