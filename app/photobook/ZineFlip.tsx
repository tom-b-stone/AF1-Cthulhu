"use client";

// Flip-through preview of a zine: 16 rendered pages as a 3D booklet.
// Plays by itself; arrows or a click on the right/left page turn by hand.
import { useEffect, useState } from "react";

export default function ZineFlip({ pages, height = 420 }: { pages: string[]; height?: number }) {
  const leaves = Math.ceil(pages.length / 2);
  const [turned, setTurned] = useState(0);
  const [playing, setPlaying] = useState(true);
  const pw = Math.round((height * 74) / 105);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTurned((n) => (n >= leaves ? 0 : n + 1)), 1400);
    return () => clearInterval(t);
  }, [playing, leaves]);

  const go = (d: number) => {
    setPlaying(false);
    setTurned((n) => Math.max(0, Math.min(leaves, n + d)));
  };

  // closed on the cover: centre the right half; fully turned: centre the left half
  const shift = turned === 0 ? -pw / 2 : turned === leaves ? pw / 2 : 0;

  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      <div style={{ perspective: 2200, width: pw * 2 + 40, height: height + 40, display: "grid", placeItems: "center" }}>
        <div style={{ position: "relative", width: pw * 2, height, transformStyle: "preserve-3d", transform: `translateX(${shift}px) rotateX(14deg)`, transition: "transform 0.9s cubic-bezier(.55,.05,.25,1)" }}>
          {Array.from({ length: leaves }, (_, i) => {
            const on = i < turned;
            const front = pages[i * 2];
            const back = pages[i * 2 + 1];
            return (
              <div
                key={i}
                onClick={() => go(on ? -1 : 1)}
                style={{
                  position: "absolute",
                  left: pw,
                  top: 0,
                  width: pw,
                  height,
                  transformOrigin: "left center",
                  transformStyle: "preserve-3d",
                  transform: `translateZ(${on ? i * 0.6 + 1 : (leaves - i) * 0.6}px) rotateY(${on ? -179.5 : 0}deg)`,
                  transition: "transform 0.9s cubic-bezier(.55,.05,.25,1)",
                  cursor: "pointer",
                  zIndex: on ? i : leaves - i,
                }}
              >
                <div style={{ position: "absolute", inset: 0, background: `#fff url(${front}) center/cover`, backfaceVisibility: "hidden", boxShadow: "inset 10px 0 16px -12px rgba(0,0,0,.45), 0 18px 40px rgba(0,0,0,.35)" }} />
                {back && (
                  <div style={{ position: "absolute", inset: 0, background: `#fff url(${back}) center/cover`, backfaceVisibility: "hidden", transform: "rotateY(180deg)", boxShadow: "inset -10px 0 16px -12px rgba(0,0,0,.45), 0 18px 40px rgba(0,0,0,.35)" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn" onClick={() => go(-1)} disabled={turned === 0}>
          ←
        </button>
        <button className="btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button className="btn" onClick={() => go(1)} disabled={turned === leaves}>
          →
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {turned === 0 ? "Cover" : turned === leaves ? "Back" : `Pages ${turned * 2}–${turned * 2 + 1}`}
        </span>
      </div>
    </div>
  );
}
