"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/app/components/Modal";
import type { KnowledgeEntry, KnowledgeKind } from "@/lib/teamKnowledge";

// Team knowledge editor: people, terms, rules and alt-text patterns the
// Asset Uploader (and Claude, through the connector) work from. Shared by
// everyone, saved in the app. Add / edit / delete / switch off.
// Only people and terms are editable here. The alt-text rules and sentence
// patterns are the tool's own rulebook (lib/teamKnowledge.ts) and stay out
// of the user's way.
const KINDS: { k: KnowledgeKind; label: string; hint: string }[] = [
  { k: "person", label: "People", hint: "Official names, roles, visual cues. German form where it differs." },
  { k: "term", label: "Names & terms", hint: "Team, car, partners: the exact spellings." },
];

const EMPTY: KnowledgeEntry = { id: "", kind: "person", name: "", active: true };

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[] | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [filter, setFilter] = useState<KnowledgeKind | "all">("all");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/assets/knowledge")
      .then((r) => r.json())
      .then((j) => {
        setEntries(j.entries ?? []);
        setSeeded(Boolean(j.seeded));
      });
  }, []);

  async function save(next: KnowledgeEntry[]) {
    setState("saving");
    const r = await fetch("/api/assets/knowledge", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: next }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setEntries(j.entries);
      setSeeded(false);
      setDirty(false);
      setState("saved");
      setTimeout(() => setState("idle"), 2500);
    } else setState("error");
  }

  function upsert(e: KnowledgeEntry) {
    if (!entries) return;
    const id = e.id || Math.random().toString(36).slice(2, 10);
    const next = entries.some((x) => x.id === id) ? entries.map((x) => (x.id === id ? { ...e, id } : x)) : [...entries, { ...e, id }];
    setEntries(next);
    setDirty(true);
    setEditing(null);
  }
  function remove(id: string) {
    if (!entries) return;
    setEntries(entries.filter((x) => x.id !== id));
    setDirty(true);
  }
  function toggle(id: string) {
    if (!entries) return;
    setEntries(entries.map((x) => (x.id === id ? { ...x, active: !x.active } : x)));
    setDirty(true);
  }

  const shown = useMemo(() => (entries ?? []).filter((e) => (e.kind === "person" || e.kind === "term") && (filter === "all" || e.kind === filter)), [entries, filter]);

  return (
    <div style={{ maxWidth: 960 }}>
      <section className="page-head reveal">
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Asset Uploader · shared</div>
          <h1>Team knowledge</h1>
          <p>
            Who is who and how things are spelled. Claude reads this when it names and describes photos; the checks in the batch table use it
            too. Edit here, save once, it applies for everyone.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button className="btn" onClick={() => setEditing({ ...EMPTY, kind: filter === "all" ? "person" : filter })}>
            Add entry
          </button>
          <button className="btn btn-primary" onClick={() => entries && save(entries)} disabled={!dirty || state === "saving"}>
            {state === "saving" ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </section>

      <div className="tabs reveal" style={{ marginBottom: 18 }}>
        <button className={`tab${filter === "all" ? " is-active" : ""}`} onClick={() => setFilter("all")}>
          All <span className="count">{entries?.filter((e) => e.kind === "person" || e.kind === "term").length ?? ""}</span>
        </button>
        {KINDS.map((k) => (
          <button key={k.k} className={`tab${filter === k.k ? " is-active" : ""}`} onClick={() => setFilter(k.k)}>
            {k.label} <span className="count">{entries?.filter((e) => e.kind === k.k).length ?? ""}</span>
          </button>
        ))}
      </div>

      {seeded && (
        <div className="card reveal" style={{ padding: "10px 14px", fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
          Showing the starting set: team page (audif1.com, Oct 2026) plus an analysis of the 4,000 newest media alt texts. Nothing is saved yet;
          the first Save writes it to the app.
        </div>
      )}
      {state === "saved" && (
        <div role="status" style={{ background: "#122a18", border: "1px solid #2e7d4f", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 14 }}>
          Done. Team knowledge saved.
        </div>
      )}
      {state === "error" && (
        <div role="status" style={{ background: "#2a1512", border: "1px solid #c0392b", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 14 }}>
          Couldn&apos;t save.
        </div>
      )}

      {KINDS.filter((k) => filter === "all" || k.k === filter).map((k, ki) => {
        const list = shown.filter((e) => e.kind === k.k);
        return (
          <section key={k.k} className={`reveal reveal-d${ki + 1}`} style={{ marginBottom: 28 }}>
            <div className="section-label" style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span>{k.label}</span>
              <span>{k.hint}</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {list.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>Nothing here yet.</div>}
              {list.map((e) => (
                <div key={e.id} className="card" style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, opacity: e.active ? 1 : 0.45 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      <strong style={{ fontFamily: "var(--font-heading)" }}>{e.name}</strong>
                      {e.de && e.de !== e.name && <span style={{ color: "var(--vapor-rose)", fontSize: 12 }}>DE: {e.de}</span>}
                      {e.role && <span style={{ color: "var(--muted)", fontSize: 12 }}>{e.role}</span>}
                      {e.aliases && e.aliases.length > 0 && (
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>also: {e.aliases.join(", ")}</span>
                      )}
                    </div>
                    {e.cue && <div style={{ color: "var(--muted)", fontSize: 12 }}>Cue: {e.cue}</div>}
                    {e.note && <div style={{ color: "var(--muted)", fontSize: 12 }}>{e.note}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setEditing(e)}>
                      Edit
                    </button>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => toggle(e.id)} title={e.active ? "Switch off without deleting" : "Switch on"}>
                      {e.active ? "Off" : "On"}
                    </button>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 12, color: "#e06c5b" }} onClick={() => remove(e.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {dirty && (
        <div className="card" style={{ position: "sticky", bottom: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 8, background: "var(--surface)" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Unsaved changes. They apply for everyone once saved.</span>
          <button className="btn btn-primary" onClick={() => entries && save(entries)} disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      {editing && <EntryForm entry={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}

function EntryForm({ entry, onCancel, onSave }: { entry: KnowledgeEntry; onCancel: () => void; onSave: (e: KnowledgeEntry) => void }) {
  const [e, setE] = useState<KnowledgeEntry>(entry);
  const [aliases, setAliases] = useState((entry.aliases ?? []).join(", "));
  const field = (label: string, key: keyof KnowledgeEntry, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
      {label}
      <input className="input" value={(e[key] as string) ?? ""} onChange={(ev) => setE({ ...e, [key]: ev.target.value })} {...props} />
    </label>
  );
  return (
    <Modal title={entry.id ? "Edit entry" : "New entry"} onClose={onCancel} width={560}>
      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          Kind
          <select className="input" value={e.kind} onChange={(ev) => setE({ ...e, kind: ev.target.value as KnowledgeKind })}>
            {KINDS.map((k) => (
              <option key={k.k} value={k.k}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {field(e.kind === "person" ? "Name (English form)" : e.kind === "pattern" ? "Pattern" : "Name / rule", "name", { autoFocus: true })}
        {(e.kind === "person" || e.kind === "term") && field("German form (if different)", "de")}
        {e.kind === "person" && field("Role", "role")}
        {(e.kind === "person" || e.kind === "term") && (
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
            Also known as (comma separated)
            <input className="input" value={aliases} onChange={(ev) => setAliases(ev.target.value)} />
          </label>
        )}
        {e.kind === "person" && field("Visual cue (how to recognise them)", "cue")}
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          Note (shown to Claude)
          <textarea className="input" rows={3} value={e.note ?? ""} onChange={(ev) => setE({ ...e, note: ev.target.value })} />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!e.name.trim()}
            onClick={() => onSave({ ...e, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean) })}
          >
            {entry.id ? "Apply" : "Add"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
