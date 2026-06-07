import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { scoreLead, LeadError } from "@/services/leadService";

// POST /api/leads/:id/score  → AI lead scoring
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await scoreLead(id, userId));
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
