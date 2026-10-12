import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { kvGet, kvSet } from "@/lib/kv";
import { SEED_KNOWLEDGE, type KnowledgeEntry } from "@/lib/teamKnowledge";
import { KNOWLEDGE_KEY as KEY, readKnowledge } from "@/lib/knowledgeStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ entries: await readKnowledge(), seeded: !(await kvGet(KEY)) });
}

// PUT replaces the whole list (the editor works on the list client-side).
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { entries?: KnowledgeEntry[] };
  if (!Array.isArray(body.entries)) return NextResponse.json({ error: "entries required" }, { status: 400 });
  const clean = body.entries
    .filter((e) => e && typeof e.name === "string" && e.name.trim())
    .map((e) => ({
      id: String(e.id || Math.random().toString(36).slice(2, 10)),
      kind: (["person", "term", "rule", "pattern"] as const).includes(e.kind) ? e.kind : "rule",
      name: e.name.trim().slice(0, 200),
      de: e.de?.trim().slice(0, 200) || undefined,
      aliases: Array.isArray(e.aliases) ? e.aliases.map((a) => String(a).trim()).filter(Boolean).slice(0, 12) : undefined,
      role: e.role?.trim().slice(0, 120) || undefined,
      cue: e.cue?.trim().slice(0, 400) || undefined,
      note: e.note?.trim().slice(0, 800) || undefined,
      active: e.active !== false,
    }));
  await kvSet(KEY, JSON.stringify(clean));
  console.log(`[assets] ${session.user.email} saved team knowledge (${clean.length} entries)`);
  return NextResponse.json({ entries: clean });
}

export async function DELETE() {
  // reset to seed
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  if (!isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await kvSet(KEY, JSON.stringify(SEED_KNOWLEDGE));
  return NextResponse.json({ entries: SEED_KNOWLEDGE });
}
