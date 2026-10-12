import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getAnthropicSettings } from "@/lib/settings";
import { readBatch, readPreview, writeBatch } from "@/lib/assetBatchStore";
import { readKnowledge } from "@/lib/knowledgeStore";
import { readExamples } from "@/lib/examplesStore";
import { listReferences, readReferenceImage } from "@/lib/referenceStore";
import { readCorrections } from "@/lib/feedbackStore";
import { describePhoto } from "@/lib/claudeDescribe";

// In-tool generation. GET → { configured, model }. POST { batchId, rowId }
// → describes one photo (preview must be on the server already) and writes
// descriptor / alt / people / scene to the server batch, like asset_set_meta.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await getAnthropicSettings();
  return NextResponse.json({ configured: Boolean(s), model: s?.model ?? null });
}

const REFS_PER_PERSON = 3;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await getAnthropicSettings();
  if (!s) return NextResponse.json({ error: "No Anthropic API key set (Admin → Claude API)" }, { status: 409 });
  const { batchId, rowId } = (await req.json().catch(() => ({}))) as { batchId?: string; rowId?: string };
  if (!batchId || !rowId) return NextResponse.json({ error: "batchId and rowId required" }, { status: 400 });
  const batch = await readBatch(batchId);
  const row = batch?.rows.find((r) => r.id === rowId);
  if (!batch || !row) return NextResponse.json({ error: "batch or row not on the server" }, { status: 404 });
  const preview = await readPreview(batchId, rowId);
  if (!preview) return NextResponse.json({ error: "no preview on the server for this photo" }, { status: 404 });

  try {
    const [knowledge, examples, allRefs, corrections] = await Promise.all([readKnowledge(), readExamples(), listReferences(), readCorrections()]);
    // newest N per person, images loaded
    const picked: typeof allRefs = [];
    for (const r of [...allRefs].reverse()) if (picked.filter((p) => p.person === r.person).length < REFS_PER_PERSON) picked.push(r);
    picked.reverse();
    const refs = (await Promise.all(picked.map(async (meta) => ({ meta, image: await readReferenceImage(meta.id) })))).filter((r): r is { meta: (typeof picked)[number]; image: { mime: string; data: string } } => Boolean(r.image));
    const out = await describePhoto({ apiKey: s.key, model: s.model, batch, row, preview, knowledge, examples, refs, corrections });
    // write back like the connector does
    const fresh = await readBatch(batchId);
    const target = fresh?.rows.find((r) => r.id === rowId);
    if (fresh && target) {
      target.alt = out.alt;
      target.descriptor = out.descriptor;
      target.people = out.people;
      target.scene = out.scene;
      fresh.updatedAt = new Date().toISOString();
      await writeBatch(fresh);
    }
    console.log(`[generate] ${session.user.email} ${batchId}/${rowId} ok (${out.usage?.input ?? "?"} in, ${out.usage?.cached ?? 0} cached)`);
    return NextResponse.json({ ok: true, result: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    console.error(`[generate] ${batchId}/${rowId} ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
