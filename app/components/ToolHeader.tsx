"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import KtuluLogo from "./KtuluLogo";
import MorphIcon, { MORPH_PRESETS } from "./MorphIcon";

// The app header (Neuron-style sticky bar): AF1-KTULU wordmark on a strip
// of the living ASCII field, a Tools menu in the middle that switches
// between tools, environment + account on the right. Switching tools lives
// here; the sidebar is reserved for navigation inside the current tool.
export const TOOLS: { href: string; key: string; name: string; status: "working" | "staging" | "planned" | "external"; external?: boolean; text: string }[] = [
  { href: "/seo", key: "/seo", name: "SEO Studio", status: "staging", text: "Meta titles + descriptions, EN/DE" },
  { href: "/assets", key: "/assets", name: "Asset Uploader", status: "working", text: "Compress, name, alt text, upload" },
  { href: "/photobook", key: "/photobook", name: "Photobook", status: "staging", text: "GP mini book to print + fan page" },
  { href: "/images", key: "/images", name: "CRM Images", status: "planned", text: "Email template image variants" },
  { href: "https://af1-utm-studio.vercel.app/", key: "/utm", name: "UTM Studio", status: "external", external: true, text: "Campaign links (own app)" },
];

export const STATUS_STYLE: Record<string, { fg: string; border: string; bg: string }> = {
  working: { fg: "var(--accent)", border: "rgba(255,45,0,0.4)", bg: "rgba(255,45,0,0.12)" },
  staging: { fg: "var(--vapor-pink)", border: "rgba(200,117,181,0.4)", bg: "rgba(200,117,181,0.12)" },
  planned: { fg: "var(--vapor-lilac)", border: "rgba(112,86,167,0.45)", bg: "rgba(112,86,167,0.14)" },
  external: { fg: "var(--vapor-lilac)", border: "rgba(112,86,167,0.45)", bg: "rgba(112,86,167,0.14)" },
};

export function currentTool(pathname: string) {
  if (pathname.startsWith("/admin")) return { href: "/admin", key: "/admin", name: "Admin", status: "working" as const, text: "" };
  if (pathname.startsWith("/connector")) return { href: "/connector", key: "/connector", name: "Claude connector", status: "working" as const, text: "" };
  return TOOLS.find((t) => !t.external && (pathname === t.key || pathname.startsWith(t.key + "/"))) ?? null;
}

export default function ToolHeader() {
  const pathname = usePathname() ?? "/";
  const { data: session } = useSession();
  if (pathname === "/" || pathname === "/login" || !session) return null;

  const tool = currentTool(pathname);
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

        {/* Tools: a row of rotating 3D icons. Hover extends the pill
            horizontally and reveals the name; the current tool stays open. */}
        <nav aria-label="Tools" style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 10 }}>
          {TOOLS.map((t) => {
            const active = tool?.key === t.key;
            const preset = MORPH_PRESETS[t.key] ?? {};
            const inner = (
              <>
                <MorphIcon size={30} {...preset} />
                <span className="tool-pill-label">
                  {t.name}
                  {t.external && <span style={{ opacity: 0.5, marginLeft: 4 }}>↗</span>}
                </span>
              </>
            );
            const cls = `tool-pill${active ? " is-active" : ""}`;
            return t.external ? (
              <a key={t.key} href={t.href} target="_blank" rel="noreferrer" className={cls} title={t.name}>
                {inner}
              </a>
            ) : (
              <Link key={t.key} href={t.href} className={cls} title={t.name}>
                {inner}
              </Link>
            );
          })}
        </nav>

        {/* Right: environment + account */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, fontSize: 12 }}>
          <span style={{ color: "var(--muted)", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 11 }}>
            CMS: staging.audif1team.com
          </span>
          <Link href="/connector" className="link-line" style={{ color: "var(--muted)" }}>
            Connector
          </Link>
          {isAdmin && (
            <Link href="/admin/credentials" className="link-line" style={{ color: "var(--muted)" }}>
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
