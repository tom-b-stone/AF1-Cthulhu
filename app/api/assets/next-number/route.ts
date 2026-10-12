import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { nextNumberInFolder } from "@/lib/payloadClient";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const folder = req.nextUrl.searchParams.get("folder") ?? "";
  const prefix = req.nextUrl.searchParams.get("prefix") ?? "";
  if (!folder) return NextResponse.json({ error: "folder required" }, { status: 400 });
  return NextResponse.json({ next: await nextNumberInFolder(folder, prefix) });
}
