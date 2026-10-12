import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { readBatch, writeBatch, type ServerBatch } from "@/lib/assetBatchStore";

// Server copy of a batch's metadata so Claude (through the connector) can
// list the images, read what is known, and write descriptor + alt text
// back. The browser keeps the full images; the server holds 1024px
// previews (see ./preview) and this meta, both for 7 days.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await readBatch(params.id);
  if (!b) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(b);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Partial<ServerBatch> | null;
  if (!body || !Array.isArray(body.rows)) return NextResponse.json({ error: "rows required" }, { status: 400 });
  const b: ServerBatch = {
    id: params.id,
    owner: session.user.email,
    updatedAt: new Date().toISOString(),
    folderPath: String(body.folderPath ?? ""),
    year: Number(body.year ?? new Date().getFullYear()),
    loc: String(body.loc ?? ""),
    round: body.round,
    session: body.session,
    race: body.race,
    rows: body.rows.map((r) => ({
      id: String(r.id),
      originalName: String(r.originalName ?? ""),
      fileName: String(r.fileName ?? ""),
      context: String(r.context ?? ""),
      descriptor: String(r.descriptor ?? ""),
      alt: String(r.alt ?? ""),
      width: Number(r.width ?? 0),
      height: Number(r.height ?? 0),
      people: r.people,
      date: r.date,
    })),
  };
  await writeBatch(b);
  return NextResponse.json({ ok: true, rows: b.rows.length });
}
