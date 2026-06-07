import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/interactions/:id/history
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: it } = await supabaseAdmin
    .from("social_interactions")
    .select("owner_id")
    .eq("id", id)
    .single();
  if (!it || it.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("interaction_status_history")
    .select("*")
    .eq("interaction_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
