import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { kvGet, kvSet } from "@/lib/kv";

// DOM snapshots of audif1.com / staging states, used as preview templates.
// POST { name, html, meta } stores one; GET lists, GET ?name= returns one.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { name?: string; html?: string; meta?: unknown } | null;
  if (!b?.name || !b.html) return NextResponse.json({ error: "name and html required" }, { status: 400 });
  const name = b.name.replace(/[^a-z0-9:_-]/gi, "-").slice(0, 80);
  await kvSet(`capture:${name}`, JSON.stringify({ html: b.html, meta: b.meta ?? null, at: new Date().toISOString(), by: session.user.email }));
  const idx = new Set<string>(JSON.parse((await kvGet("capture:index")) ?? "[]"));
  idx.add(name);
  await kvSet("capture:index", JSON.stringify([...idx].sort()));
  return NextResponse.json({ ok: true, name, bytes: b.html.length });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ names: JSON.parse((await kvGet("capture:index")) ?? "[]") });
  const v = await kvGet(`capture:${name}`);
  return v ? NextResponse.json(JSON.parse(v)) : NextResponse.json({ error: "not found" }, { status: 404 });
}
