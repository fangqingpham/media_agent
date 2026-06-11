// Stage 13: role/permission matrix. This is the ENFORCEMENT source of truth
// (the role_permissions DB table mirrors it for visibility). Keep them in sync.

export const ROLES = ["owner", "admin", "manager", "agent", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "manage_settings",
  "connect_accounts",
  "approve_posts",
  "publish_posts",
  "view_all_leads",
  "assign_leads",
  "view_analytics",
  "review_drafts",
  "manage_content",
  "view_assigned_leads",
  "add_notes",
  "update_lead_status",
  "draft_replies",
  "view_dashboards",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL,
  manager: ["review_drafts", "manage_content", "view_assigned_leads", "add_notes", "view_dashboards"],
  agent: ["view_assigned_leads", "add_notes", "update_lead_status", "draft_replies", "view_dashboards"],
  viewer: ["view_dashboards"],
};

export function hasPermission(role: Role | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  agent: "Agent",
  viewer: "Viewer",
};
