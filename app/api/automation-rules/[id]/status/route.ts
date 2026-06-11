import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { setStatus, AutomationError } from "@/services/automationService";

// POST /api/automation-rules/[id]/status  { status: 'active'|'paused' }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.status) return NextResponse.json({ error: "status required" }, { status: 400 });
  try {
    return NextResponse.json(await setStatus(id, body.status, userId));
  } catch (e) {
    if (e instanceof AutomationError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not update status" }, { status: 500 });
  }
}
