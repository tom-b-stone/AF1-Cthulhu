import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { createMediaFolder, listMediaFolders, stagingFileUrl, uploadToCollection, upsertDraftPage } from "@/lib/payloadClient";

// Builds the fan microsite as a DRAFT page on the staging CMS:
// 1. cover image + print PDF into the media library (folder "Photobook")
// 2. a page with a hero (cover photo) and a free-text block (how it works,
//    download link, share link), using the blocks the site already has.
// Nothing is published; an editor reviews and publishes in the CMS.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Meta = { slug: string; gpName: string; city: string; year: number; dateLabel: string; hashtags: string[]; instagram: string; shareUrl: string };

const text = (t: string, format = 0) => ({ type: "text", text: t, detail: 0, format, mode: "normal", style: "", version: 1 });
const para = (...children: unknown[]) => ({ type: "paragraph", children, direction: null, format: "", indent: 0, version: 1, textFormat: 0, textStyle: "" });
const link = (label: string, url: string) => ({
  type: "link",
  version: 3,
  fields: { linkType: "custom", url, newTab: true },
  children: [text(label, 1)],
  direction: null,
  format: "",
  indent: 0,
});

async function photobookFolder(): Promise<string | null> {
  try {
    const all = await listMediaFolders();
    const hit = all.find((f) => f.name === "Photobook" && !f.parent);
    if (hit) return hit.id;
    return (await createMediaFolder("Photobook", null)).id;
  } catch {
    return null;
  }
}

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
    const folder = await photobookFolder();
    const base = `audif1_${meta.year}_${meta.slug.split("-").pop()?.toUpperCase()}_GP_photobook`;
    const coverDoc = await uploadToCollection("media", cover, `${base}_cover.jpg`, {
      alt: `Cover of the Audi Revolut F1® Team mini photobook for the ${meta.gpName} ${meta.year}`,
      ...(folder ? { folder } : {}),
    });
    steps.push("cover uploaded");
    let pdfDoc: { id: string; url: string };
    try {
      pdfDoc = await uploadToCollection("media", pdf, `${base}_print.pdf`, { alt: `Printable mini photobook, ${meta.gpName} ${meta.year}`, ...(folder ? { folder } : {}) });
      steps.push("PDF uploaded to media");
    } catch (e) {
      steps.push(`media refused the PDF (${e instanceof Error ? e.message.slice(0, 80) : "error"}), trying files`);
      pdfDoc = await uploadToCollection("files", pdf, `${base}_print.pdf`, { title: `Mini photobook ${meta.gpName} ${meta.year}` });
      steps.push("PDF uploaded to files");
    }
    const pdfUrl = stagingFileUrl(pdfDoc.url);
    const coverUrl = stagingFileUrl(coverDoc.url);

    const page = await upsertDraftPage(`photobook-${meta.slug}`, {
      title: `Photobook | ${meta.gpName} ${meta.year}`,
      sections: [
        {
          blockType: "hero",
          category: "Photobook",
          headline: `Your ${meta.city} weekend, in print.`,
          subline: `${meta.gpName} ${meta.year}`,
          copy: "Thirteen moments from the race weekend as a mini book to print and fold at home. Two A4 sheets, one cut each, no glue.",
          ctas: [],
          container: {
            contentPosition: "bottom",
            horizontalPosition: "left",
            size: "large",
            background: { type: "image", imageSettings: { media: coverDoc.id, shouldHaveOverlay: true, bgColor: "graphite" } },
          },
          authRequirement: "PUBLIC",
        },
        {
          blockType: "free-text",
          background: { type: "color", color: "grey-01" },
          headline: "Print. Fold. Share.",
          subline: meta.dateLabel || `${meta.gpName} ${meta.year}`,
          content: {
            root: {
              type: "root",
              format: "",
              indent: 0,
              version: 1,
              direction: null,
              children: [
                para(text("Print both sheets on A4, landscape, at 100 %. Cut along the red line, fold along the guides, and slide sheet 2 into sheet 1. The last page of the PDF shows every fold.")),
                para(link("Download the mini photobook (PDF)", pdfUrl)),
                para(text(`Made yours? Scan the code on the back, post your book and tag @${meta.instagram} with ${meta.hashtags.join(" ")}.`)),
                para(link("Share your book", meta.shareUrl)),
              ],
            },
          },
          authRequirement: "PUBLIC",
        },
      ],
      meta: {
        title: `${meta.gpName} ${meta.year} Photobook | Audi Revolut F1® Team`,
        description: `Print and fold your own mini photobook of the ${meta.gpName} ${meta.year}: thirteen moments from the Audi Revolut F1® Team weekend.`,
        image: coverDoc.id,
      },
    });
    steps.push(page.created ? "draft page created" : "draft page updated");
    console.log(`[photobook] ${session.user.email} published draft page ${page.id} for ${meta.slug}`);
    return NextResponse.json({ ok: true, steps, pageId: page.id, pageAdminUrl: page.adminUrl, pdfUrl, coverUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed", steps }, { status: 502 });
  }
}
