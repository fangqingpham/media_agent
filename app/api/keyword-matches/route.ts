import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listMatches, addManualMatch, KeywordError } from "@/services/keywordService";

// GET  /api/keyword-matches?campaignId=  → list matches
// POST /api/keyword-matches              → add a manual keyword comment (auto-detect or explicit campaign)
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaignId = new URL(req.url).searchParams.get("campaignId") || undefined;
  return NextResponse.json(await listMatches(userId, campaignId));
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
    return NextResponse.json(await addManualMatch(body, userId), { status: 201 });
  } catch (e) {
    if (e instanceof KeywordError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not add match" }, { status: 500 });
  }
}
