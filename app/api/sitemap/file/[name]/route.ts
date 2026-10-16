import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { stagingRequest } from "@/lib/payloadClient";

export const dynamic = "force-dynamic";

// A staging media file by its file name (images inside captured site templates).
export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const name = params.name.replace(/[^\w.\-]/g, "");
  const res = await stagingRequest(`/media/file/${encodeURIComponent(name)}`).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(await res.arrayBuffer(), { headers: { "Content-Type": res.headers.get("content-type") ?? "image/webp", "Cache-Control": "private, max-age=86400" } });
}
