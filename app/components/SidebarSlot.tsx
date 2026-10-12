"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Pages push their own sidebar content (actions, filters, counts) into the
// left column. The Sidebar renders this slot above the static per-tool
// links, so every function of a tool lives on the left, with live state.
type Ctx = { content: ReactNode; setContent: (n: ReactNode) => void };
const SidebarCtx = createContext<Ctx>({ content: null, setContent: () => {} });

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  return <SidebarCtx.Provider value={{ content, setContent }}>{children}</SidebarCtx.Provider>;
}

export function useSidebarSlot() {
  return useContext(SidebarCtx).content;
}

// Call from a page: the node re-renders whenever deps change; cleared on unmount.
export function useSidebarContent(node: ReactNode, deps: unknown[]) {
  const { setContent } = useContext(SidebarCtx);
  useEffect(() => {
    setContent(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => setContent(null), [setContent]);
}

// Shared building blocks for sidebar sections
export function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="section-label" style={{ padding: "0 10px", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "grid", gap: 4 }}>{children}</div>
    </div>
  );
}

export function SideButton({
  children,
  onClick,
  href,
  primary,
  disabled,
  note,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
  disabled?: boolean;
  note?: ReactNode;
  active?: boolean;
}) {
  const style: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 13,
    fontFamily: "var(--font-body)",
    color: primary ? "#fff" : "var(--fg)",
    background: primary ? "var(--accent)" : active ? "var(--surface)" : "transparent",
    border: `1px solid ${primary ? "var(--accent)" : active ? "var(--border-2)" : "transparent"}`,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
    textAlign: "left",
    transition: "background 0.15s, border-color 0.15s",
  };
  const inner = (
    <>
      <span>{children}</span>
      {note != null && <span style={{ fontSize: 11, color: primary ? "rgba(255,255,255,0.8)" : "var(--muted)" }}>{note}</span>}
    </>
  );
  if (href) {
    const ext = href.startsWith("http") || href.startsWith("/api/");
    return (
      <a href={href} target={ext ? "_blank" : undefined} rel={ext ? "noreferrer" : undefined} style={style} className="side-btn" aria-disabled={disabled}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} style={style} className="side-btn">
      {inner}
    </button>
  );
}
