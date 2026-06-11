import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listAudit } from "@/services/auditService";

// GET /api/audit-logs  → recent audit entries for the caller's workspace
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listAudit(userId));
}
