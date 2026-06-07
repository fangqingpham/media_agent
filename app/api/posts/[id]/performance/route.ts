import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { savePerformance, getPerformance, WorkflowError, type PerformanceInput } from "@/services/workflowService";

// GET /api/posts/:id/performance
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await getPerformance(id, userId));
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

// POST /api/posts/:id/performance  → upsert basic metrics
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: PerformanceInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await savePerformance(id, userId, body));
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
