import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { markMatch, KeywordError } from "@/services/keywordService";

// POST /api/keyword-matches/[id]/mark  { public_reply_sent?, dm_sent?, status? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { public_reply_sent?: boolean; dm_sent?: boolean; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await markMatch(id, body, userId));
  } catch (e) {
    if (e instanceof KeywordError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not update match" }, { status: 500 });
  }
}
