import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { applyRewrite, ComplianceError } from "@/services/complianceService";

// POST /api/compliance/reviews/[id]/apply-rewrite  → apply the safer rewrite to the post
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await applyRewrite(id, userId));
  } catch (e) {
    if (e instanceof ComplianceError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not apply rewrite" }, { status: 500 });
  }
}
