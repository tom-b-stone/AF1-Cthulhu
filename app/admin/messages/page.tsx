"use client";

import { useEffect, useState } from "react";
import type { Suggestion } from "@/app/api/suggestions/route";

export default function MessageBoard() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [filter, setFilter] = useState<"all" | "new" | "seen" | "done">("all");

  const load = () =>
    fetch("/api/suggestions")
      .then((r) => r.json())
      .then((j) => setItems(j.suggestions ?? []));
  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: Suggestion["status"]) {
    await fetch("/api/suggestions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    load();
  }

  const shown = (items ?? []).filter((s) => filter === "all" || s.status === filter);
  const counts = { new: 0, seen: 0, done: 0 };
  for (const s of items ?? []) counts[s.status]++;

  return (
    <div style={{ maxWidth: 860 }}>
      <h1>Message board</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
        Suggestions from the team. {counts.new} new · {counts.seen} seen · {counts.done} done.
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {(["all", "new", "seen", "done"] as const).map((f) => (
          <button key={f} className="btn" onClick={() => setFilter(f)} style={{ borderColor: filter === f ? "var(--accent)" : undefined, padding: "5px 12px" }}>
            {f}
          </button>
        ))}
      </div>
      {items === null && <p style={{ color: "var(--muted)" }}>Loading…</p>}
      {items && shown.length === 0 && <p style={{ color: "var(--muted)" }}>Nothing here.</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {shown.map((s) => (
          <div key={s.id} className="card" style={{ padding: "12px 16px", fontSize: 13, borderColor: s.status === "new" ? "rgba(255,45,0,0.45)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <strong style={{ fontSize: 14 }}>{s.title}</strong>
              <span style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                {s.from} · {s.tool} · {new Date(s.createdAt).toLocaleString("en-GB")}
              </span>
            </div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{s.text}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {(["new", "seen", "done"] as const).map((st) => (
                <button key={st} className="btn" onClick={() => setStatus(s.id, st)} style={{ padding: "3px 10px", fontSize: 12, borderColor: s.status === st ? "var(--accent)" : undefined }}>
                  {st}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
