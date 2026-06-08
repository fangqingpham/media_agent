import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listReviewQueue } from "@/services/complianceService";

// GET /api/compliance/queue?brandId=  → posts needing compliance review
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get("brandId") || undefined;
  return NextResponse.json(await listReviewQueue(userId, brandId));
}
