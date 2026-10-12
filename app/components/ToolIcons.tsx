"use client";

// Tool icons: flat geometric primitives with saturated multi-stop
// gradients on black (the "pop-geometry" language of the reference:
// pills, rings, cubes, split squares, quatrefoils). Each tool gets one
// primitive and one gradient so they read as a set at 24px and at 96px.
// Pure SVG, no raster, tinted by gradients only — the colour is the icon.
import { useId } from "react";

type IconProps = { size?: number; className?: string; style?: React.CSSProperties };

const G = {
  lava: ["#FF2D00", "#FF3FA4", "#6A4CFF"],
  vapor: ["#C875B5", "#6A4CFF", "#1C68FB"],
  ocean: ["#1C68FB", "#3CF2F2", "#7CFF8A"],
  sun: ["#FFC63C", "#FF5A2D", "#FF2D7A"],
  mint: ["#3CF2F2", "#8A7CFF", "#FF3FA4"],
};

function Grad({ id, stops, angle = 35 }: { id: string; stops: string[]; angle?: number }) {
  const r = (angle * Math.PI) / 180;
  const x2 = 50 + Math.cos(r) * 50;
  const y2 = 50 + Math.sin(r) * 50;
  const x1 = 50 - Math.cos(r) * 50;
  const y1 = 50 - Math.sin(r) * 50;
  return (
    <linearGradient id={id} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}>
      {stops.map((c, i) => (
        <stop key={i} offset={`${(i / (stops.length - 1)) * 100}%`} stopColor={c} />
      ))}
    </linearGradient>
  );
}

function Svg({ size = 24, children, className, style, defs }: IconProps & { children: React.ReactNode; defs: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style} aria-hidden>
      <defs>{defs}</defs>
      {children}
    </svg>
  );
}

// SEO Studio: three text pills, the middle one shorter — a headline, a description.
export function IconSeo(p: IconProps) {
  const id = useId();
  return (
    <Svg {...p} defs={<><Grad id={`${id}a`} stops={G.lava} /><Grad id={`${id}b`} stops={G.vapor} angle={160} /></>}>
      <rect x="6" y="8" width="36" height="9" rx="4.5" fill={`url(#${id}a)`} />
      <rect x="6" y="20" width="24" height="9" rx="4.5" fill={`url(#${id}b)`} />
      <rect x="6" y="32" width="30" height="9" rx="4.5" fill={`url(#${id}a)`} />
    </Svg>
  );
}

// Asset Uploader: a split square — the image frame with a lifted corner.
export function IconAssets(p: IconProps) {
  const id = useId();
  return (
    <Svg {...p} defs={<><Grad id={`${id}a`} stops={G.sun} angle={45} /><Grad id={`${id}b`} stops={G.vapor} angle={225} /></>}>
      <path d="M8 8h32v32H8z" fill={`url(#${id}b)`} />
      <path d="M8 8h32L8 40z" fill={`url(#${id}a)`} />
      <path d="M26 24l8-8v16z" fill="#0C0D0E" opacity="0.9" />
    </Svg>
  );
}

// CRM Images: quatrefoil of four discs around a dark core — a gallery.
export function IconImages(p: IconProps) {
  const id = useId();
  return (
    <Svg {...p} defs={<><Grad id={`${id}a`} stops={G.lava} angle={90} /><Grad id={`${id}b`} stops={G.ocean} angle={270} /></>}>
      <circle cx="24" cy="13" r="10" fill={`url(#${id}a)`} />
      <circle cx="24" cy="35" r="10" fill={`url(#${id}b)`} />
      <circle cx="13" cy="24" r="10" fill={`url(#${id}b)`} />
      <circle cx="35" cy="24" r="10" fill={`url(#${id}a)`} />
      <circle cx="24" cy="24" r="4.5" fill="#0C0D0E" />
    </Svg>
  );
}

// UTM Studio: a stack of three rings — links, tagged.
export function IconUtm(p: IconProps) {
  const id = useId();
  return (
    <Svg {...p} defs={<><Grad id={`${id}a`} stops={G.mint} /><Grad id={`${id}b`} stops={G.lava} angle={200} /></>}>
      <ellipse cx="24" cy="12" rx="16" ry="6" fill={`url(#${id}a)`} />
      <ellipse cx="24" cy="12" rx="9" ry="2.6" fill="#0C0D0E" />
      <ellipse cx="24" cy="24" rx="16" ry="6" fill={`url(#${id}b)`} />
      <ellipse cx="24" cy="24" rx="9" ry="2.6" fill="#0C0D0E" />
      <ellipse cx="24" cy="36" rx="16" ry="6" fill={`url(#${id}a)`} />
      <ellipse cx="24" cy="36" rx="9" ry="2.6" fill="#0C0D0E" />
    </Svg>
  );
}

// Claude connector: a zig-zag of pills — a signal passing through.
export function IconConnector(p: IconProps) {
  const id = useId();
  return (
    <Svg {...p} defs={<><Grad id={`${id}a`} stops={G.ocean} angle={90} /><Grad id={`${id}b`} stops={G.sun} angle={90} /></>}>
      <rect x="6" y="6" width="9" height="36" rx="4.5" fill={`url(#${id}a)`} />
      <rect x="19.5" y="6" width="9" height="36" rx="4.5" fill={`url(#${id}b)`} transform="rotate(20 24 24)" />
      <rect x="33" y="6" width="9" height="36" rx="4.5" fill={`url(#${id}a)`} />
    </Svg>
  );
}

// Home / the toolbox itself: isometric cube in lava → vapor.
export function IconKtulu(p: IconProps) {
  const id = useId();
  return (
    <Svg {...p} defs={<><Grad id={`${id}a`} stops={G.lava} angle={0} /><Grad id={`${id}b`} stops={G.vapor} angle={90} /><Grad id={`${id}c`} stops={G.ocean} angle={45} /></>}>
      <path d="M24 4l17 10v20L24 44 7 34V14z" fill={`url(#${id}b)`} />
      <path d="M24 4l17 10-17 10L7 14z" fill={`url(#${id}a)`} />
      <path d="M24 24l17-10v20L24 44z" fill={`url(#${id}c)`} />
    </Svg>
  );
}

export const TOOL_ICONS: Record<string, (p: IconProps) => JSX.Element> = {
  "/seo": IconSeo,
  "/assets": IconAssets,
  "/images": IconImages,
  "https://utm-studio-two.vercel.app": IconUtm,
  "/connector": IconConnector,
};
