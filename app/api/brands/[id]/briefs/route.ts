import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { generateBrandBrief } from "@/services/briefService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/brands/:id/briefs  → generate a new brief via OpenAI
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const brief = await generateBrandBrief(id, userId);
    return NextResponse.json(brief, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// GET /api/brands/:id/briefs  → list all versions (newest first)
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
    .order("version", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
