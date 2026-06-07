import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listAccounts } from "@/services/socialService";

// GET /api/social/accounts  → connected accounts (no tokens ever returned)
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listAccounts(userId));
}
