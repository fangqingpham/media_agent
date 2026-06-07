import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { changePostStatus, WorkflowError } from "@/services/workflowService";

// POST /api/posts/:id/status  { toStatus, note? }  → validated transition + history
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
  if (!body.toStatus) {
    return NextResponse.json({ error: "toStatus is required" }, { status: 400 });
  }

  try {
    const post = await changePostStatus(id, body.toStatus, userId, body.note ?? null);
    return NextResponse.json(post);
  } catch (e) {
    if (e instanceof WorkflowError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
