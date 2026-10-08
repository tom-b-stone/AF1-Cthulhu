import Link from "next/link";

const TOOLS = [
  { href: "/utm", label: "UTM Studio", note: "existing" },
  { href: "/seo", label: "SEO Studio", note: "new" },
  { href: "/assets", label: "Asset Uploader", note: "new" },
  { href: "/images", label: "CRM Images", note: "new" },
];

export default function Sidebar() {
  return (
    <nav
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        padding: "24px 16px",
        minHeight: "100vh",
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
      <div style={{ marginTop: 32, fontSize: 11, opacity: 0.5 }}>
        env: {process.env.NEXT_PUBLIC_APP_ENV ?? "unset"}
      </div>
      <Link
        href="/admin/credentials"
        style={{
          display: "block",
          marginTop: 12,
          fontSize: 11,
          opacity: 0.5,
          textDecoration: "none",
        }}
      >
        Admin
      </Link>
    </nav>
  );
}
