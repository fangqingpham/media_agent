import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { createLeadFromMatch, KeywordError } from "@/services/keywordService";

// POST /api/keyword-matches/[id]/create-lead  → create a lead from the match
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await createLeadFromMatch(id, userId), { status: 201 });
  } catch (e) {
    if (e instanceof KeywordError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not create lead" }, { status: 500 });
  }
}
