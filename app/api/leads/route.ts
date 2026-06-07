import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createLead, LeadError } from "@/services/leadService";
import { HOT_PRIORITIES } from "@/lib/leadTypes";

// GET /api/leads?brandId=&platform=&category=&status=&priority=&overdue=true&hot=true
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId");
  const platform = url.searchParams.get("platform");
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const overdue = url.searchParams.get("overdue");
  const hot = url.searchParams.get("hot");

  let q = supabaseAdmin
    .from("leads")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (brandId) q = q.eq("brand_id", brandId);
  if (platform) q = q.eq("platform", platform);
  if (category) q = q.eq("lead_category", category);
  if (status) q = q.eq("lead_status", status);
  if (priority) q = q.eq("priority", priority);
  if (hot === "true") q = q.in("priority", HOT_PRIORITIES);
  if (overdue === "true") q = q.lt("follow_up_date", new Date().toISOString().slice(0, 10));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// POST /api/leads  → create a lead (manual or from an interaction)
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const lead = await createLead(body as never, userId);
    return NextResponse.json(lead, { status: 201 });
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
