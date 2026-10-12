import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { kvSetEx } from "@/lib/kv";

// One preview per request (multipart: file, rowId). Stored base64 in KV
// with a 7-day TTL; ~1024px JPEG, well under the 1 MB value limit.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const rowId = String(form.get("rowId") ?? "");
  if (!(file instanceof Blob) || !rowId) return NextResponse.json({ error: "file and rowId required" }, { status: 400 });
  if (file.size > 700_000) return NextResponse.json({ error: "preview too large" }, { status: 413 });
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  await kvSetEx(`asset:preview:${params.id}:${rowId}`, JSON.stringify({ mime: file.type || "image/jpeg", data: b64 }), 7 * 24 * 3600);
  return NextResponse.json({ ok: true });
}
