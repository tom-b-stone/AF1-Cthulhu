"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Steps from "@/app/components/Steps";
import FolderPicker from "@/app/components/FolderPicker";
import { batchStore, newId, type AssetRow, type Batch } from "@/lib/batchStore";
import { canEncodeWebp, compressImage, fmtBytes, thumbnail, EDGE_PRESETS, type EdgePreset } from "@/lib/imageCompress";
import { SESSIONS, canonicalLoc, contextFromName, parseCameraName, proposeFileName } from "@/lib/assetNaming";

// Steps 1 + 2 of the uploader journey.
// 1 Images: drop photos, compression starts right away in the background.
// 2 Grand Prix & folder: pick the round from the CMS race calendar (pre-
//   selected from the camera names), the session, and the CMS folder
//   (existing round/session folder, or create the proposed one).
// Then the batch opens on steps 3 (alt text) and 4 (upload).
type Race = { round: number; label: string; country: string; city: string; start?: string; end?: string; loc: string; year: number; folderId?: string; folderPath?: string; sessions: { id: string; name: string; folderPath: string }[] };

type Prepared = { file: File; row: AssetRow; blob: Blob; thumb: string };

export default function NewBatchPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [prepared, setPrepared] = useState<Record<string, Prepared>>({});
  const [edge, setEdge] = useState<EdgePreset>(2560);
  const [webp, setWebp] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);

  // step 2 state
  const [races, setRaces] = useState<Race[] | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [session, setSession] = useState<string>("");
  const [folder, setFolder] = useState<{ id: string; path: string } | null>(null);
  const [pickFolder, setPickFolder] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    canEncodeWebp().then(setWebp);
    fetch("/api/assets/races")
      .then((r) => r.json())
      .then((j) => setRaces(j.races ?? []))
      .catch(() => setRaces([]));
  }, []);

  const parsed = useMemo(() => files.slice(0, 50).map((f) => parseCameraName(f.name)), [files]);
  // pre-select the round from the camera names (R14_…), else from the photo dates
  useEffect(() => {
    if (!races || round != null || files.length === 0) return;
    const fromName = parsed.find((p) => p.round != null)?.round;
    if (fromName != null) {
      setRound(fromName);
      return;
    }
    const date = parsed.find((p) => p.date)?.date;
    if (date) {
      const r = races.find((x) => x.start && x.end && date >= x.start.slice(0, 10) && date <= x.end.slice(0, 10));
      if (r) setRound(r.round);
    }
  }, [races, parsed, files.length, round]);

  const race = races?.find((r) => r.round === round) ?? null;

  // folder proposal: existing session folder → existing round folder → to be created
  const proposedPath = useMemo(() => {
    if (!race) return "";
    const base = race.folderPath ?? `10_Media-Galleries/${race.year}_R${String(race.round).padStart(2, "0")}_${race.loc}-GP`;
    return session ? `${base}/${session}` : base;
  }, [race, session]);
  useEffect(() => {
    if (!race) return;
    const existing = session ? race.sessions.find((s) => s.name.toLowerCase() === session.toLowerCase()) : race.folderId ? { id: race.folderId, folderPath: race.folderPath! } : null;
    setFolder(existing ? { id: existing.id, path: existing.folderPath } : null);
  }, [race, session]);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const imgs = Array.from(list).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|tiff?)$/i.test(f.name));
      setFiles((prev) => {
        const seen = new Set(prev.map((f) => f.name + f.size));
        const fresh = imgs.filter((f) => !seen.has(f.name + f.size));
        // compress in the background as they arrive
        fresh.forEach(async (f) => {
          try {
            const c = await compressImage(f, edge);
            const p = parseCameraName(f.name);
            const row: AssetRow = {
              id: newId(),
              originalName: f.name,
              originalBytes: f.size,
              bytes: c.blob.size,
              width: c.width,
              height: c.height,
              srcWidth: c.srcWidth,
              srcHeight: c.srcHeight,
              mime: c.mime,
              round: p.round,
              test: p.test,
              loc: canonicalLoc(p.loc),
              date: p.date,
              context: contextFromName(f.name),
              descriptor: "",
              alt: "",
              fileName: "",
              status: "ready",
            };
            const thumb = await thumbnail(c.blob, 96);
            setPrepared((m) => ({ ...m, [f.name + f.size]: { file: f, row, blob: c.blob, thumb } }));
          } catch (e) {
            setError(`${f.name}: ${e instanceof Error ? e.message : "could not read"}`);
          }
        });
        return [...prev, ...fresh];
      });
    },
    [edge]
  );

  const readyCount = Object.keys(prepared).length;
  const allReady = files.length > 0 && readyCount === files.length;

  async function createFolderNow() {
    if (!race) return;
    setCreating("Creating…");
    // round folder first if missing, then the session folder inside
    let parentId = race.folderId ?? null;
    let parentPath = race.folderPath ?? "";
    try {
      if (!parentId) {
        const galleries = await fetch("/api/assets/folders").then((r) => r.json());
        let root = (galleries.folders ?? []).find((f: { path: string }) => f.path === "10_Media-Galleries");
        if (!root) {
          // staging may not have the galleries root yet: create it, same name as production
          const made = await fetch("/api/assets/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "10_Media-Galleries", parent: null }) }).then((x) => x.json());
          if (!made.folder) throw new Error(made.error ?? "could not create 10_Media-Galleries");
          root = made.folder;
        }
        const name = `${race.year}_R${String(race.round).padStart(2, "0")}_${race.loc}-GP`;
        const r = await fetch("/api/assets/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parent: root?.id ?? null }) }).then((x) => x.json());
        if (!r.folder) throw new Error(r.error ?? "could not create the round folder");
        parentId = r.folder.id;
        parentPath = `10_Media-Galleries/${name}`;
      }
      if (session) {
        const r = await fetch("/api/assets/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: session, parent: parentId }) }).then((x) => x.json());
        if (!r.folder) throw new Error(r.error ?? "could not create the session folder");
        setFolder({ id: r.folder.id, path: `${parentPath}/${session}` });
      } else setFolder({ id: parentId!, path: parentPath });
    } catch (e) {
      setError(e instanceof Error ? e.message : "folder creation failed");
    }
    setCreating(null);
  }

  async function createBatch() {
    if (!race || !folder || !allReady) return;
    const batchId = newId();
    const rows: AssetRow[] = [];
    let i = 0;
    for (const f of files) {
      const p = prepared[f.name + f.size];
      if (!p) continue;
      i++;
      const row = { ...p.row, fileName: proposeFileName({ year: race.year, loc: race.loc, context: p.row.context as "" | "hero", nn: i, ext: p.row.mime === "image/webp" ? "webp" : "jpg" }) };
      rows.push(row);
      await batchStore.putBlob(batchId, row.id, p.blob);
      await batchStore.putThumb(batchId, row.id, p.thumb);
    }
    const batch: Batch = {
      id: batchId,
      createdAt: new Date().toISOString(),
      label: `${folder.path} · ${rows.length} images`,
      year: race.year,
      loc: race.loc,
      round: race.round,
      race: `${race.country} ${race.city}`,
      session,
      folderPath: folder.path.replace(/^10_Media-Galleries\//, ""),
      targetFolderId: folder.id,
      targetFolderPath: folder.path,
      edge,
      rows,
    };
    await batchStore.put(batch);
    router.push(`/assets/batch/${batchId}`);
  }

  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const compressedBytes = Object.values(prepared).reduce((n, p) => n + p.blob.size, 0);

  return (
    <div style={{ maxWidth: 980 }}>
      <section className="page-head reveal">
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Asset Uploader · staging</div>
          <h1>New batch</h1>
          <p>Photos in, named and described photos in the right CMS folder out. Four steps; nothing reaches the CMS before step 4.</p>
        </div>
      </section>

      <Steps current={step} done={step > 1 ? [1] : []} />

      {step === 1 && (
        <section className="reveal">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className="card"
            style={{ padding: "40px 24px", textAlign: "center", cursor: "pointer", borderStyle: "dashed", borderColor: dragging ? "var(--accent)" : "var(--border-2)", background: dragging ? "rgba(255,45,0,0.06)" : "var(--bg-2)" }}
          >
            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700 }}>Drop photos here</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>or click to choose · JPG, PNG, WebP, HEIC · a whole race weekend is fine · compression starts immediately</div>
          </div>

          {webp === false && <div style={{ marginTop: 10, fontSize: 12, color: "#e9c46a" }}>This browser can&apos;t encode WebP (Safari); images will be JPEG. Chrome or Firefox for WebP.</div>}
          {error && <div style={{ marginTop: 10, fontSize: 12, color: "#e06c5b" }}>{error}</div>}

          {files.length > 0 && (
            <div className="card" style={{ marginTop: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{files.length}</strong> photos · {fmtBytes(totalBytes)} → {readyCount === files.length ? fmtBytes(compressedBytes) : `compressing ${readyCount}/${files.length}…`}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
                  Longest edge
                  <select className="input" value={edge} onChange={(e) => setEdge(Number(e.target.value) as EdgePreset)} style={{ padding: "5px 8px" }}>
                    {EDGE_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {p === 0 ? "original" : `${p} px`}
                      </option>
                    ))}
                  </select>
                  <button className="btn" onClick={() => { setFiles([]); setPrepared({}); }} style={{ padding: "5px 10px", fontSize: 12 }}>
                    Clear
                  </button>
                </div>
              </div>
              <div style={{ height: 4, background: "var(--border)", borderRadius: 2, marginTop: 10 }}>
                <div style={{ height: 4, width: `${Math.round((readyCount / files.length) * 100)}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.2s" }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                {files.slice(0, 40).map((f) => {
                  const p = prepared[f.name + f.size];
                  return p ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={f.name} src={p.thumb} alt="" title={f.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                  ) : (
                    <span key={f.name} style={{ width: 48, height: 48, borderRadius: 6, background: "var(--surface)" }} />
                  );
                })}
                {files.length > 40 && <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>+{files.length - 40}</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!allReady}>
                  {allReady ? "Next: Grand Prix & folder" : "Compressing…"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="reveal" style={{ display: "grid", gap: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>Grand Prix</div>
            {!races && <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading the race calendar from the CMS…</div>}
            {races && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 6 }}>
                {races.map((r) => {
                  const active = round === r.round;
                  return (
                    <button
                      key={r.round}
                      onClick={() => setRound(r.round)}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                        background: active ? "rgba(255,45,0,0.1)" : "transparent",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}>
                        R{String(r.round).padStart(2, "0")} {r.country}
                      </div>
                      <div style={{ color: "var(--muted)" }}>
                        {r.city} · {r.start ? r.start.slice(0, 10) : ""} · {r.loc}
                        {r.folderPath ? " · folder exists" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {parsed[0]?.round != null && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Pre-selected from the camera names ({files[0]?.name}).</div>}
          </div>

          {race && (
            <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
              <div className="section-label">Session & folder</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className={`tab${session === "" ? " is-active" : ""}`} onClick={() => setSession("")} style={{ border: "1px solid var(--border)" }}>
                  Round folder only
                </button>
                {Array.from(new Set([...race.sessions.map((s) => s.name), ...SESSIONS])).map((s) => (
                  <button key={s} className={`tab${session === s ? " is-active" : ""}`} onClick={() => setSession(s)} style={{ border: "1px solid var(--border)" }}>
                    {s}
                    {race.sessions.some((x) => x.name === s) ? " ·" : ""}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
                <code style={{ fontSize: 13 }}>{folder ? folder.path : proposedPath}</code>
                {folder ? (
                  <span style={{ color: "#6fcf7c", fontSize: 12 }}>exists in the CMS</span>
                ) : (
                  <button className="btn" onClick={createFolderNow} disabled={Boolean(creating)} style={{ padding: "5px 12px", fontSize: 12 }}>
                    {creating ?? "Create this folder"}
                  </button>
                )}
                <button className="btn" onClick={() => setPickFolder(true)} style={{ padding: "5px 12px", fontSize: 12 }}>
                  Choose another folder
                </button>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Files will be named <code>audif1_{race.year}_{race.loc}_GP_&lt;descriptor&gt;_&lt;nn&gt;.webp</code> (plus a slot like <code>hero</code> only when the original name carries one); the number continues from what is already in the folder.
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button className="btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={createBatch} disabled={!race || !folder || !allReady}>
              Next: Alt text
            </button>
          </div>
        </section>
      )}

      {pickFolder && (
        <FolderPicker
          initialPath={proposedPath.replace(/^10_Media-Galleries\//, "")}
          onClose={() => setPickFolder(false)}
          onPick={(f: { id: string; path: string }) => {
            setFolder(f);
            setPickFolder(false);
          }}
        />
      )}
    </div>
  );
}
