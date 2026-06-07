import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/brands/:id/briefs/active  → the single active brief (used by later stages)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("owner_id")
    .eq("id", id)
    .single();
  if (!brand || brand.owner_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("brand_briefs")
    .select("*")
    .eq("brand_id", id)
    .eq("status", "active")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
