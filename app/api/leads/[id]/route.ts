import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateLead, LeadError } from "@/services/leadService";

// GET /api/leads/:id
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabaseAdmin.from("leads").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(data);
}

// PATCH /api/leads/:id
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateLead(id, body, userId));
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/leads/:id
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: lead } = await supabaseAdmin.from("leads").select("owner_id").eq("id", id).single();
  if (!lead || lead.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await supabaseAdmin.from("leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
