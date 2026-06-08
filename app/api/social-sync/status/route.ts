import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSyncStatus } from "@/services/syncService";

// GET /api/social-sync/status  → connected accounts + last sync + capability flags
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSyncStatus(userId));
}
