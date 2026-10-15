import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { autoPick, findWeekend, slCollections, slPhotos, slSaveCollection, slThumb } from "@/lib/slashlens";

// GET  /api/zine/slashlens?round=17&city=Singapore&country=Singapore
//      → the SlashLens weekend, an existing "zine" collection if the team
//        made one, otherwise an automatic pick of 14 (1 cover + 13 inside)
// POST { weekend, name, photoIds } → saves the pick as a SlashLens
//      collection so it can be downloaded as a ZIP there
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  try {
    const photos = await slPhotos();
    const weekends = [...new Set(photos.map((p) => p.weekend))].sort();
    const weekend = q.get("weekend") || findWeekend(weekends, Number(q.get("round")) || undefined, q.get("city") ?? "", q.get("country") ?? "");
    if (!weekend) return NextResponse.json({ ok: false, error: "No matching weekend in SlashLens", weekends });
    const count = photos.filter((p) => p.weekend === weekend).length;
    const cols = (await slCollections().catch(() => [])).filter((c) => c.weekend === weekend);
    const zineCol = cols.find((c) => /zine|photobook|fotobuch/i.test(c.name) && c.photoIds.length);
    if (zineCol && q.get("auto") !== "1") {
      const byId = new Map(photos.map((p) => [p.id, p]));
      const picks = zineCol.photoIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((p) => ({ id: p!.id, name: p!.name, sub: p!.sub, tags: p!.tags, desc: p!.desc, slot: "collection", thumb: slThumb(p!.id) }));
      return NextResponse.json({ ok: true, weekend, count, weekends, source: { type: "collection", id: zineCol.id, name: zineCol.name }, cover: picks[0] ?? null, inside: picks.slice(1, 14), collections: cols.map((c) => ({ id: c.id, name: c.name, n: c.photoIds.length })) });
    }
    const pick = autoPick(photos, weekend);
    return NextResponse.json({ ok: true, weekend, count, weekends, source: { type: "auto" }, ...pick, collections: cols.map((c) => ({ id: c.id, name: c.name, n: c.photoIds.length })) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "SlashLens not reachable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { weekend?: string; name?: string; photoIds?: string[] };
  if (!b.weekend || !b.photoIds?.length) return NextResponse.json({ error: "weekend and photoIds required" }, { status: 400 });
  try {
    const id = await slSaveCollection(b.weekend, b.name || "GP Mini-Zine", b.photoIds.slice(0, 40));
    console.log(`[zine] ${session.user.email} saved SlashLens collection ${id} (${b.photoIds.length} photos, ${b.weekend})`);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
