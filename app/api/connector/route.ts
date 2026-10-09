import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { connectorStatus, createConnectorToken, revokeConnectorToken } from "@/lib/connectorTokens";
import { kvConfigured } from "@/lib/kv";

function appOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

async function requireEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// GET: is a connector token active for me (never returns the token itself —
// it's only shown once, right after it's minted).
export async function GET() {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = await connectorStatus(email);
  return NextResponse.json({ ...status, persistent: kvConfigured() });
}

// POST: mint (or replace) my token and return the full connector URL once.
export async function POST(req: NextRequest) {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = await createConnectorToken(email);
  return NextResponse.json({ url: `${appOrigin(req)}/api/mcp/${token}`, persistent: kvConfigured() });
}

// DELETE: revoke my token (the URL in claude.ai stops working immediately).
export async function DELETE() {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await revokeConnectorToken(email);
  return NextResponse.json({ ok: true });
}
