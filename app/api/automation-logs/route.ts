import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listRuns } from "@/services/automationService";

// GET /api/automation-logs  → recent rule runs (with rule name)
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listRuns(userId));
}
