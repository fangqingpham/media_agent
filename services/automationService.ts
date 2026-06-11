import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TRIGGERS,
  validateActions,
  isSafeAction,
  ALLOWED_STATUS_TARGETS,
  AutomationGuardError,
  type Trigger,
} from "@/lib/automationTypes";
import { reviewContent } from "@/services/complianceService";
import { generateReply } from "@/services/interactionService";
import { runScheduler } from "@/services/publishService";

export class AutomationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_ITEMS_PER_RULE = 50;

// ---------------- CRUD ----------------

function validateRuleInput(input: Record<string, unknown>) {
  const name = String(input.name || "").trim();
  if (!name) throw new AutomationError("Rule name is required", 400);
  const trigger = String(input.trigger || "");
  if (!TRIGGERS.includes(trigger as Trigger)) throw new AutomationError("Invalid trigger", 400);
  let actions;
  try {
    actions = validateActions(input.actions);
  } catch (e) {
    if (e instanceof AutomationGuardError) throw new AutomationError(e.message, 400);
    throw e;
  }
  const conditions = (input.conditions && typeof input.conditions === "object" ? input.conditions : {}) as Record<string, unknown>;
  return { name, trigger, actions, conditions };
}

export async function createRule(input: Record<string, unknown>, userId: string) {
  const v = validateRuleInput(input);
  const { data, error } = await supabaseAdmin
    .from("automation_rules")
    .insert({
      owner_id: userId,
      brand_id: (input.brand_id as string) || null,
      name: v.name,
      trigger: v.trigger,
      conditions: v.conditions,
      actions: v.actions,
      status: input.status === "paused" ? "paused" : "active",
    })
    .select()
    .single();
  if (error) throw new AutomationError(`Could not create rule: ${error.message}`, 500);
  return data;
}

export async function listRules(userId: string) {
  const { data } = await supabaseAdmin
    .from("automation_rules")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function loadOwnedRule(id: string, userId: string) {
  const { data, error } = await supabaseAdmin.from("automation_rules").select("*").eq("id", id).single();
  if (error || !data) throw new AutomationError("Rule not found", 404);
  if (data.owner_id !== userId) throw new AutomationError("Forbidden", 403);
  return data;
}

export async function getRule(id: string, userId: string) {
  return loadOwnedRule(id, userId);
}

export async function updateRule(id: string, input: Record<string, unknown>, userId: string) {
  await loadOwnedRule(id, userId);
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = String(input.name).trim();
  if (input.trigger !== undefined) {
    if (!TRIGGERS.includes(String(input.trigger) as Trigger)) throw new AutomationError("Invalid trigger", 400);
    update.trigger = input.trigger;
  }
  if (input.actions !== undefined) {
    try {
      update.actions = validateActions(input.actions);
    } catch (e) {
      if (e instanceof AutomationGuardError) throw new AutomationError(e.message, 400);
      throw e;
    }
  }
  if (input.conditions !== undefined) update.conditions = input.conditions;
  if (input.brand_id !== undefined) update.brand_id = input.brand_id || null;
  if (Object.keys(update).length === 0) throw new AutomationError("Nothing to update", 400);
  const { data, error } = await supabaseAdmin.from("automation_rules").update(update).eq("id", id).select().single();
  if (error) throw new AutomationError(`Could not update rule: ${error.message}`, 500);
  return data;
}

export async function setStatus(id: string, status: string, userId: string) {
  await loadOwnedRule(id, userId);
  if (!["active", "paused"].includes(status)) throw new AutomationError("Invalid status", 400);
  const { data, error } = await supabaseAdmin.from("automation_rules").update({ status }).eq("id", id).select().single();
  if (error) throw new AutomationError(`Could not update status: ${error.message}`, 500);
  return data;
}

export async function deleteRule(id: string, userId: string) {
  await loadOwnedRule(id, userId);
  const { error } = await supabaseAdmin.from("automation_rules").delete().eq("id", id);
  if (error) throw new AutomationError(`Could not delete rule: ${error.message}`, 500);
  return { ok: true };
}

export async function listRuns(userId: string, limit = 100) {
  const { data } = await supabaseAdmin
    .from("automation_rule_runs")
    .select("*, automation_rules(name)")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function listNotifications(userId: string, onlyUnread = false) {
  let q = supabaseAdmin.from("automation_notifications").select("*").eq("owner_id", userId);
  if (onlyUnread) q = q.eq("read", false);
  const { data } = await q.order("created_at", { ascending: false }).limit(100);
  return data ?? [];
}

export async function markNotificationRead(id: string, userId: string) {
  const { data } = await supabaseAdmin.from("automation_notifications").select("owner_id").eq("id", id).maybeSingle();
  if (!data || data.owner_id !== userId) throw new AutomationError("Not found", 404);
  await supabaseAdmin.from("automation_notifications").update({ read: true }).eq("id", id);
  return { ok: true };
}

// ---------------- Runner ----------------

async function notify(
  userId: string,
  ruleId: string,
  args: { kind?: "notify" | "reminder"; title: string; body?: string; level?: string; dedupKey: string }
) {
  // upsert with ignoreDuplicates so the same situation doesn't notify twice
  await supabaseAdmin
    .from("automation_notifications")
    .upsert(
      {
        owner_id: userId,
        rule_id: ruleId,
        kind: args.kind ?? "notify",
        title: args.title,
        body: args.body ?? null,
        level: args.level ?? "info",
        dedup_key: args.dedupKey,
      },
      { onConflict: "owner_id,dedup_key", ignoreDuplicates: true }
    );
}

async function recordRun(
  userId: string,
  ruleId: string,
  trigger: string,
  status: "success" | "failed" | "skipped",
  actionTaken: string | null,
  detail: string | null,
  error: string | null = null
) {
  await supabaseAdmin.from("automation_rule_runs").insert({
    owner_id: userId,
    rule_id: ruleId,
    trigger,
    status,
    action_taken: actionTaken,
    detail,
    error_message: error,
  });
}

type Ctx = { label: string; dedup: string; postId?: string | null; interactionId?: string | null; leadId?: string | null };

// Gather the entities a rule's trigger matches, as generic contexts.
async function gatherContexts(rule: Record<string, unknown>, userId: string, sinceIso: string): Promise<Ctx[]> {
  const trigger = rule.trigger as Trigger;
  const cond = (rule.conditions as Record<string, unknown>) ?? {};
  const ruleId = rule.id as string;
  const today = new Date().toISOString().slice(0, 10);
  const cap = <T>(rows: T[]): T[] => rows.slice(0, MAX_ITEMS_PER_RULE);

  switch (trigger) {
    case "followup_due": {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, name, follow_up_date, lead_status")
        .eq("owner_id", userId)
        .not("follow_up_date", "is", null)
        .lte("follow_up_date", today)
        .not("lead_status", "in", "(converted,closed_lost)");
      return cap(data ?? []).map((l) => ({ label: `Follow-up due: ${l.name ?? "lead"}`, dedup: `followup:${ruleId}:${l.id}:${l.follow_up_date}`, leadId: l.id as string }));
    }
    case "lead_score_updated": {
      const min = Number(cond.min_score ?? 80);
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, name, lead_score, updated_at")
        .eq("owner_id", userId)
        .gte("lead_score", min);
      return cap((data ?? []).filter((l) => !l.updated_at || (l.updated_at as string) >= sinceIso))
        .map((l) => ({ label: `Lead score ${l.lead_score}: ${l.name ?? "lead"}`, dedup: `score:${ruleId}:${l.id}:${l.lead_score}`, leadId: l.id as string }));
    }
    case "lead_created": {
      const { data } = await supabaseAdmin
        .from("leads").select("id, name, created_at").eq("owner_id", userId).gte("created_at", sinceIso);
      return cap(data ?? []).map((l) => ({ label: `New lead: ${l.name ?? "lead"}`, dedup: `newlead:${ruleId}:${l.id}`, leadId: l.id as string }));
    }
    case "compliance_risk_detected": {
      const { data: posts } = await supabaseAdmin
        .from("post_drafts").select("id, title").eq("owner_id", userId).eq("compliance_risk", "high");
      const out: Ctx[] = [];
      for (const p of cap(posts ?? [])) {
        const { data: existing } = await supabaseAdmin
          .from("compliance_reviews").select("id").eq("post_id", p.id).limit(1).maybeSingle();
        if (!existing) out.push({ label: `High-risk: ${p.title ?? "post"}`, dedup: `risk:${ruleId}:${p.id}`, postId: p.id as string });
      }
      return out;
    }
    case "publish_failed": {
      const { data } = await supabaseAdmin
        .from("publish_attempts").select("id, post_id, error_message, created_at")
        .eq("owner_id", userId).eq("status", "failed").gte("created_at", sinceIso);
      return cap(data ?? []).map((a) => ({ label: `Publish failed: ${a.error_message ?? ""}`, dedup: `pubfail:${ruleId}:${a.id}`, postId: a.post_id as string }));
    }
    case "post_published": {
      const { data } = await supabaseAdmin
        .from("publish_attempts").select("id, post_id, created_at")
        .eq("owner_id", userId).eq("status", "success").gte("created_at", sinceIso);
      return cap(data ?? []).map((a) => ({ label: `Post published`, dedup: `published:${ruleId}:${a.id}`, postId: a.post_id as string }));
    }
    case "keyword_matched": {
      const { data } = await supabaseAdmin
        .from("keyword_matches").select("id, interaction_id, created_at").eq("owner_id", userId).gte("created_at", sinceIso);
      return cap(data ?? []).map((m) => ({ label: `Keyword matched`, dedup: `kw:${ruleId}:${m.id}`, interactionId: (m.interaction_id as string) ?? null }));
    }
    case "interaction_created": {
      const { data } = await supabaseAdmin
        .from("social_interactions").select("id, person_name, created_at").eq("owner_id", userId).gte("created_at", sinceIso);
      return cap(data ?? []).map((i) => ({ label: `New interaction from ${i.person_name ?? "someone"}`, dedup: `intr:${ruleId}:${i.id}`, interactionId: i.id as string }));
    }
    case "performance_threshold_met": {
      const metric = String(cond.metric ?? "reach");
      const min = Number(cond.min_value ?? 1000);
      try {
        const { data } = await supabaseAdmin
          .from("post_performance_basic").select("*").eq("owner_id", userId);
        return cap((data ?? []).filter((r) => Number((r as Record<string, unknown>)[metric] ?? 0) >= min))
          .map((r) => ({ label: `Post passed ${metric} ≥ ${min}`, dedup: `perf:${ruleId}:${r.id}:${metric}`, postId: (r.post_id as string) ?? null }));
      } catch {
        return [];
      }
    }
    case "post_scheduled_due":
      return []; // handled specially in evaluateRule (delegates to the scheduler)
    default:
      return [];
  }
}

// Apply one safe action to one context. Returns a short description of what happened.
async function applyAction(
  rule: Record<string, unknown>,
  userId: string,
  action: { type: string; params?: Record<string, unknown> },
  ctx: Ctx
): Promise<{ taken: string } | { skipped: string }> {
  // run-time guardrail
  if (!isSafeAction(action.type)) {
    return { skipped: `Blocked unsafe action "${action.type}"` };
  }
  const ruleId = rule.id as string;
  const ruleName = rule.name as string;

  switch (action.type) {
    case "notify_admin":
      await notify(userId, ruleId, { title: `[${ruleName}] ${ctx.label}`, body: (action.params?.message as string) ?? null, level: (action.params?.level as string) ?? "info", dedupKey: `notify:${ctx.dedup}` });
      return { taken: "notified admin" };

    case "reminder":
    case "create_task":
      await notify(userId, ruleId, { kind: "reminder", title: `[${ruleName}] ${ctx.label}`, body: (action.params?.message as string) ?? "Reminder", level: "info", dedupKey: `reminder:${ctx.dedup}` });
      return { taken: "created reminder" };

    case "recommend_repurpose":
      await notify(userId, ruleId, { title: `[${ruleName}] Consider repurposing`, body: ctx.label, level: "info", dedupKey: `repurpose:${ctx.dedup}` });
      return { taken: "recommended repurpose" };

    case "generate_next_post_ideas":
      await notify(userId, ruleId, { title: `[${ruleName}] Generate next post ideas`, body: "Run the weekly AI report to get fresh post ideas.", level: "info", dedupKey: `ideas:${ctx.dedup}` });
      return { taken: "recommended idea generation" };

    case "send_to_compliance_review":
      if (!ctx.postId) return { skipped: "no post to review" };
      await reviewContent({ postId: ctx.postId }, userId);
      return { taken: "sent to compliance review" };

    case "create_lead_candidate":
      if (!ctx.interactionId) return { skipped: "no interaction" };
      await supabaseAdmin.from("social_interactions").update({ is_lead_candidate: true }).eq("id", ctx.interactionId).eq("owner_id", userId);
      await notify(userId, ruleId, { title: `[${ruleName}] Lead candidate flagged`, body: ctx.label, level: "info", dedupKey: `leadcand:${ctx.dedup}` });
      return { taken: "flagged lead candidate" };

    case "generate_reply_draft":
      if (!ctx.interactionId) return { skipped: "no interaction" };
      try {
        await generateReply(ctx.interactionId, userId); // DRAFT only — never sent
        return { taken: "generated reply draft" };
      } catch (e) {
        return { skipped: e instanceof Error ? e.message : "reply draft failed" };
      }

    case "update_status": {
      const target = String(action.params?.status ?? "");
      if (!ctx.postId) return { skipped: "no post" };
      if (!ALLOWED_STATUS_TARGETS.includes(target)) return { skipped: `status "${target}" not allowed` };
      await supabaseAdmin.from("post_drafts").update({ status: target }).eq("id", ctx.postId).eq("owner_id", userId);
      return { taken: `set status ${target}` };
    }

    default:
      return { skipped: `unhandled action ${action.type}` };
  }
}

async function evaluateRule(rule: Record<string, unknown>, userId: string) {
  const trigger = rule.trigger as Trigger;
  const sinceIso = (rule.last_run_at as string) || new Date(Date.now() - 7 * 864e5).toISOString();

  // Special case: due scheduled posts → delegate to the scheduler, which already
  // enforces the approval + compliance gates. Rules can never bypass those.
  if (trigger === "post_scheduled_due") {
    const r = await runScheduler(userId);
    const taken = `scheduler ran: ${r.processed} processed`;
    await recordRun(userId, rule.id as string, trigger, "success", taken, JSON.stringify(r.results).slice(0, 500));
    return { matched: r.processed, actions: r.processed, skipped: 0 };
  }

  const contexts = await gatherContexts(rule, userId, sinceIso);
  const actions = (rule.actions as { type: string; params?: Record<string, unknown> }[]) ?? [];

  if (contexts.length === 0) {
    await recordRun(userId, rule.id as string, trigger, "skipped", null, "no matching items");
    return { matched: 0, actions: 0, skipped: 0 };
  }

  let actionsRun = 0;
  let skipped = 0;
  for (const ctx of contexts) {
    for (const action of actions) {
      const res = await applyAction(rule, userId, action, ctx);
      if ("taken" in res) {
        actionsRun++;
        await recordRun(userId, rule.id as string, trigger, "success", res.taken, ctx.label);
      } else {
        skipped++;
        await recordRun(userId, rule.id as string, trigger, "skipped", action.type, res.skipped);
      }
    }
  }
  return { matched: contexts.length, actions: actionsRun, skipped };
}

// Run every active rule for the owner. Safe to call repeatedly (dedup + gates).
export async function runAutomations(userId: string) {
  const { data: rules } = await supabaseAdmin
    .from("automation_rules").select("*").eq("owner_id", userId).eq("status", "active");

  const summary: Record<string, unknown>[] = [];
  for (const rule of rules ?? []) {
    try {
      const res = await evaluateRule(rule, userId);
      await supabaseAdmin.from("automation_rules")
        .update({ last_run_at: new Date().toISOString(), run_count: (Number(rule.run_count) || 0) + 1 })
        .eq("id", rule.id);
      summary.push({ rule: rule.name, ok: true, ...res });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "rule failed";
      await recordRun(userId, rule.id as string, rule.trigger as string, "failed", null, null, msg);
      await supabaseAdmin.from("automation_errors").insert({ owner_id: userId, rule_id: rule.id, context: "run", error_message: msg });
      await supabaseAdmin.from("automation_rules")
        .update({ error_count: (Number(rule.error_count) || 0) + 1, last_run_at: new Date().toISOString() })
        .eq("id", rule.id);
      summary.push({ rule: rule.name, ok: false, error: msg });
    }
  }
  return { rules: (rules ?? []).length, summary };
}
