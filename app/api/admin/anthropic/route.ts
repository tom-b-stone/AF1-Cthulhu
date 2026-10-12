import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { clearAnthropicSettings, getAnthropicSettings, setAnthropicSettings, DEFAULT_MODEL, kvConfigured } from "@/lib/settings";

// Anthropic API key for in-tool generation. GET never returns the key, only
// its last 4 characters, the model and when it was set.
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return (session?.user as { role?: string } | undefined)?.role === "admin";
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await getAnthropicSettings();
  return NextResponse.json({ persistent: kvConfigured(), set: Boolean(s), last4: s ? s.key.slice(-4) : null, model: s?.model ?? DEFAULT_MODEL, updatedAt: s?.updatedAt ?? null });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { key, model } = (await req.json().catch(() => ({}))) as { key?: string; model?: string };
  if (!process.env.CREDENTIALS_ENCRYPTION_KEY) return NextResponse.json({ error: "CREDENTIALS_ENCRYPTION_KEY isn't set — can't store this safely yet." }, { status: 500 });
  const current = await getAnthropicSettings();
  const k = (key ?? "").trim() || current?.key;
  if (!k) return NextResponse.json({ error: "key required" }, { status: 400 });
  if (!/^sk-ant-/.test(k)) return NextResponse.json({ error: "that doesn't look like an Anthropic key (sk-ant-…)" }, { status: 400 });
  // check it works before saving
  const probe = await fetch("https://api.anthropic.com/v1/models?limit=50", { headers: { "x-api-key": k, "anthropic-version": "2023-06-01" } });
  if (!probe.ok) return NextResponse.json({ error: `Anthropic rejected the key (${probe.status})` }, { status: 400 });
  const models = ((await probe.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
  const chosen = (model ?? "").trim() || current?.model || DEFAULT_MODEL;
  if (models.length && !models.includes(chosen)) {
    return NextResponse.json({ error: `Model "${chosen}" isn't available on this key. Available: ${models.filter((m) => /sonnet|opus|haiku/.test(m)).slice(0, 8).join(", ")}` }, { status: 400 });
  }
  await setAnthropicSettings(k, chosen);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await clearAnthropicSettings();
  return NextResponse.json({ ok: true });
}
