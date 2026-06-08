import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listBatchPlans, generateBatchPlan, VideoError } from "@/services/videoService";

// GET  /api/batch-plans?brandId=   → list plans
// POST /api/batch-plans            → generate a plan from selected posts
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get("brandId") || undefined;
  return NextResponse.json(await listBatchPlans(userId, brandId));
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { brandId?: string; postIds?: string[]; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const plan = await generateBatchPlan(
      { brandId: String(body.brandId || ""), postIds: body.postIds || [], title: body.title || null },
      userId
    );
    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    if (e instanceof VideoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not generate plan" }, { status: 500 });
  }
}
