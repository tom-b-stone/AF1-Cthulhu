import { NextRequest, NextResponse } from "next/server";
import { resolvePluginToken } from "@/lib/connectorTokens";
import { CAMPAIGNS, MODULES, ackPending, applySync, getPending, loadPages, previewSync } from "@/lib/sitemapSync";

// Endpoint for the "AF1 Ktulu Sync" Figma plugin (figma-plugin/ in this
// repo). The plugin runs in Figma's sandbox (origin "null"), so it can't
// carry the session cookie: it authenticates with the same personal token
// as the AF1 Tools connector (/connector), in the path.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type Ctx = { params: { token: string; campaign: string } };

async function auth(ctx: Ctx) {
  const { token, campaign } = ctx.params;
  const rec = await resolvePluginToken(token);
  return { rec, campaign };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { rec, campaign } = await auth(ctx);
  if (!rec) return json({ error: "Unknown token. Create one in the AF1 Tool under Team Cards → Sitemap Sync." }, 401);
  const c = CAMPAIGNS[campaign];
  if (!c) return json({ error: "unknown campaign" }, 404);
  try {
    const [pages, pending] = await Promise.all([loadPages(c), getPending(campaign)]);
    return json({ campaign: c, pages, modules: MODULES, pending, user: rec.email });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 502);
  }
}

// { action: "sync", figma, nodes, decisions? } → compares, writes Figma-newer
//   fields to staging, returns CMS-newer fields for the plugin to write and
//   open conflicts.
// { action: "ack", keys } → the plugin wrote these pending fields.
export async function POST(req: NextRequest, ctx: Ctx) {
  const { rec, campaign } = await auth(ctx);
  if (!rec) return json({ error: "Unknown token. Create one in the AF1 Tool under Team Cards → Sitemap Sync." }, 401);
  const b = (await req.json().catch(() => null)) as { action?: string; figma?: Record<string, string>; nodes?: Record<string, string>; decisions?: Record<string, "figma" | "cms">; keys?: string[] } | null;
  try {
    if (b?.action === "check") return json(await previewSync(campaign, b.figma ?? {}));
    if (b?.action === "ack") return json({ remaining: await ackPending(campaign, b.keys ?? []) });
    if (b?.action === "sync") {
      const r = await applySync(campaign, rec.email, { figma: b.figma ?? {}, nodes: b.nodes, decisions: b.decisions });
      console.log(`[sitemap] ${rec.email} figma sync ${campaign}: ${r.summary}`);
      return json(r);
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 502);
  }
}
