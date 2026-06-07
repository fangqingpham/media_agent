import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/publish-logs  → publish attempts joined with post titles
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: attempts, error } = await supabaseAdmin
    .from("publish_attempts")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const postIds = Array.from(new Set((attempts ?? []).map((a) => a.post_id).filter(Boolean)));
  const titles = new Map<string, string>();
  if (postIds.length > 0) {
    const { data: posts } = await supabaseAdmin
      .from("post_drafts")
      .select("id, title")
      .in("id", postIds as string[]);
    for (const p of posts ?? []) titles.set(p.id, p.title ?? "(untitled)");
  }

  const rows = (attempts ?? []).map((a) => ({ ...a, post_title: a.post_id ? titles.get(a.post_id) ?? "(deleted)" : "—" }));
  return NextResponse.json(rows);
}
