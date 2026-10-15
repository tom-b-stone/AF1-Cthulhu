import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { writeSharePage } from "@/lib/photobookShare";
import type { SharePage } from "@/lib/photobook";

// Saves the public share page for a book (the QR code's target).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Partial<SharePage> | null;
  if (!b?.slug || !/^[a-z0-9-]{3,40}$/.test(b.slug) || !b.gpName) return NextResponse.json({ error: "slug and gpName required" }, { status: 400 });
  const page: SharePage = {
    slug: b.slug,
    gpName: String(b.gpName),
    city: String(b.city ?? ""),
    year: Number(b.year ?? new Date().getFullYear()),
    dateLabel: String(b.dateLabel ?? ""),
    hashtags: Array.isArray(b.hashtags) ? b.hashtags.map(String).slice(0, 6) : ["#ARF1"],
    instagram: String(b.instagram ?? "").replace(/^@/, ""),
    coverUrl: b.coverUrl ? String(b.coverUrl) : undefined,
    pdfUrl: b.pdfUrl ? String(b.pdfUrl) : undefined,
    updatedAt: new Date().toISOString(),
  };
  await writeSharePage(page);
  console.log(`[photobook] ${session.user.email} saved share page ${page.slug}`);
  return NextResponse.json({ ok: true, page });
}
