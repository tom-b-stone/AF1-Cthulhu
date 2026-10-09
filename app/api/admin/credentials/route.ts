import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getStagingCredentials, setStagingCredentials, kvConfigured } from "@/lib/settings";

// middleware.ts already blocks non-admins from /api/admin/*, but this route
// writes real secrets, so it re-checks here too rather than trusting that
// alone.
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  return role === "admin";
}

// GET never returns the password — only whether one is set, the email, and
// when it was last changed. Write-only secret field, same pattern as any
// normal secrets manager UI.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const creds = await getStagingCredentials();
  return NextResponse.json({
    persistent: kvConfigured(),
    set: Boolean(creds),
    email: creds?.email ?? null,
    updatedAt: creds?.updatedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are both required" }, { status: 400 });
  }
  if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
    return NextResponse.json(
      { error: "CREDENTIALS_ENCRYPTION_KEY isn't set — can't store this safely yet." },
      { status: 500 }
    );
  }
  await setStagingCredentials(email, password);
  return NextResponse.json({ ok: true, persistent: kvConfigured() });
}
