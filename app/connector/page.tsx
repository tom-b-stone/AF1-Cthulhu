"use client";

import { useEffect, useState } from "react";

type Status = { active: boolean; createdAt: string | null; persistent: boolean };

// Setup page for the "AF1 Tools" Claude connector. Mints a personal URL the
// user pastes into claude.ai once; after that Claude can publish SEO (and,
// later, use the other tools) by itself instead of handing back a link.
export default function ConnectorPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = () =>
    fetch("/api/connector")
      .then((r) => r.json())
      .then(setStatus);

  useEffect(() => {
    refresh();
  }, []);

  async function mint() {
    if (status?.active && !confirm("You already have a connector URL. Making a new one stops the old one working. Continue?")) return;
    setBusy(true);
    const res = await fetch("/api/connector", { method: "POST" });
    const json = await res.json();
    setUrl(json.url ?? null);
    setBusy(false);
    refresh();
  }

  async function revoke() {
    if (!confirm("Stop the connector? Claude will no longer be able to publish for you until you make a new URL.")) return;
    setBusy(true);
    await fetch("/api/connector", { method: "DELETE" });
    setUrl(null);
    setBusy(false);
    refresh();
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the URL is visible to select by hand.
    }
  }

  const code = { background: "#161617", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 12, wordBreak: "break-all" as const };
  const btn = (primary: boolean) => ({
    padding: "8px 14px",
    borderRadius: 6,
    border: primary ? "none" : "1px solid var(--border)",
    background: primary ? "var(--accent)" : "none",
    color: primary ? "#fff" : "var(--fg)",
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
    fontSize: 13,
  });

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ marginBottom: 4 }}>Claude connector</h1>
      <p style={{ opacity: 0.7, fontSize: 13, marginTop: 0 }}>
        Lets your own Claude (claude.ai) use the AF1 tools directly. With it, &quot;Generate SEO title&quot; ends with
        Claude publishing the text itself — no link to click. Set it up once per person, about one minute.
      </p>

      {status && !status.persistent && (
        <div style={{ border: "1px solid #a36a00", background: "#2a1f00", color: "#ffc670", padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
          No KV store is configured — a connector URL made here will stop working on the next redeploy.
        </div>
      )}

      <h2 style={{ fontSize: 15, marginTop: 24 }}>1. Make your personal connector URL</h2>
      {status?.active && !url && (
        <p style={{ fontSize: 13, opacity: 0.7 }}>
          You have an active connector URL{status.createdAt ? ` (made ${new Date(status.createdAt).toLocaleString()})` : ""}. It is
          only shown once; if you lost it, make a new one.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={mint} disabled={busy} style={btn(true)}>
          {status?.active ? "Make a new URL" : "Make my URL"}
        </button>
        {status?.active && (
          <button onClick={revoke} disabled={busy} style={btn(false)}>
            Stop connector
          </button>
        )}
      </div>
      {url && (
        <div>
          <div style={code}>{url}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button onClick={copy} style={btn(false)}>
              {copied ? "Copied" : "Copy"}
            </button>
            <span style={{ fontSize: 12, opacity: 0.6 }}>This is personal, like a password. It is shown only now.</span>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 15, marginTop: 28 }}>2. Add it in claude.ai</h2>
      <ol style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 20 }}>
        <li>
          Open <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">claude.ai → Settings → Connectors</a>.
        </li>
        <li>
          Click <strong>Add custom connector</strong>. Name: <strong>AF1 Tools</strong>. URL: paste the one from step 1. Click Add.
        </li>
        <li>No sign-in window appears — the URL itself is your key.</li>
      </ol>

      <h2 style={{ fontSize: 15, marginTop: 28 }}>3. Use it</h2>
      <p style={{ fontSize: 13, lineHeight: 1.7 }}>
        In SEO Studio, click <strong>Generate SEO title</strong> as before. Claude opens, writes the text and publishes it itself —
        the chat says &quot;Published&quot;. If Claude asks to allow &quot;AF1 Tools&quot; the first time, allow it. People without
        the connector keep getting the Publish link instead; nothing breaks for them.
      </p>
      <p style={{ fontSize: 12, opacity: 0.6 }}>
        What Claude can do through it: list pages missing SEO, read a page&apos;s content, publish SEO text (same brand-rule
        checks as the edit drawer, publication date always preserved). Every action is logged under your email.
      </p>
    </div>
  );
}
