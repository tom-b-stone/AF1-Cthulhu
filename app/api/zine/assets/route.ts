import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { ensureZineAssets } from "@/lib/zineAssets";

// GET /api/zine/assets[?force=1]: makes sure the how-to illustrations and
// the teaser animation are in the staging media library; returns their ids.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const assets = await ensureZineAssets(req.nextUrl.origin, req.nextUrl.searchParams.get("force") === "1");
    return NextResponse.json({ ok: true, assets });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
