import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ROLE_PERMISSIONS, hasPermission, type Role, type Permission } from "@/lib/permissions";
import { logAudit } from "@/services/auditService";

export class TeamError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Cache an auth user's email/name into user_profiles (best-effort).
export async function ensureProfile(userId: string) {
  const { data: existing } = await supabaseAdmin.from("user_profiles").select("id").eq("id", userId).maybeSingle();
  if (existing) return;
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
  await supabaseAdmin.from("user_profiles").insert({
    id: userId,
    email: u?.user?.email ?? null,
    display_name: (u?.user?.user_metadata?.full_name as string) ?? u?.user?.email ?? null,
  });
}

/**
 * The caller's effective role within a given workspace (ownerId's data):
 *  - 'owner' if the caller IS the owner
 *  - their active team_members.role if they're a member
 *  - null if they have no access
 */
export async function getEffectiveRole(callerId: string, ownerId: string): Promise<Role | null> {
  if (callerId === ownerId) return "owner";
  const { data } = await supabaseAdmin
    .from("team_members")
    .select("role, status")
    .eq("owner_id", ownerId)
    .eq("member_user_id", callerId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  return data.role as Role;
}

// Throw unless the caller has `perm` within ownerId's workspace.
export async function requirePermission(callerId: string, ownerId: string, perm: Permission) {
  const role = await getEffectiveRole(callerId, ownerId);
  if (!role || !hasPermission(role, perm)) {
    throw new TeamError(`You don't have permission to ${perm.replace(/_/g, " ")}.`, 403);
  }
  return role;
}

// What the current user can do in their OWN workspace + any memberships.
export async function getMe(userId: string) {
  await ensureProfile(userId);
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("*").eq("id", userId).maybeSingle();
  // memberships in other people's workspaces
  const { data: memberships } = await supabaseAdmin
    .from("team_members")
    .select("owner_id, role, status, assigned_brands")
    .eq("member_user_id", userId)
    .eq("status", "active");
  // in their own workspace the user is owner
  return {
    profile: profile ?? { id: userId },
    role: "owner" as Role, // own workspace
    permissions: ROLE_PERMISSIONS.owner,
    memberships: memberships ?? [],
  };
}

export async function listTeam(ownerId: string) {
  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  // attach profile info for linked members
  const ids = (members ?? []).map((m) => m.member_user_id).filter(Boolean) as string[];
  const profiles = new Map<string, Record<string, unknown>>();
  if (ids.length) {
    const { data: ps } = await supabaseAdmin.from("user_profiles").select("*").in("id", ids);
    for (const p of ps ?? []) profiles.set(p.id as string, p);
  }
  return (members ?? []).map((m) => ({
    ...m,
    permissions: ROLE_PERMISSIONS[m.role as Role] ?? [],
    profile: m.member_user_id ? profiles.get(m.member_user_id as string) ?? null : null,
  }));
}

// Invite a member by email. We create a team_members row and, if an auth user
// with that email already exists, link them immediately. No email is sent yet
// (see TODO) — the owner shares the app URL out of band.
export async function inviteMember(
  ownerId: string,
  input: { email?: string; role?: string; assigned_brands?: string[] }
) {
  const email = (input.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new TeamError("A valid email is required", 400);
  const role = (input.role || "agent") as Role;
  if (!["admin", "manager", "agent", "viewer"].includes(role))
    throw new TeamError("Invalid role (cannot invite another owner)", 400);

  // try to find an existing auth user with this email (best-effort scan)
  let memberUserId: string | null = null;
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers();
    const found = data?.users?.find((u) => u.email?.toLowerCase() === email);
    if (found) memberUserId = found.id;
  } catch {
    /* listing may be paginated/limited; linking still happens on first login via linkPendingInvites */
  }

  const { data, error } = await supabaseAdmin
    .from("team_members")
    .insert({
      owner_id: ownerId,
      member_user_id: memberUserId,
      invite_email: email,
      role,
      status: memberUserId ? "active" : "pending",
      assigned_brands: input.assigned_brands ?? [],
      invited_by: ownerId,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new TeamError("That email is already on your team.", 409);
    throw new TeamError(`Could not invite: ${error.message}`, 500);
  }
  await logAudit({ ownerId, actor: ownerId, action: "team_member_invited", entityType: "team", entityId: data.id, detail: `${email} as ${role}` });
  return data;
}

export async function updateMember(
  ownerId: string,
  memberId: string,
  input: { role?: string; status?: string; assigned_brands?: string[] }
) {
  const { data: member } = await supabaseAdmin.from("team_members").select("*").eq("id", memberId).maybeSingle();
  if (!member || member.owner_id !== ownerId) throw new TeamError("Member not found", 404);

  const update: Record<string, unknown> = {};
  if (input.role !== undefined) {
    if (!["admin", "manager", "agent", "viewer"].includes(input.role)) throw new TeamError("Invalid role", 400);
    update.role = input.role;
  }
  if (input.status !== undefined) {
    if (!["pending", "active", "disabled"].includes(input.status)) throw new TeamError("Invalid status", 400);
    update.status = input.status;
  }
  if (input.assigned_brands !== undefined) update.assigned_brands = input.assigned_brands;
  if (Object.keys(update).length === 0) throw new TeamError("Nothing to update", 400);

  const { data, error } = await supabaseAdmin.from("team_members").update(update).eq("id", memberId).select().single();
  if (error) throw new TeamError(`Could not update member: ${error.message}`, 500);
  await logAudit({ ownerId, actor: ownerId, action: "team_member_updated", entityType: "team", entityId: memberId, detail: JSON.stringify(update) });
  return data;
}

// Assign a lead to a team member (or clear with assignedTo=null).
export async function assignLead(ownerId: string, leadId: string, assignedTo: string | null, actor: string, note?: string) {
  const { data: lead } = await supabaseAdmin.from("leads").select("id, owner_id").eq("id", leadId).maybeSingle();
  if (!lead || lead.owner_id !== ownerId) throw new TeamError("Lead not found", 404);

  // if assigning to someone, they must be an active member of this workspace
  if (assignedTo) {
    const role = await getEffectiveRole(assignedTo, ownerId);
    if (!role) throw new TeamError("That user is not an active member of this workspace.", 400);
  }

  await supabaseAdmin
    .from("leads")
    .update({ assigned_to: assignedTo, assigned_by: actor, assigned_at: new Date().toISOString() })
    .eq("id", leadId);
  await supabaseAdmin.from("lead_assignments").insert({
    owner_id: ownerId,
    lead_id: leadId,
    assigned_to: assignedTo,
    assigned_by: actor,
    note: note ?? null,
  });
  await logAudit({ ownerId, actor, action: assignedTo ? "lead_assigned" : "lead_unassigned", entityType: "lead", entityId: leadId, detail: assignedTo ?? "cleared" });
  return { ok: true };
}
