"use client";

import { useEffect, useState } from "react";

type State = { persistent: boolean; set: boolean; last4: string | null; model: string; updatedAt: string | null };

// Anthropic API key: with it, the Asset Uploader writes alt texts and tags
// in the tool itself (no claude.ai tab). Without it, the claude.ai hand-off
// through the connector is used.
export default function AdminAnthropicPage() {
  const [state, setState] = useState<State | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = () =>
    fetch("/api/admin/anthropic")
      .then((r) => r.json())
      .then((d: State) => {
        setState(d);
        setModel(d.model);
      });
  useEffect(() => {
    refresh();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Checking the key with Anthropic…");
    const r = await fetch("/api/admin/anthropic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, model }) });
    const j = await r.json();
    if (!r.ok) return setStatus(j.error ?? "Failed");
    setKey("");
    setStatus("Saved. The Asset Uploader now generates in the tool.");
    await refresh();
  }
  async function remove() {
    await fetch("/api/admin/anthropic", { method: "DELETE" });
    setStatus("Removed. Back to the claude.ai hand-off.");
    await refresh();
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <section className="page-head reveal">
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Admin</div>
          <h1>Claude API</h1>
          <p>
            With an API key the Asset Uploader writes alt texts, people and scene tags inside the tool, with a progress bar, no claude.ai tab. The
            same rulebook, reference photos and corrections apply. Stored encrypted; never shown back. Roughly a cent per photo.
          </p>
        </div>
      </section>
      {state?.set && (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Key ending in <strong>…{state.last4}</strong>, model <code>{state.model}</code>
          {state.updatedAt ? `, set ${new Date(state.updatedAt).toLocaleString("en-GB")}` : ""}.{" "}
          <button onClick={remove} style={{ background: "none", border: "none", color: "#e06c5b", cursor: "pointer", fontSize: 13, padding: 0 }}>
            Remove
          </button>
        </p>
      )}
      <form onSubmit={save} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          API key (console.anthropic.com → API keys)
          <input className="input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={state?.set ? "leave empty to keep the current key" : "sk-ant-…"} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          Model
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-4-5" />
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="submit" className="btn btn-primary" disabled={!key && !state?.set}>
            Save
          </button>
          {status && <span style={{ fontSize: 12, color: "var(--muted)" }}>{status}</span>}
        </div>
      </form>
    </div>
  );
}
