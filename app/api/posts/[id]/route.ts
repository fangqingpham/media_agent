import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RISK_LEVELS } from "@/lib/contentTypes";
import { changePostStatus, WorkflowError } from "@/services/workflowService";

async function owns(id: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("post_drafts")
    .select("owner_id")
    .eq("id", id)
    .single();
  return !!data && data.owner_id === userId;
}

// Content + admin/compliance fields the client may edit directly.
// NOTE: "status" is handled separately via the validated workflow (history).
const EDITABLE = new Set([
  "title", "hook", "caption", "platform_caption", "cta", "visual_idea",
  "hashtags", "video_script", "carousel_outline",
  "scheduled_for", "pillar_id", "audience_id",
  // admin review fields (Stage 3)
  "admin_notes", "compliance_risk", "compliance_reason", "human_approval_required",
]);

// GET /api/posts/:id
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("post_drafts")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.owner_id !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(data);
}

// PATCH /api/posts/:id  → field edits; status changes go through the workflow
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await owns(id, userId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // separate status (validated workflow) from plain field edits
  const statusChange = typeof body.status === "string" ? (body.status as string) : null;
  const statusNote = typeof body.status_note === "string" ? (body.status_note as string) : null;

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) update[k] = v;
  }
  if (
    update.compliance_risk &&
    !RISK_LEVELS.includes(update.compliance_risk as never)
  ) {
    return NextResponse.json({ error: "Invalid compliance_risk" }, { status: 400 });
  }

  try {
    if (Object.keys(update).length > 0) {
      const { error } = await supabaseAdmin
        .from("post_drafts")
        .update(update)
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (statusChange) {
      const post = await changePostStatus(id, statusChange, userId, statusNote);
      return NextResponse.json(post);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }

    const { data } = await supabaseAdmin.from("post_drafts").select("*").eq("id", id).single();
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof WorkflowError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// DELETE /api/posts/:id
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await owns(id, userId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabaseAdmin.from("post_drafts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
