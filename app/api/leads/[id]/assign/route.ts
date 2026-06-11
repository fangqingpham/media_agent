import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { assignLead, requirePermission, TeamError } from "@/services/teamService";

// POST /api/leads/[id]/assign  { assignedTo: string|null, note? }
// Requires assign_leads permission in the workspace (owner/admin).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { assignedTo?: string | null; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    // the lead belongs to the caller's workspace (single-owner today: owner === caller)
    await requirePermission(userId, userId, "assign_leads");
    const res = await assignLead(userId, id, body.assignedTo ?? null, userId, body.note);
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not assign lead" }, { status: 500 });
  }
}
