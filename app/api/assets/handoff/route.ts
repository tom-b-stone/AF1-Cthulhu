import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { readBatch } from "@/lib/assetBatchStore";
import { buildAssetPrompt } from "@/lib/assetPrompt";
import { claudeUrlFor } from "@/lib/seoHandoff";

// GET /api/assets/handoff?batch=<id> → 307 to claude.ai with the prompt.
export const dynamic = "force-dynamic";

function appOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("batch") ?? "";
  const b = await readBatch(id);
  if (!b) return NextResponse.json({ error: "Batch not on the server yet. Open the batch and click Generate alt text again." }, { status: 404 });
  const todo = b.rows.filter((r) => !r.alt).length || b.rows.length;
  return NextResponse.redirect(claudeUrlFor(buildAssetPrompt(b.id, todo, b.folderPath, appOrigin(req))), 307);
}
