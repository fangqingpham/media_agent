import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getRule, updateRule, deleteRule, AutomationError } from "@/services/automationService";

// GET / PATCH / DELETE  /api/automation-rules/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await getRule(id, userId));
  } catch (e) {
    if (e instanceof AutomationError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not load rule" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateRule(id, body, userId));
  } catch (e) {
    if (e instanceof AutomationError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not update rule" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await deleteRule(id, userId));
  } catch (e) {
    if (e instanceof AutomationError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not delete rule" }, { status: 500 });
  }
}
