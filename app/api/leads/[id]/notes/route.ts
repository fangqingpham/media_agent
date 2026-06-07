import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { addNote, LeadError } from "@/services/leadService";

// POST /api/leads/:id/notes  { note }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await addNote(id, body.note ?? "", userId));
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
