import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { createContentTag, listContentTags } from "@/lib/payloadClient";
import { PROD_TAG_TITLES } from "@/lib/contentTags";

// Content tags on the staging CMS.
//   GET            → { tags: [{id, title}] }
//   POST {title}   → create one (returns the existing one if the title is taken)
//   POST {seed:1}  → one-time: create every production tag that staging lacks
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ tags: await listContentTags(true) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { title?: string; seed?: boolean };
  try {
    if (body.seed) {
      const have = new Set((await listContentTags(true)).map((t) => t.title.toLowerCase()));
      const created: string[] = [];
      for (const title of PROD_TAG_TITLES) {
        if (have.has(title.toLowerCase())) continue;
        await createContentTag(title);
        created.push(title);
      }
      console.log(`[tags] ${session.user.email} seeded ${created.length} tags on staging`);
      return NextResponse.json({ ok: true, created, skipped: PROD_TAG_TITLES.length - created.length, tags: await listContentTags(true) });
    }
    const title = String(body.title ?? "").trim().toLowerCase();
    if (title.length < 2) return NextResponse.json({ error: "title required" }, { status: 400 });
    const tag = await createContentTag(title);
    console.log(`[tags] ${session.user.email} created tag "${tag.title}"`);
    return NextResponse.json({ ok: true, tag, tags: await listContentTags(true) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
