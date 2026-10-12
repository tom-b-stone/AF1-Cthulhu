"use client";

import Link from "next/link";
import HomeBackground, { useBackgroundChoice } from "./components/HomeBackground";
import HomeFooter from "./components/HomeFooter";
import HomeTile from "./components/HomeTile";
import SuggestionTile from "./components/SuggestionTile";
import Wordmark from "./components/Wordmark";

type Status = "working" | "staging" | "planned";

// Tag colours: AF1 lava red for what's live, the vapor palette (purple /
// pink from the background image) for the rest. Same tokens in globals.css.
const STATUS: Record<Status, { label: string; bg: string; fg: string; border: string }> = {
  working: { label: "working", bg: "rgba(255,45,0,0.14)", fg: "var(--accent)", border: "rgba(255,45,0,0.4)" },
  staging: { label: "staging", bg: "rgba(200,117,181,0.14)", fg: "var(--vapor-pink)", border: "rgba(200,117,181,0.4)" },
  planned: { label: "planned", bg: "rgba(112,86,167,0.16)", fg: "var(--vapor-lilac)", border: "rgba(112,86,167,0.45)" },
};

const TILES: { title: string; href: string; key: string; external?: boolean; status: Status; text: string }[] = [
  {
    title: "SEO Studio",
    href: "/seo",
    key: "/seo",
    status: "staging",
    text: "Meta titles and descriptions for news and pages, EN and DE. Your Claude writes, the tool publishes.",
  },
  {
    title: "Asset Uploader",
    href: "/assets",
    key: "/assets",
    status: "working",
    text: "Drop photos, compress, name, alt text, upload to the right CMS folder.",
  },
  {
    title: "CRM Images",
    href: "/images",
    key: "/images",
    status: "planned",
    text: "Cropped, rounded variants for the CRM email templates.",
  },
  {
    title: "UTM Studio",
    href: "https://af1-utm-studio.vercel.app/",
    key: "/utm",
    external: true,
    status: "working",
    text: "Campaign links with UTM tags. Opens in its own tab for now.",
  },
  {
    title: "Claude connector",
    href: "/connector",
    key: "/connector",
    status: "working",
    text: "Let your own Claude use these tools directly. One-minute setup, once.",
  },
];

export default function Home() {
  const [bg, setBg] = useBackgroundChoice();
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", paddingTop: 8, position: "relative", zIndex: 1 }}>
      <HomeBackground choice={bg} />
      {/* Everything after the background sits in its own layer: the fixed
          canvas is a positioned z-0 element inside this container, so
          unpositioned text would otherwise paint underneath it. */}
      <div style={{ position: "relative", zIndex: 2 }}>

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <div
          role="img"
          aria-label="Audi Revolut F1 Team"
          className="af1-logo"
          style={{ width: 96, height: 88, margin: "0 auto", background: "var(--accent)" }}
        />
      </div>

      <Wordmark />
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: "1fr", gap: 22, marginTop: 44 }}>
        {TILES.map((t) => (
          <HomeTile key={t.key} title={t.title} href={t.href} tileKey={t.key} external={t.external} status={STATUS[t.status]} text={t.text} />
        ))}
        <SuggestionTile />
      </div>

      <p
        style={{
          fontSize: 13,
          color: "rgba(245,245,245,0.8)",
          lineHeight: 1.7,
          margin: "28px auto 0",
          maxWidth: "100%",
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
    </div>
  );
}
