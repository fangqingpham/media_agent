import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/posts?brandId=&platform=&pillarId=&status=&statusIn=a,b&risk=&humanApproval=&from=&to=
// Lists the caller's posts with optional filters. Powers calendar, drafts,
// the approval queue, ready-to-post, and posted pages.
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId");
  const platform = url.searchParams.get("platform");
  const pillarId = url.searchParams.get("pillarId");
  const status = url.searchParams.get("status");
  const statusIn = url.searchParams.get("statusIn"); // comma-separated
  const risk = url.searchParams.get("risk");
  const humanApproval = url.searchParams.get("humanApproval"); // "true" | "false"
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let q = supabaseAdmin
    .from("post_drafts")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (brandId) q = q.eq("brand_id", brandId);
  if (platform) q = q.eq("platform", platform);
  if (pillarId) q = q.eq("pillar_id", pillarId);
  if (status) q = q.eq("status", status);
  if (statusIn) q = q.in("status", statusIn.split(",").map((s) => s.trim()).filter(Boolean));
  if (risk) q = q.eq("compliance_risk", risk);
  if (humanApproval === "true") q = q.eq("human_approval_required", true);
  if (humanApproval === "false") q = q.eq("human_approval_required", false);
  if (from) q = q.gte("scheduled_for", from);
  if (to) q = q.lte("scheduled_for", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
