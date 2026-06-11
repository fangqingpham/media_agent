import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runAutomations } from "@/services/automationService";

// POST /api/automation/run
//  - Manual: authenticated user → runs that user's active rules.
//  - Cron: header "x-cron-secret: <CRON_SECRET>" → runs every owner's active rules.
export async function POST(req: Request) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) {
    // run for all owners that have active rules
    const { data: owners } = await supabaseAdmin
      .from("automation_rules")
      .select("owner_id")
      .eq("status", "active");
    const unique = [...new Set((owners ?? []).map((o) => o.owner_id as string))];
    const results = [];
    for (const ownerId of unique) results.push({ ownerId, ...(await runAutomations(ownerId)) });
    return NextResponse.json({ mode: "cron", owners: unique.length, results });
  }

  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ mode: "manual", ...(await runAutomations(userId)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Run failed" }, { status: 500 });
  }
}
