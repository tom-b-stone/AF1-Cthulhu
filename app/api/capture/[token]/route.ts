import { NextRequest, NextResponse } from "next/server";
import { resolvePluginToken } from "@/lib/connectorTokens";
import { kvGet, kvSet } from "@/lib/kv";

// Stores DOM snapshots of audif1.com / staging states (captured in the
// browser) as templates for the Team Card previews. Token = plugin token.
export const dynamic = "force-dynamic";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: CORS });
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
type Ctx = { params: { token: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!(await resolvePluginToken(params.token))) return json({ error: "unknown token" }, 401);
  const b = (await req.json().catch(() => null)) as { name?: string; html?: string; meta?: unknown } | null;
  if (!b?.name || !b.html) return json({ error: "name and html required" }, 400);
  const name = b.name.replace(/[^a-z0-9:_-]/gi, "-").slice(0, 80);
  await kvSet(`capture:${name}`, JSON.stringify({ html: b.html, meta: b.meta ?? null, at: new Date().toISOString() }));
  const idx = new Set<string>(JSON.parse((await kvGet("capture:index")) ?? "[]"));
  idx.add(name);
  await kvSet("capture:index", JSON.stringify([...idx].sort()));
  return json({ ok: true, name, bytes: b.html.length });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await resolvePluginToken(params.token))) return json({ error: "unknown token" }, 401);
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return json({ names: JSON.parse((await kvGet("capture:index")) ?? "[]") });
  const v = await kvGet(`capture:${name}`);
  return v ? json(JSON.parse(v)) : json({ error: "not found" }, 404);
}
