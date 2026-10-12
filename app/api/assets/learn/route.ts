import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { buildLearnPrompt } from "@/lib/assetPrompt";
import { claudeUrlFor } from "@/lib/seoHandoff";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return NextResponse.redirect(claudeUrlFor(buildLearnPrompt(`${proto}://${host}`)), 307);
}
