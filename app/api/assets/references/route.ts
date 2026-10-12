import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { addReference, listReferences, readReferenceImage, removeReference } from "@/lib/referenceStore";

// Reference photos per person.
//   GET            → { refs: [meta] }      GET ?id= → the image (binary)
//   POST {person, note?, source?, mime, data(base64)} → add
//   DELETE ?id=    → remove
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const img = await readReferenceImage(id);
    if (!img) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(Buffer.from(img.data, "base64"), { headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=3600" } });
  }
  return NextResponse.json({ refs: await listReferences() });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { person?: string; note?: string; source?: string; mime?: string; data?: string } | null;
  if (!body?.person || !body.mime || !body.data) return NextResponse.json({ error: "person, mime and data required" }, { status: 400 });
  if (body.data.length > 1_200_000) return NextResponse.json({ error: "image too large (max ~900 KB)" }, { status: 413 });
  const refs = await addReference({ person: body.person, note: body.note, source: body.source ?? session.user.email, mime: body.mime, data: body.data });
  console.log(`[refs] ${session.user.email} added a reference for ${body.person}`);
  return NextResponse.json({ ok: true, refs });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ok: true, refs: await removeReference(id) });
}
