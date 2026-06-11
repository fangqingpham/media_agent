import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listRules, createRule, AutomationError } from "@/services/automationService";

// GET  /api/automation-rules   → list rules
// POST /api/automation-rules   → create a rule { name, trigger, conditions, actions, brand_id?, status? }
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listRules(userId));
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await createRule(body, userId), { status: 201 });
  } catch (e) {
    if (e instanceof AutomationError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not create rule" }, { status: 500 });
  }
}
