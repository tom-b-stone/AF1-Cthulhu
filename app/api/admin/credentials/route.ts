import { NextRequest, NextResponse } from "next/server";
import { getStagingCredentials, setStagingCredentials, kvConfigured } from "@/lib/settings";

// GET never returns the password — only whether one is set, the email, and
// when it was last changed. Write-only secret field, same pattern as any
// normal secrets manager UI.
export async function GET() {
  const creds = await getStagingCredentials();
  return NextResponse.json({
    persistent: kvConfigured(),
    set: Boolean(creds),
    email: creds?.email ?? null,
    updatedAt: creds?.updatedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
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
