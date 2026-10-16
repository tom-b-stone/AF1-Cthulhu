"use client";

// Receiver for DOM snapshots: opened from an audif1.com / staging tab with
// window.open, it takes { af1capture: { name, html, meta } } messages from its
// opener and stores them (session-authenticated) as preview templates.
import { useEffect, useState } from "react";

const ORIGINS = [/^https:\/\/(www\.)?audif1\.com$/, /^https:\/\/staging\.audif1team\.com$/];

export default function Capture() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    const on = async (e: MessageEvent) => {
      if (!ORIGINS.some((r) => r.test(e.origin))) return;
      const c = e.data?.af1capture;
      if (!c?.name || !c?.html) return;
      const r = await fetch("/api/captures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }).then((x) => x.json()).catch(() => ({ error: "failed" }));
      setLog((l) => [`${new Date().toLocaleTimeString()} ${c.name}: ${r.ok ? `${r.bytes} bytes saved` : r.error}`, ...l]);
      (e.source as Window | null)?.postMessage({ af1captured: c.name, ok: !!r.ok }, e.origin);
    };
    window.addEventListener("message", on);
    window.opener?.postMessage({ af1captureReady: true }, "*");
    return () => window.removeEventListener("message", on);
  }, []);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <h1 style={{ margin: 0 }}>Capture receiver</h1>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>Keep this tab open while states are captured on audif1.com or staging.</div>
      {log.map((l, i) => (
        <div key={i} style={{ fontSize: 13, fontFamily: "monospace" }}>{l}</div>
      ))}
    </div>
  );
}
