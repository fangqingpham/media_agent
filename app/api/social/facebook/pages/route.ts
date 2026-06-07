import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { connectPage, SocialError } from "@/services/socialService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FB } from "@/lib/facebook";

// GET /api/social/facebook/pages?stash=<id>  → return the Pages list (names + ids only, no tokens)
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stash = new URL(req.url).searchParams.get("stash");
  if (!stash) return NextResponse.json({ error: "Missing stash id" }, { status: 400 });

  const { data: rows } = await supabaseAdmin
    .from("social_connection_logs")
    .select("detail")
    .eq("owner_id", userId)
    .eq("event", "oauth_pages")
    .order("created_at", { ascending: false })
    .limit(10);

  const match = (rows ?? [])
    .map((r) => { try { return JSON.parse(r.detail as string); } catch { return null; } })
    .find((d) => d && d.stashId === stash);
  if (!match) return NextResponse.json({ error: "Page list expired. Reconnect." }, { status: 404 });

  // strip tokens before sending to the browser
  const pages = (match.pages as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name }));
  return NextResponse.json({ pages, brandId: match.brandId ?? "" });
}

// POST /api/social/facebook/pages  { stash, pageId }  → save the chosen Page + token
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { stash?: string; pageId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.stash || !body.pageId) return NextResponse.json({ error: "stash and pageId required" }, { status: 400 });

  const { data: rows } = await supabaseAdmin
    .from("social_connection_logs")
    .select("id, detail")
    .eq("owner_id", userId)
    .eq("event", "oauth_pages")
    .order("created_at", { ascending: false })
    .limit(10);

  const row = (rows ?? [])
    .map((r) => ({ id: r.id, d: (() => { try { return JSON.parse(r.detail as string); } catch { return null; } })() }))
    .find((x) => x.d && x.d.stashId === body.stash);
  if (!row || !row.d) return NextResponse.json({ error: "Page list expired. Reconnect." }, { status: 404 });

  const page = (row.d.pages as { id: string; name: string; access_token: string }[]).find((p) => p.id === body.pageId);
  if (!page) return NextResponse.json({ error: "Selected Page not found in list" }, { status: 400 });

  try {
    const account = await connectPage(userId, row.d.brandId || null, page, FB.scopes);
    // clear the stash row now that the token is saved encrypted
    await supabaseAdmin.from("social_connection_logs").delete().eq("id", row.id);
    return NextResponse.json(account, { status: 201 });
  } catch (e) {
    if (e instanceof SocialError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not connect Page" }, { status: 500 });
  }
}
