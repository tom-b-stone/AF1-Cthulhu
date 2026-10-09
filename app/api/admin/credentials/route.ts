import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  getStagingCredentials,
  setStagingCredentials,
  getAnthropicApiKey,
  setAnthropicApiKey,
  kvConfigured,
} from "@/lib/settings";

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
  const [creds, anthropic] = await Promise.all([getStagingCredentials(), getAnthropicApiKey()]);
  return NextResponse.json({
    persistent: kvConfigured(),
    set: Boolean(creds),
    email: creds?.email ?? null,
    updatedAt: creds?.updatedAt ?? null,
    anthropicSet: Boolean(anthropic),
    anthropicUpdatedAt: anthropic?.updatedAt ?? null,
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

// Separate PUT for the Anthropic API key so saving one credential never
// touches the other (the staging login form has no idea this field exists).
export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { anthropicApiKey } = await req.json();
  if (!anthropicApiKey) {
    return NextResponse.json({ error: "anthropicApiKey is required" }, { status: 400 });
  }
  if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
    return NextResponse.json(
      { error: "CREDENTIALS_ENCRYPTION_KEY isn't set — can't store this safely yet." },
      { status: 500 }
    );
  }
  await setAnthropicApiKey(anthropicApiKey);
  return NextResponse.json({ ok: true, persistent: kvConfigured() });
}
