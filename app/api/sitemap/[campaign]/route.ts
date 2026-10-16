import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { applySync, status } from "@/lib/sitemapSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: { campaign: string } };

// GET → pages, last Figma report, open differences (runs on every tool load)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { campaign } = ctx.params;
  try {
    return NextResponse.json(await status(campaign));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}

// POST { decisions } → newer side wins, conflicts as decided. Figma-side
// changes go to staging now; CMS-side changes wait for the plugin.
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { campaign } = ctx.params;
  const b = (await req.json().catch(() => null)) as { decisions?: Record<string, "figma" | "cms"> } | null;
  try {
    const r = await applySync(campaign, session.user.email, { decisions: b?.decisions ?? {} });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
