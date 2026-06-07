import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function ownsBrand(brandId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("brands")
    .select("owner_id")
    .eq("id", brandId)
    .single();
  return !!data && data.owner_id === userId;
}

// GET /api/brands/:id
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.owner_id !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(data);
}

// PATCH /api/brands/:id
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await ownsBrand(id, userId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // never let the client move ownership
  delete body.owner_id;
  delete body.id;

  const { data, error } = await supabaseAdmin
    .from("brands")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/brands/:id
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await ownsBrand(id, userId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabaseAdmin.from("brands").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
