import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getStatusHistory, WorkflowError } from "@/services/workflowService";

// GET /api/posts/:id/history  → status change history (newest first)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await getStatusHistory(id, userId));
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
