import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { generateMatchReply, KeywordError } from "@/services/keywordService";

// POST /api/keyword-matches/[id]/reply  → (re)generate AI drafts for a match
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await generateMatchReply(id, userId));
  } catch (e) {
    if (e instanceof KeywordError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not generate reply" }, { status: 500 });
  }
}
