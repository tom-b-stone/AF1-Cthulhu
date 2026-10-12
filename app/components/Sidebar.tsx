"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { currentTool } from "./ToolHeader";

// In-tool navigation. Switching between tools happens in the header's Tools
// menu; this column only knows about the tool you're in: its views, its
// settings, its help. Each tool registers its entries here.
type Entry = { href: string; label: string; note?: string; exact?: boolean };
type Section = { title: string; entries: Entry[] };

const SIDEBARS: Record<string, Section[]> = {
  "/seo": [
    {
      title: "SEO Studio",
      entries: [
        { href: "/seo", label: "Table", note: "news + pages", exact: true },
        { href: "/seo?missing=1", label: "Missing SEO", note: "filter" },
      ],
    },
    {
      title: "Generate",
      entries: [
        { href: "/api/seo/handoff?missing=1", label: "Generate missing", note: "claude.ai" },
        { href: "/connector", label: "Claude connector", note: "setup" },
      ],
    },
    {
      title: "Help",
      entries: [
        { href: "https://staging.audif1team.com/cms/admin/collections/news", label: "CMS: News", note: "↗" },
        { href: "https://staging.audif1team.com/cms/admin/collections/pages", label: "CMS: Pages", note: "↗" },
      ],
    },
  ],
  "/assets": [
    {
      title: "Asset Uploader",
      entries: [
        { href: "/assets", label: "New batch", exact: true },
        { href: "/assets/batches", label: "Batches", note: "7 days" },
        { href: "/assets/rules", label: "Naming + alt rules" },
        { href: "/assets/knowledge", label: "Team knowledge", note: "people, cues" },
      ],
    },
    {
      title: "Help",
      entries: [{ href: "https://staging.audif1team.com/cms/admin/collections/media/payload-folders", label: "CMS: Media folders", note: "↗" }],
    },
  ],
  "/images": [{ title: "CRM Images", entries: [{ href: "/images", label: "Overview", exact: true }] }],
  "/connector": [{ title: "Claude connector", entries: [{ href: "/connector", label: "Setup", exact: true }] }],
  "/admin": [{ title: "Admin", entries: [{ href: "/admin/credentials", label: "CMS credentials" }] }],
};

export default function Sidebar() {
  const pathname = usePathname() ?? "/";
  const { data: session } = useSession();
  if (pathname === "/login" || pathname === "/" || !session) return null;

  const tool = currentTool(pathname);
  const sections = (tool && SIDEBARS[tool.href]) ?? [];
  if (sections.length === 0) return null;

  return (
    <nav
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        padding: "22px 14px",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      {sections.map((sec) => (
        <div key={sec.title}>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
              padding: "0 10px",
              marginBottom: 6,
            }}
          >
            {sec.title}
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 2 }}>
            {sec.entries.map((e) => {
              const external = e.href.startsWith("http") || e.href.startsWith("/api/");
              const active = e.exact ? pathname === e.href : !external && pathname.startsWith(e.href.split("?")[0]) && e.href.split("?")[0] !== tool?.href;
              const style = {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "7px 10px",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 13,
                color: active ? "#fff" : "var(--fg)",
                background: active ? "var(--surface)" : "transparent",
                border: `1px solid ${active ? "var(--border-2)" : "transparent"}`,
              } as const;
              const inner = (
                <>
                  <span>{e.label}</span>
                  {e.note && <span style={{ color: "var(--muted)", fontSize: 11 }}>{e.note}</span>}
                </>
              );
              return (
                <li key={e.href + e.label}>
                  {external ? (
                    <a href={e.href} target="_blank" rel="noreferrer" style={style}>
                      {inner}
                    </a>
                  ) : (
                    <Link href={e.href} style={style}>
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div style={{ marginTop: "auto", fontSize: 11, color: "var(--muted)", padding: "0 10px" }}>
        env: {process.env.NEXT_PUBLIC_APP_ENV ?? "staging"}
      </div>
    </nav>
  );
}
