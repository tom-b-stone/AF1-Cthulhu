import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { addExample, readExamples, removeExample } from "@/lib/examplesStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ examples: await readExamples() });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { subject?: string; alt?: string };
  if (!b.alt?.trim()) return NextResponse.json({ error: "alt required" }, { status: 400 });
  return NextResponse.json({ examples: await addExample({ subject: (b.subject ?? "general").slice(0, 40), alt: b.alt.trim(), source: "manual" }) });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  return NextResponse.json({ examples: await removeExample(id) });
}
