"use client";

import Link from "next/link";
import HomeBackground, { useBackgroundChoice } from "./components/HomeBackground";
import HomeFooter from "./components/HomeFooter";

type Status = "working" | "staging" | "planned";

// Tag colours: AF1 lava red for what's live, the vapor palette (purple /
// pink from the background image) for the rest. Same tokens in globals.css.
const STATUS: Record<Status, { label: string; bg: string; fg: string; border: string }> = {
  working: { label: "working", bg: "rgba(255,45,0,0.14)", fg: "var(--accent)", border: "rgba(255,45,0,0.4)" },
  staging: { label: "staging", bg: "rgba(200,117,181,0.14)", fg: "var(--vapor-pink)", border: "rgba(200,117,181,0.4)" },
  planned: { label: "planned", bg: "rgba(112,86,167,0.16)", fg: "var(--vapor-lilac)", border: "rgba(112,86,167,0.45)" },
};

const TILES: { title: string; href: string; external?: boolean; status: Status; text: string }[] = [
  {
    title: "UTM Studio",
    href: "https://utm-studio-two.vercel.app",
    external: true,
    status: "working",
    text: "Campaign links with UTM tags. Opens in its own tab for now.",
  },
  {
    title: "SEO Studio",
    href: "/seo",
    status: "staging",
    text: "Meta titles and descriptions for news and pages, EN and DE. Your Claude writes, the tool publishes.",
  },
  {
    title: "Asset Uploader",
    href: "/assets",
    status: "planned",
    text: "Drop photos, compress, name, alt text, upload to the right CMS folder.",
  },
  {
    title: "CRM Images",
    href: "/images",
    status: "planned",
    text: "Cropped, rounded variants for the CRM email templates.",
  },
  {
    title: "Claude connector",
    href: "/connector",
    status: "working",
    text: "Let your own Claude use these tools directly. One-minute setup, once.",
  },
];

export default function Home() {
  const [bg, setBg] = useBackgroundChoice();
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", paddingTop: 8, position: "relative", zIndex: 1 }}>
      <HomeBackground choice={bg} />

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <div
          role="img"
          aria-label="Audi Revolut F1 Team"
          className="af1-logo"
          style={{ width: 96, height: 88, margin: "0 auto", background: "var(--accent)" }}
        />
      </div>

      {/* Typographic logo */}
      <h1
        aria-label="AF1 Ktulu"
        style={{
          textAlign: "center",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: "clamp(40px, 7.5vw, 84px)",
          fontWeight: 300,
          color: "var(--fg)",
          lineHeight: 1,
          letterSpacing: "0.18em",
          margin: "28px 0 10px",
          textShadow: "0 2px 24px rgba(0,0,0,0.8), 0 0 40px rgba(239,162,214,0.25)",
        }}
      >
        AF1<span style={{ color: "var(--accent)", fontWeight: 200 }}>-</span>KTULU
        <sup style={{ fontSize: "0.35em", color: "var(--vapor-rose)", marginLeft: 4, letterSpacing: 0 }}>*</sup>
      </h1>
      <div
        aria-hidden
        style={{
          textAlign: "center",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: 20,
          fontWeight: 300,
          color: "var(--vapor-rose)",
          letterSpacing: "0.1em",
          opacity: 0.9,
          margin: "0 0 6px",
        }}
      >
        ^(;,;)^
      </div>
      <p style={{ textAlign: "center", margin: 0, opacity: 0.85, fontSize: 14, textShadow: "0 1px 12px rgba(0,0,0,0.9)" }}>
        Internal tools for audif1.com
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginTop: 36 }}>
        {TILES.map((t) => {
          const s = STATUS[t.status];
          const inner = (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  {t.title}
                  {t.external && <span style={{ opacity: 0.5, fontSize: 12, marginLeft: 6 }}>↗</span>}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: s.bg,
                    color: s.fg,
                    border: `1px solid ${s.border}`,
                    whiteSpace: "nowrap",
                  }}
                >
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
            background: "rgba(8,8,14,0.8)",
            backdropFilter: "blur(2px)",
            textDecoration: "none",
            color: "inherit",
          } as const;
          return t.external ? (
            <a key={t.title} href={t.href} target="_blank" rel="noreferrer" style={style} className="home-tile">
              {inner}
            </a>
          ) : (
            <Link key={t.title} href={t.href} style={style} className="home-tile">
              {inner}
            </Link>
          );
        })}
      </div>

      <p
        style={{
          fontSize: 13,
          color: "rgba(245,245,245,0.8)",
          lineHeight: 1.7,
          margin: "28px auto 0",
          maxWidth: 640,
          textAlign: "center",
          background: "rgba(4,6,14,0.7)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 16px",
          backdropFilter: "blur(2px)",
        }}
      >
        <span style={{ color: "var(--vapor-rose)" }}>*</span> <strong>Ktulu</strong> (n.), short, simplified spelling of{" "}
        <em>Cthulhu</em>: an ancient, god-like cosmic entity that sleeps in the sunken city of R&apos;lyeh. It reaches into
        the dreams of humans and is worshipped by a cult spread across the world. Its existence exceeds human
        understanding, and those who witness it are often driven to madness.
      </p>
      <HomeFooter bg={bg} onBg={setBg} />
    </div>
  );
}
