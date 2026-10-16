import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { mediaFile } from "@/lib/sitemapSync";

export const dynamic = "force-dynamic";

// Staging image for the tool's previews (staging files need the CMS login).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const f = await mediaFile(params.id).catch(() => null);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(f.body, { headers: { "Content-Type": f.type, "Cache-Control": "private, max-age=3600" } });
}
