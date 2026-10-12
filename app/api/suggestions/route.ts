import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { kvGet, kvSet } from "@/lib/kv";

// Suggestion box → admin message board. One JSON list in KV; volumes are
// tiny (a team of a few people), so read-modify-write is fine.
export type Suggestion = {
  id: string;
  createdAt: string;
  from: string;
  tool: string;
  title: string;
  text: string;
  status: "new" | "seen" | "done";
};

const KEY = "suggestions:v1";

async function readAll(): Promise<Suggestion[]> {
  try {
    const raw = await kvGet(KEY);
    return raw ? (JSON.parse(raw) as Suggestion[]) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const isAdmin = (session.user as { role?: string } | undefined)?.role === "admin";
  const all = await readAll();
  // Non-admins only see their own, so the form can show "sent" history.
  const mine = isAdmin ? all : all.filter((s) => s.from === session.user?.email);
  return NextResponse.json({ suggestions: mine, isAdmin });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<Suggestion>;
  const title = (body.title ?? "").toString().trim().slice(0, 140);
  const text = (body.text ?? "").toString().trim().slice(0, 4000);
  const tool = (body.tool ?? "general").toString().trim().slice(0, 40);
  if (!title || !text) return NextResponse.json({ error: "title and text are required" }, { status: 400 });
  const all = await readAll();
  const s: Suggestion = {
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    createdAt: new Date().toISOString(),
    from: session.user.email,
    tool,
    title,
    text,
    status: "new",
  };
  all.unshift(s);
  await kvSet(KEY, JSON.stringify(all.slice(0, 500)));
  return NextResponse.json({ ok: true, suggestion: s });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  if (!isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: Suggestion["status"] };
  if (!body.id || !body.status) return NextResponse.json({ error: "id and status required" }, { status: 400 });
  const all = await readAll();
  const s = all.find((x) => x.id === body.id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  s.status = body.status;
  await kvSet(KEY, JSON.stringify(all));
  return NextResponse.json({ ok: true });
}
