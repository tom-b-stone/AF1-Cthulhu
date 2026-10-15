import { NextRequest, NextResponse } from "next/server";
import { DriveNotConnected, driveImage, driveToken } from "@/lib/googleDrive";

// GET /api/zine/slashlens/photo?id=<Drive file id> → print-sized JPEG of a
// SlashLens photo, read with the user's own Google Drive access.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[\w-]{10,}$/.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const token = await driveToken(req);
    const img = await driveImage(token, id);
    return new NextResponse(img.bytes, { headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    if (e instanceof DriveNotConnected) return NextResponse.json({ error: "drive_not_connected" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
