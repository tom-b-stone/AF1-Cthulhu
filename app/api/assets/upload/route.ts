import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { uploadMedia } from "@/lib/payloadClient";

// One image per request (Vercel body limit ~4.5 MB; compressed WebPs are well
// under). Fields: file, filename, alt, folder (id or empty).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const filename = String(form.get("filename") ?? "");
  const alt = String(form.get("alt") ?? "").trim();
  const folder = String(form.get("folder") ?? "") || null;
  if (!(file instanceof Blob) || !filename) return NextResponse.json({ error: "file and filename required" }, { status: 400 });
  if (!alt) return NextResponse.json({ error: "alt text required" }, { status: 400 });
  try {
    const doc = await uploadMedia(file, filename, alt, folder);
    console.log(`[assets] ${session.user.email} uploaded ${doc.filename} → ${folder ?? "root"}`);
    return NextResponse.json({ ok: true, doc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "upload failed" }, { status: 502 });
  }
}
