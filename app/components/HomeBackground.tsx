"use client";

import { useEffect, useState } from "react";
import KtuluLogo, { type AsciiSource } from "./KtuluLogo";

// The home page background: one of a few images rendered as a living
// ASCII/halftone grid. The choice is a per-browser convenience kept in
// localStorage; the default is the Ktulu illustration.
export const BACKGROUNDS: Record<string, { label: string; source: AsciiSource; opacity: number }> = {
  ktulu: { label: "Ktulu", source: { src: "/bg/ktulu.jpg", gamma: 1.5, gain: 1.0, fit: "contain" }, opacity: 0.6 },
  vapor: { label: "Vapor", source: { src: "/bg/vapor.jpg", gamma: 2.2, gain: 0.9, fit: "cover" }, opacity: 0.5 },
};

const KEY = "ktulu:bg";

export function useBackgroundChoice(): [string, (k: string) => void] {
  const [choice, setChoice] = useState("ktulu");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && BACKGROUNDS[saved]) setChoice(saved);
    } catch {
      // storage can be blocked; keep the default
    }
  }, []);
  const set = (k: string) => {
    setChoice(k);
    try {
      localStorage.setItem(KEY, k);
    } catch {
      // ignore
    }
  };
  return [choice, set];
}

export default function HomeBackground({ choice }: { choice: string }) {
  const bg = BACKGROUNDS[choice] ?? BACKGROUNDS.ktulu;
  return <KtuluLogo background source={bg.source} opacity={bg.opacity} />;
}

export function BackgroundPicker({ choice, onChange }: { choice: string; onChange: (k: string) => void }) {
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span>Background:</span>
      {Object.entries(BACKGROUNDS).map(([k, v]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: 11,
            color: "inherit",
            opacity: choice === k ? 1 : 0.5,
            textDecoration: choice === k ? "underline" : "none",
          }}
        >
          {v.label}
        </button>
      ))}
    </span>
  );
}
