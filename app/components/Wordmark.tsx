"use client";

import { useEffect, useMemo, useState } from "react";

// AF1-KTULU with every letter in a different Google Font, re-rolled on
// each load: the letters flicker through fonts, then settle one after
// another from left to right. The font list is a curated slice of Google
// Fonts (display faces that read at this size); loading "all" of Google
// Fonts isn't possible in a page, this is ~40 of them, one stylesheet.
import { WORDMARK_FONTS } from "@/lib/wordmarkFonts";

const LETTERS = ["A", "F", "1", "-", "K", "T", "U", "L", "U"];

function pick(exclude?: string): string {
  let f = WORDMARK_FONTS[Math.floor(Math.random() * WORDMARK_FONTS.length)];
  if (f === exclude) f = WORDMARK_FONTS[(WORDMARK_FONTS.indexOf(f) + 1) % WORDMARK_FONTS.length];
  return f;
}

export default function Wordmark() {
  // final fonts are decided up front (one per letter, all different where possible)
  const finalFonts = useMemo(() => {
    const used = new Set<string>();
    return LETTERS.map(() => {
      let f = pick();
      let guard = 0;
      while (used.has(f) && guard++ < 10) f = pick(f);
      used.add(f);
      return f;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [fonts, setFonts] = useState<string[]>(finalFonts);
  const [settled, setSettled] = useState<boolean[]>(() => LETTERS.map(() => true));

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    setSettled(LETTERS.map(() => false));
    const t0 = performance.now();
    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (now - last < 70) return;
      last = now;
      const el = now - t0;
      setFonts((prev) => prev.map((f, i) => (el > 500 + i * 220 ? finalFonts[i] : pick(f))));
      setSettled(LETTERS.map((_, i) => el > 500 + i * 220));
      if (el > 500 + LETTERS.length * 220 + 100) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [finalFonts]);

  return (
    <h1
      aria-label="AF1 Ktulu"
      style={{
        display: "flex",
        justifyContent: "space-between",
        width: "100%",
        height: "clamp(64px, 9.5vw, 112px)",
        margin: "22px 0 4px",
        lineHeight: 1,
        fontSize: "clamp(44px, 8.6vw, 96px)",
        alignItems: "center",
        fontWeight: 400,
        color: "#fff",
        textShadow: "0 2px 24px rgba(0,0,0,0.8)",
      }}
    >
      {LETTERS.map((ch, i) => (
        <span
          key={i}
          style={{
            fontFamily: `"${fonts[i]}", ${fonts[i] === "Fahkwang" ? "sans-serif" : "monospace"}`,
            color: ch === "-" ? "var(--accent)" : "#fff",
            opacity: settled[i] ? 1 : 0.75,
            transform: settled[i] ? "none" : "translateY(-2px)",
            transition: "opacity 0.2s, transform 0.2s",
            flex: "0 0 auto",
            minWidth: "0.6em",
            textAlign: "center",
            display: "inline-block",
            height: "1em",
            lineHeight: 1,
            overflow: "visible",
          }}
        >
          {ch}
        </span>
      ))}
      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.35em", color: "var(--vapor-rose)", alignSelf: "flex-start" }}>*</span>
    </h1>
  );
}
