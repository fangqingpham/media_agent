import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { classifyInteraction, InteractionError } from "@/services/interactionService";

// POST /api/interactions/:id/classify
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await classifyInteraction(id, userId));
  } catch (e) {
    if (e instanceof InteractionError) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
