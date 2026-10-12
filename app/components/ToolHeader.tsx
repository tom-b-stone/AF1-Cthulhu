"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import KtuluLogo from "./KtuluLogo";
import { TOOL_ICONS } from "./ToolIcons";

// The app header (Neuron-style sticky bar): AF1-KTULU wordmark on a strip
// of the living ASCII field, a Tools menu in the middle that switches
// between tools, environment + account on the right. Switching tools lives
// here; the sidebar is reserved for navigation inside the current tool.
export const TOOLS: { href: string; name: string; status: "working" | "staging" | "planned" | "external"; external?: boolean; text: string }[] = [
  { href: "/seo", name: "SEO Studio", status: "staging", text: "Meta titles + descriptions, EN/DE" },
  { href: "/assets", name: "Asset Uploader", status: "planned", text: "Compress, name, alt text, upload" },
  { href: "/images", name: "CRM Images", status: "planned", text: "Email template image variants" },
  { href: "https://utm-studio-two.vercel.app", name: "UTM Studio", status: "external", external: true, text: "Campaign links (own app)" },
  { href: "/connector", name: "Claude connector", status: "working", text: "Let your Claude use the tools" },
];

export const STATUS_STYLE: Record<string, { fg: string; border: string; bg: string }> = {
  working: { fg: "var(--accent)", border: "rgba(255,45,0,0.4)", bg: "rgba(255,45,0,0.12)" },
  staging: { fg: "var(--vapor-pink)", border: "rgba(200,117,181,0.4)", bg: "rgba(200,117,181,0.12)" },
  planned: { fg: "var(--vapor-lilac)", border: "rgba(112,86,167,0.45)", bg: "rgba(112,86,167,0.14)" },
  external: { fg: "var(--vapor-lilac)", border: "rgba(112,86,167,0.45)", bg: "rgba(112,86,167,0.14)" },
};

export function currentTool(pathname: string) {
  if (pathname.startsWith("/admin")) return { href: "/admin", name: "Admin", status: "working" as const, text: "" };
  return TOOLS.find((t) => !t.external && (pathname === t.href || pathname.startsWith(t.href + "/"))) ?? null;
}

export default function ToolHeader() {
  const pathname = usePathname() ?? "/";
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

  if (pathname === "/" || pathname === "/login" || !session) return null;

  const tool = currentTool(pathname);
  const st = tool && STATUS_STYLE[tool.status];
  const isAdmin = (session.user as { role?: string } | undefined)?.role === "admin";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: 64,
        overflow: "visible",
        borderBottom: "1px solid var(--border)",
        background: "#000",
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: 0.5, overflow: "hidden" }}>
        <KtuluLogo source={{ src: "/bg/vapor.jpg", gamma: 1.5, gain: 1.2, fit: "cover" }} height={64} />
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, rgba(12,13,14,0.95) 0%, rgba(12,13,14,0.7) 40%, rgba(12,13,14,0.55) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "0 32px",
        }}
      >
        {/* Wordmark */}
        <Link
          href="/"
          style={{
            textDecoration: "none",
            color: "#fff",
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.14em" }}>
            AF1<span style={{ color: "var(--accent)" }}>-</span>KTULU
          </span>
          <span style={{ fontSize: 12, color: "var(--vapor-rose)", letterSpacing: "0.08em" }}>^(;,;)^</span>
        </Link>

        {/* Tools menu (Neuron-style pill nav + blurred sub-menu) */}
        <div ref={menuRef} style={{ position: "relative", marginLeft: 8 }}>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              height: 36,
              padding: "0 14px 0 16px",
              borderRadius: 999,
              border: "1px solid var(--border-2)",
              background: open ? "var(--surface)" : "rgba(30,32,34,0.7)",
              color: "var(--fg)",
              fontFamily: "var(--font-heading)",
              fontSize: 13,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
            }}
          >
            {tool && TOOL_ICONS[tool.href] ? (() => { const I = TOOL_ICONS[tool.href]; return <I size={18} />; })() : <span style={{ opacity: 0.55 }}>Tools</span>}
            <span>{tool?.name ?? "Choose"}</span>
            {st && tool && (
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, color: st.fg, border: `1px solid ${st.border}`, background: st.bg }}>
                {tool.status}
              </span>
            )}
            <span style={{ opacity: 0.5, fontSize: 10, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
          </button>
          {open && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                left: 0,
                width: 420,
                borderRadius: 16,
                padding: 8,
                background: "rgba(23,24,25,0.9)",
                border: "1px solid var(--border-2)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                backdropFilter: "blur(14px)",
                display: "grid",
                gap: 2,
              }}
            >
              {TOOLS.map((t) => {
                const s = STATUS_STYLE[t.status];
                const active = tool?.href === t.href;
                const Icon = TOOL_ICONS[t.href];
                const inner = (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
                        {Icon && <Icon size={22} className="tool-icon" />}
                        {t.name}
                        {t.external && <span style={{ opacity: 0.5, marginLeft: 6, fontSize: 12 }}>↗</span>}
                      </span>
                      <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, color: s.fg, border: `1px solid ${s.border}`, background: s.bg }}>
                        {t.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, paddingLeft: 32 }}>{t.text}</div>
                  </>
                );
                const style = {
                  display: "block",
                  padding: "10px 12px",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "inherit",
                  background: active ? "rgba(255,45,0,0.1)" : "transparent",
                  border: `1px solid ${active ? "rgba(255,45,0,0.35)" : "transparent"}`,
                } as const;
                return t.external ? (
                  <a key={t.href} href={t.href} target="_blank" rel="noreferrer" style={style} className="menu-item">
                    {inner}
                  </a>
                ) : (
                  <Link key={t.href} href={t.href} style={style} className="menu-item">
                    {inner}
                  </Link>
                );
              })}
              <Link href="/" style={{ display: "block", padding: "8px 12px", fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
                ← Home
              </Link>
            </div>
          )}
        </div>

        {/* Right: environment + account */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, fontSize: 12 }}>
          <span style={{ color: "var(--muted)", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 11 }}>
            CMS: staging.audif1team.com
          </span>
          {isAdmin && (
            <Link href="/admin/credentials" style={{ color: "var(--muted)", textDecoration: "none" }}>
              Admin
            </Link>
          )}
          <span
            title={session.user?.email ?? ""}
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: "var(--surface)",
              border: "1px solid var(--border-2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-heading)",
              fontSize: 12,
              textTransform: "uppercase",
            }}
          >
            {(session.user?.email ?? "?").slice(0, 2)}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, fontSize: 12 }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
