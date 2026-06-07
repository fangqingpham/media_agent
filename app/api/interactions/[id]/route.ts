import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function owns(id: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("social_interactions")
    .select("owner_id")
    .eq("id", id)
    .single();
  return !!data && data.owner_id === userId;
}

const EDITABLE = new Set([
  "person_name", "profile_url", "original_message", "received_at",
  "notes", "admin_notes", "related_post_id",
  "is_lead_candidate", "suggested_lead_category",
]);

// GET /api/interactions/:id
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("social_interactions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(data);
}

// PATCH /api/interactions/:id  → edit notes/fields
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await owns(id, userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) update[k] = v;
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("social_interactions")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/interactions/:id
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await owns(id, userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await supabaseAdmin.from("social_interactions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
