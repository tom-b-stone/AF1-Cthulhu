import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { learnPerson } from "@/lib/learnRun";

// In-tool learning, one person per request: POST { person } → { result }.
// The learn page loops over the people in Team knowledge.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { person } = (await req.json().catch(() => ({}))) as { person?: string };
  if (!person) return NextResponse.json({ error: "person required" }, { status: 400 });
  try {
    const result = await learnPerson(person, { maxLook: 8, wantRefs: 6 });
    console.log(`[learn] ${session.user.email} ${result.person}: looked ${result.looked}, saved ${result.saved}`);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
