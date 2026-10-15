import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { copyTeamCard } from "@/lib/teamCardCopy";

// Copies one Team Card (badge + engagement + page teaser) from production
// to staging. Staging only; the page change is saved as a draft version.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { badgeId?: string; keepDraft?: boolean; withPageBlock?: boolean } | null;
  const id = (b?.badgeId ?? "").match(/[a-f0-9]{24}/)?.[0];
  if (!id) return NextResponse.json({ error: "badgeId (production badge id or admin link) required" }, { status: 400 });
  const result = await copyTeamCard({ badgeId: id, keepDraft: b?.keepDraft, withPageBlock: b?.withPageBlock });
  console.log(`[teamcards] ${session.user.email} copied ${id} → staging: ${result.ok ? "ok" : "with issues"}`);
  return NextResponse.json(result);
}
