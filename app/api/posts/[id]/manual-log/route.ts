import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { saveManualLog, getManualLog, WorkflowError, type ManualLogInput } from "@/services/workflowService";

// GET /api/posts/:id/manual-log
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await getManualLog(id, userId));
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

// POST /api/posts/:id/manual-log  → upsert the manual posting log
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: ManualLogInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await saveManualLog(id, userId, body));
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
