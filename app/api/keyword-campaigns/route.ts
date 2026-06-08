import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listCampaigns, createCampaign, getKeywordSummary, KeywordError } from "@/services/keywordService";

// GET /api/keyword-campaigns           → list (optional ?brandId=, ?summary=1)
// POST /api/keyword-campaigns          → create
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("summary") === "1") {
    return NextResponse.json(await getKeywordSummary(userId));
  }
  const brandId = url.searchParams.get("brandId") || undefined;
  return NextResponse.json(await listCampaigns(userId, brandId));
}

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
    return NextResponse.json(await createCampaign(body, userId), { status: 201 });
  } catch (e) {
    if (e instanceof KeywordError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not create campaign" }, { status: 500 });
  }
}
