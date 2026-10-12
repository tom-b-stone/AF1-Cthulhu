"use client";

import { useState } from "react";

// The sixth tile on the home page: the suggestion box, form shown directly
// (no icon). Posts to the admin message board (/admin/messages).
export default function SuggestionTile() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    setState("sending");
    const res = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text, tool: "general" }),
    });
    if (res.ok) {
      setTitle("");
      setText("");
      setState("sent");
      setTimeout(() => setState("idle"), 6000);
    } else setState("error");
  }

  return (
    <div
      className="home-tile"
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "14px 16px",
        background: "rgba(8,8,14,0.8)",
        backdropFilter: "blur(2px)",
        display: "grid",
        gap: 8,
        alignContent: "start",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 15, fontFamily: "var(--font-heading)" }}>Suggestion box</span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>→ admin board</span>
      </div>
      <input
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="A feature, a bug, a tool that should exist"
        maxLength={140}
        style={{ padding: "7px 10px", fontSize: 13 }}
      />
      <textarea
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What and why"
        rows={2}
        style={{ padding: "7px 10px", fontSize: 13, resize: "vertical" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="btn btn-primary" onClick={send} disabled={state === "sending" || !title.trim() || !text.trim()} style={{ padding: "6px 12px", fontSize: 12 }}>
          {state === "sending" ? "Sending…" : "Send"}
        </button>
        {state === "sent" && <span style={{ color: "#6fcf7c", fontSize: 12 }}>Done. On the board.</span>}
        {state === "error" && <span style={{ color: "#e06c5b", fontSize: 12 }}>Couldn&apos;t send.</span>}
      </div>
    </div>
  );
}
