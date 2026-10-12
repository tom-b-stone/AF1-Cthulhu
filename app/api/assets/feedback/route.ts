import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { addCorrections, readCorrections, type Correction } from "@/lib/feedbackStore";

// Corrections to Claude's people/scene/tags, logged by the batch page at
// upload. GET lists them (newest first), POST { items: [...] } adds.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ corrections: await readCorrections() });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { items?: Omit<Correction, "id" | "at">[] } | null;
  if (!body?.items?.length) return NextResponse.json({ error: "items required" }, { status: 400 });
  const by = session.user.email;
  const items = body.items.slice(0, 200).map((c) => ({
    batchId: String(c.batchId ?? ""),
    rowId: String(c.rowId ?? ""),
    originalName: String(c.originalName ?? ""),
    alt: String(c.alt ?? ""),
    ai: { people: (c.ai?.people ?? []).map(String), scene: c.ai?.scene },
    final: { people: (c.final?.people ?? []).map(String), scene: c.final?.scene, tags: (c.final?.tags ?? []).map(String) },
    by,
  }));
  const all = await addCorrections(items);
  console.log(`[feedback] ${session.user.email} logged ${items.length} corrections`);
  return NextResponse.json({ ok: true, total: all.length });
}
