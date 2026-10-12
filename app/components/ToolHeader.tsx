"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import KtuluLogo from "./KtuluLogo";

// Slim branded header for every tool page (not home, not login): a strip
// of the living ASCII field with the AF1-KTULU wordmark, the current tool
// and the environment. The sidebar keeps navigation; this is identity.
const TOOL_NAMES: Record<string, { name: string; status: string }> = {
  "/seo": { name: "SEO Studio", status: "staging" },
  "/assets": { name: "Asset Uploader", status: "planned" },
  "/images": { name: "CRM Images", status: "planned" },
  "/utm": { name: "UTM Studio", status: "external" },
  "/connector": { name: "Claude connector", status: "working" },
  "/admin": { name: "Admin", status: "" },
};

const STATUS_STYLE: Record<string, { fg: string; border: string }> = {
  working: { fg: "var(--accent)", border: "rgba(255,45,0,0.4)" },
  staging: { fg: "var(--vapor-pink)", border: "rgba(200,117,181,0.4)" },
  planned: { fg: "var(--vapor-lilac)", border: "rgba(112,86,167,0.45)" },
  external: { fg: "var(--vapor-lilac)", border: "rgba(112,86,167,0.45)" },
};

export default function ToolHeader() {
  const pathname = usePathname() ?? "/";
  const { data: session } = useSession();
  if (pathname === "/" || pathname === "/login" || !session) return null;

  const key = Object.keys(TOOL_NAMES).find((k) => pathname === k || pathname.startsWith(k + "/"));
  const tool = key ? TOOL_NAMES[key] : null;
  const st = tool && STATUS_STYLE[tool.status];

  return (
    <div
      style={{
        position: "relative",
        height: 64,
        overflow: "hidden",
        borderBottom: "1px solid var(--border)",
        background: "#000",
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: 0.45 }}>
        <KtuluLogo source={{ src: "/bg/vapor.jpg", gamma: 1.6, gain: 1.1, fit: "cover" }} height={64} />
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, rgba(4,6,14,0.92) 0%, rgba(4,6,14,0.6) 45%, rgba(4,6,14,0.3) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 40px",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        }}
      >
        <Link href="/" style={{ textDecoration: "none", color: "#fff", display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.14em" }}>
            AF1<span style={{ color: "var(--accent)" }}>-</span>KTULU
          </span>
          <span style={{ fontSize: 12, color: "var(--vapor-rose)", letterSpacing: "0.08em" }}>^(;,;)^</span>
        </Link>
        {tool && (
          <>
            <span style={{ opacity: 0.35 }}>/</span>
            <span style={{ fontSize: 13, letterSpacing: "0.06em", opacity: 0.9 }}>{tool.name}</span>
            {st && (
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, color: st.fg, border: `1px solid ${st.border}`, letterSpacing: "0.04em" }}>
                {tool.status}
              </span>
            )}
          </>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.55, letterSpacing: "0.04em" }}>
          CMS: staging.audif1team.com
        </span>
      </div>
    </div>
  );
}
