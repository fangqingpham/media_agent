import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { activateBrief } from "@/services/briefService";

// POST /api/brands/:id/briefs/:briefId/activate
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; briefId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, briefId } = await params;
  try {
    const brief = await activateBrief(briefId, id, userId);
    return NextResponse.json(brief);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
