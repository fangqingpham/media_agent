import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Stage 13: append-only audit log. owner_id = the workspace owner whose data was
// acted on; actor = whoever performed the action. Best-effort: logging must never
// break the underlying action, so callers wrap this in try/catch or ignore failures.
export async function logAudit(args: {
  ownerId: string;
  actor: string;
  action: string;
  entityType?: string;
  entityId?: string | null;
  detail?: string | null;
}) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      owner_id: args.ownerId,
      actor_user_id: args.actor,
      action: args.action,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      detail: args.detail ?? null,
    });
  } catch {
    /* never let audit logging break the real action */
  }
}

export async function listAudit(ownerId: string, limit = 100) {
  const { data } = await supabaseAdmin
    .from("audit_logs")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
