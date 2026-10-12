"use client";

import { useState } from "react";
import HomeTile from "./HomeTile";

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
    <HomeTile title="Suggestion box" tileKey="/suggest" status={{ label: "→ admin board", bg: "transparent", fg: "var(--muted)", border: "transparent" }}>
      <div style={{ display: "grid", gap: 8, marginTop: "auto", paddingTop: 14 }} onClick={(e) => e.stopPropagation()}>
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
    </HomeTile>
  );
}
