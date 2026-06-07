import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { buildScoringMessages } from "@/prompts/leadScoring";
import { LEAD_STATUSES, LEAD_PRIORITIES } from "@/lib/leadTypes";

export class LeadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[+]?[\d\s().-]{7,20}$/;

async function loadOwned(id: string, userId: string) {
  const { data, error } = await supabaseAdmin.from("leads").select("*").eq("id", id).single();
  if (error || !data) throw new LeadError("Lead not found", 404);
  if (data.owner_id !== userId) throw new LeadError("Forbidden", 403);
  return data;
}

async function logActivity(leadId: string, userId: string, action: string, detail?: string) {
  await supabaseAdmin.from("lead_activity_logs").insert({
    lead_id: leadId,
    owner_id: userId,
    action,
    detail: detail ?? null,
    actor: userId,
  });
}

function validateContact(body: Record<string, unknown>) {
  if (body.email && !EMAIL_RE.test(String(body.email))) {
    throw new LeadError("Invalid email format", 400);
  }
  if (body.phone && !PHONE_RE.test(String(body.phone))) {
    throw new LeadError("Invalid phone format", 400);
  }
  if (body.follow_up_date && isNaN(Date.parse(String(body.follow_up_date)))) {
    throw new LeadError("Invalid follow-up date", 400);
  }
}

export type CreateLeadInput = Record<string, unknown> & {
  brand_id: string;
  source_interaction_id?: string | null;
};

export async function createLead(input: CreateLeadInput, userId: string) {
  if (!input.brand_id) throw new LeadError("brand_id is required", 400);

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("owner_id")
    .eq("id", input.brand_id)
    .single();
  if (!brand || brand.owner_id !== userId) throw new LeadError("Forbidden", 403);

  validateContact(input);

  // duplicate warning: same brand + same source interaction already a lead
  if (input.source_interaction_id) {
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("source_interaction_id", input.source_interaction_id)
      .maybeSingle();
    if (existing) {
      throw new LeadError("A lead already exists for this interaction", 409);
    }
  }

  const allowed = [
    "brand_id", "source_interaction_id", "source_post_id",
    "name", "platform", "profile_url", "email", "phone", "city", "province",
    "lead_category", "lead_status", "priority", "lead_score",
    "original_message", "intent_summary", "conversation_summary", "notes",
    "follow_up_date", "follow_up_notes", "last_contact_date",
  ];
  const row: Record<string, unknown> = { owner_id: userId };
  for (const k of allowed) if (input[k] !== undefined) row[k] = input[k];

  if (row.lead_status && !LEAD_STATUSES.includes(row.lead_status as never))
    throw new LeadError("Invalid lead_status", 400);
  if (row.priority && !LEAD_PRIORITIES.includes(row.priority as never))
    throw new LeadError("Invalid priority", 400);

  const { data, error } = await supabaseAdmin.from("leads").insert(row).select().single();
  if (error) throw new LeadError(`Could not create lead: ${error.message}`, 500);

  await logActivity(data.id, userId, "created", input.source_interaction_id ? "From interaction" : "Manual");
  return data;
}

export async function updateLead(id: string, input: Record<string, unknown>, userId: string) {
  const before = await loadOwned(id, userId);
  validateContact(input);

  const editable = [
    "name", "platform", "profile_url", "email", "phone", "city", "province",
    "lead_category", "lead_status", "priority", "lead_score",
    "original_message", "intent_summary", "conversation_summary", "notes",
    "follow_up_date", "follow_up_notes", "last_contact_date", "source_post_id",
  ];
  const update: Record<string, unknown> = {};
  for (const k of editable) if (input[k] !== undefined) update[k] = input[k];

  if (update.lead_status && !LEAD_STATUSES.includes(update.lead_status as never))
    throw new LeadError("Invalid lead_status", 400);
  if (update.priority && !LEAD_PRIORITIES.includes(update.priority as never))
    throw new LeadError("Invalid priority", 400);
  if (Object.keys(update).length === 0) throw new LeadError("No editable fields provided", 400);

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new LeadError(`Could not update lead: ${error.message}`, 500);

  // activity logs for meaningful changes
  if (update.lead_status && update.lead_status !== before.lead_status)
    await logActivity(id, userId, "status_changed", `${before.lead_status} → ${update.lead_status}`);
  if (update.priority && update.priority !== before.priority)
    await logActivity(id, userId, "priority_changed", `${before.priority} → ${update.priority}`);
  if (update.follow_up_date && update.follow_up_date !== before.follow_up_date)
    await logActivity(id, userId, "followup_changed", `Follow-up: ${update.follow_up_date}`);
  if ((update.email && update.email !== before.email) || (update.phone && update.phone !== before.phone))
    await logActivity(id, userId, "contact_updated", "Contact info updated");

  return data;
}

export async function addNote(id: string, note: string, userId: string) {
  const lead = await loadOwned(id, userId);
  if (!note || !note.trim()) throw new LeadError("Note is empty", 400);
  const combined = [lead.notes, `[${new Date().toLocaleString()}] ${note.trim()}`]
    .filter(Boolean)
    .join("\n");
  const { data, error } = await supabaseAdmin
    .from("leads")
    .update({ notes: combined })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new LeadError(`Could not add note: ${error.message}`, 500);
  await logActivity(id, userId, "note_added", note.trim().slice(0, 120));
  return data;
}

export async function scoreLead(id: string, userId: string) {
  const lead = await loadOwned(id, userId);
  const text = [lead.original_message, lead.intent_summary, lead.conversation_summary, lead.notes]
    .filter(Boolean)
    .join("\n");
  if (!text.trim()) throw new LeadError("Nothing to score — add a message or summary first", 400);

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("name")
    .eq("id", lead.brand_id)
    .single();

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: buildScoringMessages({
        brandName: brand?.name ?? "the brand",
        message: text,
        intentSummary: lead.intent_summary,
        category: lead.lead_category,
        platform: lead.platform,
      }),
      response_format: { type: "json_object" },
      temperature: 0.4,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    throw new LeadError(`Lead scoring failed: ${msg}`, 502);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch {
    throw new LeadError("Model returned invalid JSON. Try again.", 502);
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.lead_score) || 0)));
  const priority = LEAD_PRIORITIES.includes(parsed.priority as never)
    ? (parsed.priority as string)
    : lead.priority;

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update({
      lead_score: score,
      priority,
      lead_category: (parsed.lead_category as string) || lead.lead_category,
      score_reason: (parsed.reason as string) ?? null,
      suggested_next_action: (parsed.suggested_next_action as string) ?? null,
      suggested_follow_up_message: (parsed.suggested_follow_up_message as string) ?? null,
      missing_information: Array.isArray(parsed.missing_information_to_collect)
        ? parsed.missing_information_to_collect
        : [],
      scored_at: new Date().toISOString(),
      model: OPENAI_MODEL,
      raw_score: parsed,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new LeadError(`Could not save score: ${error.message}`, 500);

  await logActivity(id, userId, "score_updated", `Score ${score}, priority ${priority}`);
  return data;
}
