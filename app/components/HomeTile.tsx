"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import MorphIcon, { MORPH_PRESETS } from "./MorphIcon";

// Home tile: 3D icon hanging over the top-left corner, cursor-driven tilt
// of the card (perspective) and of the icon (it turns toward the cursor).
export default function HomeTile({
  title,
  href,
  tileKey,
  external,
  status,
  text,
  children,
}: {
  title: string;
  href?: string;
  tileKey: string;
  external?: boolean;
  status?: { label: string; bg: string; fg: string; border: string };
  text?: string;
  children?: React.ReactNode;
}) {
  const pointer = useRef({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, hover: false });
  const preset = MORPH_PRESETS[tileKey];

  function onMove(e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    pointer.current = { x, y };
    setTilt({ rx: -y * 5, ry: x * 6, hover: true });
  }
  function onLeave() {
    pointer.current = { x: 0, y: 0 };
    setTilt({ rx: 0, ry: 0, hover: false });
  }

  const style: React.CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    minHeight: 168,
    border: `1px solid ${tilt.hover ? "var(--vapor-purple)" : "var(--border)"}`,
    borderRadius: 12,
    padding: "18px 18px 16px 18px",
    background: "rgba(8,8,14,0.82)",
    backdropFilter: "blur(2px)",
    textDecoration: "none",
    color: "inherit",
    transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(${tilt.hover ? 6 : 0}px)`,
    transition: tilt.hover ? "transform 0.08s linear, border-color 0.2s" : "transform 0.4s cubic-bezier(.2,.8,.2,1), border-color 0.2s",
    boxShadow: tilt.hover ? "0 18px 50px rgba(69,64,134,0.25)" : "none",
    overflow: "visible",
  };

  const inner = (
    <>
      {preset && (
        <div style={{ position: "absolute", top: -22, left: -16, pointerEvents: "none", filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.6))" }}>
          <MorphIcon size={72} {...preset} pointer={pointer} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, paddingLeft: preset ? 44 : 0 }}>
        <span style={{ fontWeight: 600, fontSize: 15, fontFamily: "var(--font-heading)" }}>
          {title}
          {external && <span style={{ opacity: 0.5, fontSize: 12, marginLeft: 6 }}>↗</span>}
        </span>
        {status && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: status.bg, color: status.fg, border: `1px solid ${status.border}`, whiteSpace: "nowrap" }}>
            {status.label}
          </span>
        )}
      </div>
      {text && <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, marginTop: 10 }}>{text}</div>}
      {children}
    </>
  );

  if (!href) {
    return (
      <div className="home-tile" style={style} onMouseMove={onMove} onMouseLeave={onLeave}>
        {inner}
      </div>
    );
  }
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className="home-tile" style={style} onMouseMove={onMove} onMouseLeave={onLeave}>
      {inner}
    </a>
  ) : (
    <Link href={href} className="home-tile" style={style} onMouseMove={onMove} onMouseLeave={onLeave}>
      {inner}
    </Link>
  );
}
