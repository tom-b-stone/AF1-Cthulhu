import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { stagingFileUrl, uploadToCollection, upsertDraftPage } from "@/lib/payloadClient";
import { buildZineMeta, buildZineSections, zinePageSlug, zinePageTitle, type ZineAssets, type ZineMeta } from "@/lib/zinePage";
import { ensureZineAssets, zineFolder } from "@/lib/zineAssets";

// Builds the GP Mini-Zine fan page as a DRAFT on the staging CMS:
// 1. cover image + print PDF into the media library (folder "GP Mini-Zine")
// 2. how-to illustrations + teaser animation (uploaded once, lib/zineAssets)
// 3. the page layout from lib/zinePage (hero, teasers, how-to carousel,
//    download + Team Card CTA, share buttons).
// Nothing is published; an editor reviews and publishes in the CMS.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Meta = { slug: string; gpName: string; city: string; loc?: string; year: number; dateLabel: string; hashtags: string[]; instagram: string; shareUrl: string };

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const pdf = form.get("pdf");
  const cover = form.get("cover");
  let meta: Meta;
  try {
    meta = JSON.parse(String(form.get("meta") ?? "{}")) as Meta;
  } catch {
    return NextResponse.json({ error: "meta must be JSON" }, { status: 400 });
  }
  if (!(pdf instanceof Blob) || !(cover instanceof Blob) || !meta.slug) return NextResponse.json({ error: "pdf, cover and meta required" }, { status: 400 });

  const steps: string[] = [];
  try {
    const folder = await zineFolder();
    const base = `audif1_${meta.year}_${meta.slug.split("-").pop()?.toUpperCase()}_GP_mini-zine`;
    const coverDoc = await uploadToCollection("media", cover, `${base}_cover.jpg`, {
      alt: `Cover of the Audi Revolut F1® Team GP Mini-Zine for the ${meta.gpName} ${meta.year}`,
      ...(folder ? { folder } : {}),
    });
    steps.push("cover uploaded");
    let pdfDoc: { id: string; url: string };
    try {
      pdfDoc = await uploadToCollection("media", pdf, `${base}_print.pdf`, { alt: `Printable GP Mini-Zine, ${meta.gpName} ${meta.year}`, ...(folder ? { folder } : {}) });
      steps.push("PDF uploaded to media");
    } catch (e) {
      steps.push(`media refused the PDF (${e instanceof Error ? e.message.slice(0, 80) : "error"}), trying files`);
      pdfDoc = await uploadToCollection("files", pdf, `${base}_print.pdf`, { title: `GP Mini-Zine ${meta.gpName} ${meta.year}` });
      steps.push("PDF uploaded to files");
    }
    const pdfUrl = stagingFileUrl(pdfDoc.url);
    const coverUrl = stagingFileUrl(coverDoc.url);

    let assets: ZineAssets | null = null;
    try {
      assets = await ensureZineAssets(req.nextUrl.origin);
      steps.push("how-to media ready");
    } catch (e) {
      steps.push(`how-to media missing (${e instanceof Error ? e.message.slice(0, 80) : "error"}), page built without them`);
    }
    const zm: ZineMeta = { slug: meta.slug, gpName: meta.gpName, city: meta.city, loc: meta.loc || meta.slug.split("-").pop()!.toUpperCase(), year: meta.year, dateLabel: meta.dateLabel, hashtags: meta.hashtags, instagram: meta.instagram };
    const page = await upsertDraftPage(zinePageSlug(zm), {
      title: zinePageTitle(zm),
      authRequirement: "PUBLIC",
      sections: buildZineSections(zm, assets, { coverMedia: coverDoc.id, pdfUrl, pageUrl: `https://www.audif1.com/en/${zinePageSlug(zm)}` }),
      meta: buildZineMeta(zm, coverDoc.id),
    });
    steps.push(page.created ? "draft page created" : "draft page updated");
    console.log(`[photobook] ${session.user.email} published draft page ${page.id} for ${meta.slug}`);
    return NextResponse.json({ ok: true, steps, pageId: page.id, pageAdminUrl: page.adminUrl, pdfUrl, coverUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed", steps }, { status: 502 });
  }
}
