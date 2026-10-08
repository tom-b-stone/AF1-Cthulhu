"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const TOOLS = [
  { href: "/utm", label: "UTM Studio", note: "existing" },
  { href: "/seo", label: "SEO Studio", note: "new" },
  { href: "/assets", label: "Asset Uploader", note: "new" },
  { href: "/images", label: "CRM Images", note: "new" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname === "/login" || !session) return null;

  const isAdmin = (session.user as { role?: string } | undefined)?.role === "admin";

  return (
    <nav
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        padding: "24px 16px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 24 }}>AF1 Tools</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              <span>{tool.label}</span>
              <span style={{ opacity: 0.4, fontSize: 11 }}>{tool.note}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "auto", paddingTop: 24, fontSize: 11, opacity: 0.6 }}>
        <div style={{ marginBottom: 6 }}>{session.user?.email}</div>
        {isAdmin && (
          <Link href="/admin/credentials" style={{ display: "block", marginBottom: 6, textDecoration: "none" }}>
            Admin
          </Link>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            opacity: 0.7,
            cursor: "pointer",
            padding: 0,
            fontSize: 11,
          }}
        >
          Sign out
        </button>
        <div style={{ marginTop: 10, opacity: 0.5 }}>
          env: {process.env.NEXT_PUBLIC_APP_ENV ?? "unset"}
        </div>
      </div>
    </nav>
  );
}
