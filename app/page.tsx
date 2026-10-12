import Link from "next/link";
import KtuluLogo from "./components/KtuluLogo";
import HomeFooter from "./components/HomeFooter";

type Status = "working" | "staging" | "planned";

const STATUS: Record<Status, { label: string; bg: string; fg: string }> = {
  working: { label: "working", bg: "#1e3a24", fg: "#6fcf7c" },
  staging: { label: "working · staging", bg: "#1e3a24", fg: "#6fcf7c" },
  planned: { label: "planned", bg: "#333", fg: "#bbb" },
};

const TILES: { title: string; href: string; external?: boolean; status: Status; text: string }[] = [
  {
    title: "UTM Studio",
    href: "https://utm-studio-two.vercel.app",
    external: true,
    status: "working",
    text: "Build and tag campaign links. Still its own app — opens in a new tab until it moves in here.",
  },
  {
    title: "SEO Studio",
    href: "/seo",
    status: "staging",
    text: "Meta titles and descriptions for every news article and page, EN and DE. Generate with your own Claude, publish with the date untouched.",
  },
  {
    title: "Asset Uploader",
    href: "/assets",
    status: "planned",
    text: "Compress an image, pick a Payload media folder, upload, write the alt text.",
  },
  {
    title: "CRM Images",
    href: "/images",
    status: "planned",
    text: "Cropped, rounded-corner variants for the CRM email templates, ready to download.",
  },
  {
    title: "Claude connector",
    href: "/connector",
    status: "working",
    text: "Let your own Claude use these tools directly. One-minute setup, once per person.",
  },
];

export default function Home() {
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", paddingTop: 16, position: "relative", zIndex: 1 }}>
      <KtuluLogo background />
      <div
        aria-label="Ktulu"
        style={{
          textAlign: "center",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: "clamp(56px, 10vw, 112px)",
          fontWeight: 700,
          color: "var(--accent)",
          lineHeight: 1,
          letterSpacing: "0.02em",
          margin: "40px 0 12px",
          textShadow: "0 0 24px rgba(255,69,25,0.35)",
        }}
      >
        ^(;,;)^
      </div>
      <h1 style={{ textAlign: "center", margin: "20px 0 4px", letterSpacing: 2 }}>AF1 Ktulu</h1>
      <p style={{ textAlign: "center", margin: 0, opacity: 0.6, fontSize: 13 }}>Internal tools for audif1.com</p>

      <p style={{ fontSize: 13, opacity: 0.65, lineHeight: 1.65, margin: "20px auto 0", maxWidth: 680, textAlign: "center" }}>
        <strong style={{ opacity: 1 }}>Ktulu</strong> <span style={{ opacity: 0.7 }}>(n.)</span> — short, simplified
        spelling of <em>Cthulhu</em>: an ancient, god-like cosmic entity that sleeps in the sunken city of
        R&apos;lyeh. It reaches into the dreams of humans and is worshipped by a cult spread across the world. Its
        existence exceeds human understanding, and those who witness it are often driven to madness. Here: a box
        of tools that quietly reaches into every entry of the CMS.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginTop: 24 }}>
        {TILES.map((t) => {
          const s = STATUS[t.status];
          const inner = (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  {t.title}
                  {t.external && <span style={{ opacity: 0.5, fontSize: 12, marginLeft: 6 }}>↗</span>}
                </span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>
                  {s.label}
                </span>
              </div>
              <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.55, marginTop: 8 }}>{t.text}</div>
            </>
          );
          const style = {
            display: "block",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "14px 16px",
            background: "rgba(11,11,12,0.78)",
            backdropFilter: "blur(2px)",
            textDecoration: "none",
            color: "inherit",
          } as const;
          return t.external ? (
            <a key={t.title} href={t.href} target="_blank" rel="noreferrer" style={style}>
              {inner}
            </a>
          ) : (
            <Link key={t.title} href={t.href} style={style}>
              {inner}
            </Link>
          );
        })}
      </div>
      <HomeFooter />
    </div>
  );
}
