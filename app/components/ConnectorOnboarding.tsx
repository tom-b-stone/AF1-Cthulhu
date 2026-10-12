"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Modal from "./Modal";

// First-run overlay for the Claude connector: micro-steps you tick off
// once. Shows on the home page until the last step is confirmed; "Later"
// snoozes it a week. Not a tool, not a tile: an onboarding.
// State lives per user in KV (/api/onboarding), so it follows the person.
const FLOW = "connector";
const PAGES = ["/"];

type Status = { active: boolean; persistent: boolean };

export default function ConnectorOnboarding({ force, onClose }: { force?: boolean; onClose?: () => void } = {}) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(Boolean(force));
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (force) return;
    if (!PAGES.includes(pathname)) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safe = (u: string): Promise<any> => fetch(u).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    Promise.all([safe("/api/connector"), safe("/api/onboarding")]).then(([st, ob]) => {
      if (cancelled) return;
      setStatus(st);
      const mine = ob?.[FLOW];
      if (mine?.done) return;
      if (mine?.snoozedUntil && new Date(mine.snoozedUntil) > new Date()) return;
      setOpen(true);
      if (st?.active) setStep(2);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, force]);

  async function mint() {
    setBusy(true);
    const r = await fetch("/api/connector", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (j.url) {
      setUrl(j.url);
      setStatus((s) => ({ active: true, persistent: j.persistent ?? s?.persistent ?? true }));
    }
  }
  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  async function finish(action: "done" | "snooze") {
    await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flow: FLOW, action }) });
    setOpen(false);
    onClose?.();
  }

  if (!open) return null;

  const steps = [
    {
      title: "Your Claude can publish for you",
      body: (
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          The AF1 tools can be used by your own Claude (claude.ai). With the connector, &quot;Generate&quot; ends with Claude writing <em>and</em>{" "}
          publishing, no link to click. Without it, everything still works: Claude answers with a Publish link. Setup is one minute, once.
        </p>
      ),
      cta: <button className="btn btn-primary" onClick={() => setStep(1)}>Set it up</button>,
    },
    {
      title: "1 · Make your personal URL",
      body: (
        <>
          <p style={{ margin: "0 0 12px", lineHeight: 1.7 }}>It is your key to the tools. Personal, like a password, shown once.</p>
          {!url && (
            <button className="btn btn-primary" onClick={mint} disabled={busy}>
              {busy ? "Making…" : status?.active ? "Make a new URL" : "Make my URL"}
            </button>
          )}
          {url && (
            <div className="card" style={{ padding: 10, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, wordBreak: "break-all", display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ flex: 1 }}>{url}</span>
              <button className="btn" onClick={copy} style={{ padding: "5px 10px", fontSize: 12 }}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
          {status?.active && !url && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>You already have one. If you still have it in claude.ai, skip ahead.</p>}
        </>
      ),
      cta: (
        <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!url && !status?.active}>
          Next
        </button>
      ),
    },
    {
      title: "2 · Add it in claude.ai",
      body: (
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
          <li>
            Open{" "}
            <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer" className="link-line" style={{ color: "var(--accent)" }}>
              claude.ai → Settings → Connectors
            </a>
          </li>
          <li>
            Click <strong>Add custom connector</strong>
          </li>
          <li>
            Name: <strong>AF1 Tools</strong> · URL: paste yours · <strong>Add</strong>
          </li>
          <li>No sign-in window appears. The URL is the key.</li>
        </ol>
      ),
      cta: <button className="btn btn-primary" onClick={() => setStep(3)}>Done, next</button>,
    },
    {
      title: "3 · Tick it off",
      body: (
        <div style={{ display: "grid", gap: 8 }}>
          {["I added AF1 Tools in claude.ai", "I'll choose \"Always allow\" the first time Claude asks", "I know the Generate buttons open claude.ai", "I know publishing never changes a publication date"].map((label, i) => (
            <label key={i} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={() => setChecks((c) => c.map((v, k) => (k === i ? !v : v)))}
                style={{ width: 16, height: 16, accentColor: "#ff2d00" }}
              />
              {label}
            </label>
          ))}
        </div>
      ),
      cta: (
        <button className="btn btn-primary" onClick={() => finish("done")} disabled={!checks.every(Boolean)}>
          Finish
        </button>
      ),
    },
  ];
  const s = steps[step];

  return (
    <Modal title="Claude connector" onClose={() => finish("snooze")} width={560}>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {steps.map((_, i) => (
          <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--accent)" : "var(--border-2)", transition: "background 0.3s" }} />
        ))}
      </div>
      <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>{s.title}</h3>
      <div style={{ fontSize: 13 }}>{s.body}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
        <button onClick={() => finish("snooze")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, padding: 0 }}>
          Later
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {s.cta}
        </div>
      </div>
    </Modal>
  );
}
