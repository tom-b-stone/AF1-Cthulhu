"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";

// CMS media folder picker (staging). Reads the real folder tree, lets you
// search it, pick a folder, or create a new one under a parent. The batch's
// proposed path (from the camera names) is pre-filled in the search so the
// right round folder is one click away.
export type PickedFolder = { id: string; path: string };
type Folder = { id: string; name: string; parent: string | null; path: string };

export default function FolderPicker({ initialPath, onPick, onClose }: { initialPath?: string; onPick: (f: PickedFolder) => void; onClose: () => void }) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(() => (initialPath ?? "").split("/").slice(-1)[0]?.replace(/^\d{4}_/, "") ?? "");
  const [selected, setSelected] = useState<Folder | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(() => (initialPath ?? "").split("/").slice(-1)[0] ?? "");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/assets/folders")
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setFolders(j.folders)))
      .catch((e) => setError(String(e)));
  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    if (!folders) return [];
    const needle = q.trim().toLowerCase();
    const list = needle ? folders.filter((f) => f.path.toLowerCase().includes(needle)) : folders;
    // galleries first, then the rest
    return [...list].sort((a, b) => Number(b.path.startsWith("10_Media-Galleries")) - Number(a.path.startsWith("10_Media-Galleries")) || a.path.localeCompare(b.path)).slice(0, 200);
  }, [folders, q]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const r = await fetch("/api/assets/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parent: selected?.id ?? null }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(j.error ?? "Couldn't create the folder");
      return;
    }
    const path = selected ? `${selected.path}/${name}` : name;
    onPick({ id: j.folder.id, path });
  }

  return (
    <Modal title="CMS folder (staging)" onClose={onClose} width={640}>
      <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search folders… e.g. R14 or ESP" autoFocus />
        {error && <div style={{ color: "#e06c5b", fontSize: 12 }}>{error}</div>}
        {!folders && !error && <div style={{ color: "var(--muted)", fontSize: 12 }}>Loading folders from the CMS…</div>}
        {folders && (
          <div className="card" style={{ maxHeight: 300, overflow: "auto", padding: 4 }}>
            {shown.length === 0 && <div style={{ padding: 10, color: "var(--muted)", fontSize: 12 }}>No folder matches. Create one below.</div>}
            {shown.map((f) => {
              const depth = f.path.split("/").length - 1;
              const active = selected?.id === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setSelected(f)}
                  onDoubleClick={() => onPick({ id: f.id, path: f.path })}
                  style={{
                    display: "flex",
                    width: "100%",
                    textAlign: "left",
                    gap: 8,
                    padding: "6px 10px",
                    paddingLeft: 10 + depth * 14,
                    borderRadius: 6,
                    border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
                    background: active ? "rgba(255,45,0,0.1)" : "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "var(--muted)" }}>{depth > 0 ? "└ " : ""}</span>
                  <span>{f.name}</span>
                  <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }}>{f.path.split("/").slice(0, -1).join("/")}</span>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{selected ? `Selected: ${selected.path}` : "Select a folder, or create one"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setCreating((c) => !c)}>
              {creating ? "Cancel new folder" : selected ? "New folder inside" : "New folder at root"}
            </button>
            <button className="btn btn-primary" disabled={!selected} onClick={() => selected && onPick({ id: selected.id, path: selected.path })}>
              Use this folder
            </button>
          </div>
        </div>
        {creating && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ fontSize: 12, color: "var(--muted)" }}>{selected ? `${selected.path}/` : "/"}</code>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="2026_R14_ESP-GP" style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={create} disabled={busy || !newName.trim()}>
              {busy ? "Creating…" : "Create + use"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
