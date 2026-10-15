import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { readSharePage } from "@/lib/photobookShare";
import CopyTags from "./CopyTags";

// Public share page behind the QR code on the printed photobook. Styled in
// the audif1.com system (chalk / graphite / lava, Archivo); lives in Ktulu
// for the prototype and moves into audif1.com later.
export const dynamic = "force-dynamic";

const LAVA = "#E33E1A";
const CHALK = "#F5F2F2";
const GRAPHITE = "#2B2929";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await readSharePage(params.slug);
  return { title: p ? `Share your ${p.city} photobook | Audi Revolut F1® Team` : "Photobook | Audi Revolut F1® Team" };
}

export default async function SharePage({ params }: { params: { slug: string } }) {
  const p = await readSharePage(params.slug);
  if (!p) notFound();
  const tags = [`@${p.instagram}`, ...p.hashtags].join(" ");
  const font = '"Archivo", "Helvetica Neue", Arial, sans-serif';
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "auto", zIndex: 50, background: CHALK, color: GRAPHITE, fontFamily: font }}>
      <div style={{ background: GRAPHITE, color: CHALK }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 0" }}>
          <div role="img" aria-label="Audi Revolut F1® Team" className="af1-logo" style={{ width: 40, height: 36, background: CHALK, filter: "none" }} />
        </div>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 44px", display: "grid", gap: 18 }}>
          <div style={{ width: 48, height: 5, background: LAVA }} />
          <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.75 }}>
            {p.gpName} {p.year} · Photobook
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(38px, 9vw, 64px)", lineHeight: 1, fontWeight: 800, letterSpacing: "-0.01em" }}>Share your book.</h1>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.5, opacity: 0.85, maxWidth: 520 }}>
            You printed it, cut it and folded it. Show us your {p.city} weekend in print.
          </p>
        </div>
        {p.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.coverUrl} alt={`Cover of the ${p.gpName} ${p.year} mini photobook`} style={{ display: "block", width: "100%", maxHeight: 420, objectFit: "cover" }} />
        )}
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 60px", display: "grid", gap: 28 }}>
        {[
          ["01", "Take a photo of your book", "Open on your favourite page, or fanned out on the table."],
          ["02", "Post it on Instagram", "Feed or story, whatever you like."],
          ["03", "Tag us", tags],
        ].map(([n, h, t]) => (
          <div key={n} style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 12, alignItems: "baseline" }}>
            <span style={{ color: LAVA, fontWeight: 800, fontSize: 20 }}>{n}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 22 }}>{h}</div>
              <div style={{ fontSize: 16, lineHeight: 1.5, opacity: 0.8, marginTop: 4 }}>{t}</div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <a
            href={`https://www.instagram.com/${p.instagram}/`}
            style={{ background: LAVA, color: CHALK, textDecoration: "none", borderRadius: 999, padding: "12px 22px", fontWeight: 700, fontSize: 15 }}
          >
            Open Instagram
          </a>
          <CopyTags text={tags} />
        </div>
        {p.pdfUrl && (
          <div style={{ borderTop: `1px solid #d8d4d4`, paddingTop: 24, fontSize: 16, lineHeight: 1.5 }}>
            No book yet?{" "}
            <a href={p.pdfUrl} style={{ color: LAVA, fontWeight: 700 }}>
              Download the print file
            </a>{" "}
            and make your own.
          </div>
        )}
        <div style={{ fontSize: 12, opacity: 0.6 }}>Audi Revolut F1® Team</div>
      </div>
    </div>
  );
}
