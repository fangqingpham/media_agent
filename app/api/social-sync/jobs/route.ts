import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listSyncJobs } from "@/services/syncService";

// GET /api/social-sync/jobs  → recent sync jobs
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listSyncJobs(userId));
}
