import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getMe } from "@/services/teamService";

// GET /api/team/me  → current user's profile, role, permissions, memberships
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getMe(userId));
}
