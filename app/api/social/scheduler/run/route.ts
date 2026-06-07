import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { runScheduler } from "@/services/publishService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/social/scheduler/run
// Two ways to call it:
//  1. Manual button (admin): normal Authorization: Bearer <user token> → runs for that user.
//  2. Cron: header  x-cron-secret: <CRON_SECRET>  → runs for all owners with scheduled FB posts.
export async function POST(req: Request) {
  const cronSecret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  // cron path
  if (cronSecret && expected && cronSecret === expected) {
    const { data: owners } = await supabaseAdmin
      .from("post_drafts")
      .select("owner_id")
      .eq("platform", "facebook")
      .eq("status", "scheduled");
    const unique = Array.from(new Set((owners ?? []).map((o) => o.owner_id)));
    const all = [];
    for (const uid of unique) all.push({ owner: uid, ...(await runScheduler(uid as string)) });
    return NextResponse.json({ mode: "cron", owners: unique.length, runs: all });
  }

  // manual path
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runScheduler(userId);
  return NextResponse.json({ mode: "manual", ...result });
}
