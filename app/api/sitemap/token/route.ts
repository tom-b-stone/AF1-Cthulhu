import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { createPluginToken, pluginTokenStatus } from "@/lib/connectorTokens";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ createdAt: await pluginTokenStatus(session.user.email) });
}

// Mints a new token for the Figma plugin (replaces the previous one).
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ token: await createPluginToken(session.user.email) });
}
