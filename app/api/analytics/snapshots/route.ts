import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { createSnapshot, listSnapshots, AnalyticsError, type AnalyticsFilters } from "@/services/analyticsService";

// GET /api/analytics/snapshots?brandId=  → list snapshots
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  try {
    return NextResponse.json(await listSnapshots(brandId, userId));
  } catch (e) {
    if (e instanceof AnalyticsError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

// POST /api/analytics/snapshots  { brandId, from, to, platform?, pillarId?, contentType?, label? }
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: AnalyticsFilters & { label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  try {
    return NextResponse.json(await createSnapshot(body, userId, body.label), { status: 201 });
  } catch (e) {
    if (e instanceof AnalyticsError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
