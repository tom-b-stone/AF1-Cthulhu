import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { stagingFileUrl, uploadToCollection } from "@/lib/payloadClient";
import { zineFolder } from "@/lib/zineAssets";

// One file per request (serverless bodies are capped at ~4.5 MB): the cover
// photo or one of the three PDFs, into the staging media folder "GP Mini-Zine".
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "");
  const alt = String(form.get("alt") ?? "");
  if (!(file instanceof Blob) || !/^[\w.-]+$/.test(name)) return NextResponse.json({ error: "file and name required" }, { status: 400 });
  try {
    const folder = await zineFolder();
    const doc = await uploadToCollection("media", file, name, { alt, ...(folder ? { folder } : {}) });
    return NextResponse.json({ ok: true, id: doc.id, url: stagingFileUrl(doc.url) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "upload failed" }, { status: 502 });
  }
}
