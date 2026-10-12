"use client";

import { useState } from "react";
import Modal from "./Modal";

// Suggestion box: a slim bar under the tools that opens a lightbox with the
// form. Posts to the admin message board (/admin/messages).
const TOOL_OPTIONS = ["general", "SEO Studio", "Asset Uploader", "CRM Images", "UTM Studio", "Home / shell"];

export default function SuggestionTile() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [tool, setTool] = useState("general");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    setState("sending");
    const res = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text, tool }),
    });
    if (res.ok) {
      setTitle("");
      setText("");
      setState("sent");
      setTimeout(() => {
        setOpen(false);
        setState("idle");
      }, 1400);
    } else setState("error");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="home-tile"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 20px",
          borderRadius: 12,
          border: "1px dashed var(--border-2)",
          background: "rgba(8,8,14,0.6)",
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--font-body)",
        }}
      >
        <span>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 15 }}>Suggestion box</span>
          <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 12 }}>A feature, a bug, a tool that should exist → admin board</span>
        </span>
        <span className="btn" style={{ padding: "6px 12px", fontSize: 12 }}>
          Write one
        </span>
      </button>

      {open && (
        <Modal title="Suggestion box" onClose={() => setOpen(false)} width={520}>
          <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
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
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="One line" maxLength={140} autoFocus />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
              What and why
              <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="What should it do, what does it fix, how often does it come up?" />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
              {state === "sent" && <span style={{ color: "#6fcf7c", fontSize: 12 }}>Done. On the board.</span>}
              {state === "error" && <span style={{ color: "#e06c5b", fontSize: 12 }}>Couldn&apos;t send.</span>}
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={send} disabled={state === "sending" || !title.trim() || !text.trim()}>
                {state === "sending" ? "Sending…" : "Send to the board"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
