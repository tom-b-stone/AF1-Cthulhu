"use client";

import { useEffect, useState } from "react";
import type { Suggestion } from "@/app/api/suggestions/route";

const TOOL_OPTIONS = ["general", "SEO Studio", "Asset Uploader", "CRM Images", "UTM Studio", "Claude connector", "Home / shell"];

export default function SuggestPage() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [tool, setTool] = useState("general");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Suggestion[]>([]);

  const load = () =>
    fetch("/api/suggestions")
      .then((r) => r.json())
      .then((j) => setMine(j.suggestions ?? []))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function send() {
    setState("sending");
    setError(null);
    const res = await fetch("/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, text, tool }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error ?? "Couldn't send");
      setState("error");
      return;
    }
    setTitle("");
    setText("");
    setState("sent");
    load();
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Suggestion box</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
        A feature, a bug, a tool that should exist. Goes straight to the admin message board; Tom reads it there.
      </p>
      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          Tool
          <select className="input" value={tool} onChange={(e) => setTool(e.target.value)}>
            {TOOL_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          Title
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="One line" maxLength={140} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          What and why
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="What should it do, what does it fix, how often does it come up?" />
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-primary" onClick={send} disabled={state === "sending" || !title.trim() || !text.trim()}>
            {state === "sending" ? "Sending…" : "Send to the board"}
          </button>
          {state === "sent" && <span style={{ color: "#6fcf7c", fontSize: 13 }}>Done. Sent to the admin message board.</span>}
          {error && <span style={{ color: "#e06c5b", fontSize: 13 }}>{error}</span>}
        </div>
      </div>

      {mine.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, marginTop: 28 }}>Your suggestions</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {mine.map((s) => (
              <div key={s.id} className="card" style={{ padding: "10px 14px", fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong>{s.title}</strong>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>
                    {s.tool} · {new Date(s.createdAt).toLocaleDateString("en-GB")} · {s.status}
                  </span>
                </div>
                <div style={{ color: "var(--muted)", marginTop: 4, whiteSpace: "pre-wrap" }}>{s.text}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
