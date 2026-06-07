import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { changeInteractionStatus, InteractionError } from "@/services/interactionService";
import { INTERACTION_STATUSES } from "@/lib/interactionTypes";

// POST /api/interactions/:id/status  { toStatus, note? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { toStatus?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.toStatus || !INTERACTION_STATUSES.includes(body.toStatus as never)) {
    return NextResponse.json({ error: "Valid toStatus is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await changeInteractionStatus(id, body.toStatus, userId, body.note ?? null));
  } catch (e) {
    if (e instanceof InteractionError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
