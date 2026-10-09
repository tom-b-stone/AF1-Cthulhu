import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSeoGenerationSource, publishSeo, type Collection } from "@/lib/payloadClient";
import { generateSeoMeta } from "@/lib/seoGenerate";

function isCollection(v: string | null): v is Collection {
  return v === "news" || v === "pages";
}

type Body = { collection: Collection; id: string };

// Generates EN + DE meta from the doc's own content, then publishes
// straight away using the same two-step trick saveSeoDraft/publishSeo
// already use elsewhere (DE draft, 3s settle, EN publish with publishedAt
// preserved) — Tom asked for this to publish directly rather than stage a
// review step, same as the audif1-seo-sync skill's "publish now" workflow,
// as long as the existing publish date never moves.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  if (!isCollection(body.collection) || !body.id) {
    return NextResponse.json({ error: "collection (news|pages) and id are required" }, { status: 400 });
  }

  try {
    const source = await getSeoGenerationSource(body.collection, body.id);
    const generated = await generateSeoMeta(body.collection, source);
    await publishSeo(body.collection, body.id, { en: generated.en, de: generated.de });
    return NextResponse.json({ ok: true, en: generated.en, de: generated.de });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 502 }
    );
  }
}
