import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { INTERACTION_TYPES, INTERACTION_STATUSES } from "@/lib/interactionTypes";
import { PLATFORMS } from "@/lib/contentTypes";

// GET /api/interactions?brandId=&platform=&status=&leadPotential=&risk=
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId");
  const platform = url.searchParams.get("platform");
  const status = url.searchParams.get("status");
  const leadPotential = url.searchParams.get("leadPotential");
  const risk = url.searchParams.get("risk");

  let q = supabaseAdmin
    .from("social_interactions")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (brandId) q = q.eq("brand_id", brandId);
  if (platform) q = q.eq("platform", platform);
  if (status) q = q.eq("status", status);
  if (leadPotential) q = q.eq("lead_potential", leadPotential);
  if (risk) q = q.eq("compliance_risk", risk);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// POST /api/interactions  → manually add an interaction
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.brand_id) return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
  if (!body.original_message || !String(body.original_message).trim())
    return NextResponse.json({ error: "original_message is required" }, { status: 400 });
  if (!PLATFORMS.includes(body.platform as never))
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  if (!INTERACTION_TYPES.includes(body.interaction_type as never))
    return NextResponse.json({ error: "Invalid interaction_type" }, { status: 400 });
  if (body.status && !INTERACTION_STATUSES.includes(body.status as never))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  // verify the brand belongs to the caller
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("owner_id")
    .eq("id", body.brand_id)
    .single();
  if (!brand || brand.owner_id !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const insert = {
    owner_id: userId,
    brand_id: body.brand_id,
    related_post_id: body.related_post_id ?? null,
    platform: body.platform,
    interaction_type: body.interaction_type,
    person_name: body.person_name ?? null,
    profile_url: body.profile_url ?? null,
    original_message: body.original_message,
    received_at: body.received_at ?? null,
    notes: body.notes ?? null,
    status: body.status ?? "new",
  };

  const { data, error } = await supabaseAdmin
    .from("social_interactions")
    .insert(insert)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
