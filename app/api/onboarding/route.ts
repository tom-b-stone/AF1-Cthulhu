import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { kvGet, kvSet } from "@/lib/kv";

// Per-user onboarding state (which overlays were completed / snoozed).
// Keyed by email so it follows the person across browsers.
type State = Record<string, { done?: string; snoozedUntil?: string }>;

async function read(email: string): Promise<State> {
  try {
    const raw = await kvGet(`onboarding:${email}`);
    return raw ? (JSON.parse(raw) as State) : {};
  } catch {
    return {};
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await read(email));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { flow?: string; action?: "done" | "snooze" | "reset" };
  if (!body.flow) return NextResponse.json({ error: "flow required" }, { status: 400 });
  const state = await read(email);
  if (body.action === "done") state[body.flow] = { done: new Date().toISOString() };
  else if (body.action === "snooze") state[body.flow] = { snoozedUntil: new Date(Date.now() + 7 * 864e5).toISOString() };
  else delete state[body.flow];
  await kvSet(`onboarding:${email}`, JSON.stringify(state));
  return NextResponse.json(state);
}
