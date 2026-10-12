"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { batchStore, newId, type AssetRow, type Batch } from "@/lib/batchStore";
import { canEncodeWebp, compressImage, fmtBytes, thumbnail, EDGE_PRESETS, type EdgePreset } from "@/lib/imageCompress";
import { CONTEXTS, SESSIONS, canonicalLoc, parseCameraName, proposeFileName, proposeFolder, type Context } from "@/lib/assetNaming";

// New batch: drop photos → compress in the browser → batch saved locally →
// batch page (naming, alt text, upload). Nothing leaves the browser on this
// page; the camera names are parsed so the folder and names are pre-filled.
export default function NewBatchPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [edge, setEdge] = useState<EdgePreset>(2560);
  const [context, setContext] = useState<Context>("gallery");
  const [session, setSession] = useState<string>("");
  const [webp, setWebp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    canEncodeWebp().then(setWebp);
  }, []);

  const parsed = useMemo(() => files.slice(0, 50).map((f) => parseCameraName(f.name)), [files]);
  const guess = useMemo(() => {
    const first = parsed.find((p) => p.loc) ?? parsed[0];
    const year = first?.date ? Number(first.date.slice(0, 4)) : new Date().getFullYear();
    const loc = canonicalLoc(first?.loc) ?? "";
    return { year, loc, round: first?.round, test: first?.test };
  }, [parsed]);
  const [year, setYear] = useState<number>(0);
  const [loc, setLoc] = useState("");
  const [round, setRound] = useState<string>("");
  useEffect(() => {
    if (files.length === 0) return;
    setYear(guess.year);
    setLoc(guess.loc);
    setRound(guess.round != null ? String(guess.round) : "");
  }, [guess, files.length]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const imgs = Array.from(list).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|tiff?)$/i.test(f.name));
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...imgs.filter((f) => !seen.has(f.name + f.size))];
    });
  }, []);

  async function start() {
    if (files.length === 0) return;
    setError(null);
    const batchId = newId();
    const folderPath = proposeFolder({ year, round: round ? Number(round) : undefined, test: guess.test, loc: loc || "XXX", session: session || undefined });
    const rows: AssetRow[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setBusy({ done: i, total: files.length, name: f.name });
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
          context,
          descriptor: "",
          alt: "",
          fileName: proposeFileName({ year, loc: loc || "XXX", context, nn: i + 1, ext: c.mime === "image/webp" ? "webp" : "jpg" }),
          status: "ready",
        };
        rows.push(row);
        await batchStore.putBlob(batchId, row.id, c.blob);
        await batchStore.putThumb(batchId, row.id, await thumbnail(c.blob));
      }
      const batch: Batch = {
        id: batchId,
        createdAt: new Date().toISOString(),
        label: `${folderPath} · ${rows.length} images`,
        year,
        loc: loc || "XXX",
        round: round ? Number(round) : undefined,
        test: guess.test,
        session,
        folderPath,
        edge,
        rows,
      };
      await batchStore.put(batch);
      router.push(`/assets/batch/${batchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compression failed");
      setBusy(null);
    }
  }

  const totalBytes = files.reduce((n, f) => n + f.size, 0);

  return (
    <div style={{ maxWidth: 960 }}>
      <h1>Asset Uploader</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        Drop photos. They are compressed here in the browser (WebP, {edge || "original"} px longest edge), named after the CMS
        convention, and collected in a batch. Alt text, folder and upload happen on the batch page.
      </p>

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
        style={{
          padding: "44px 24px",
          textAlign: "center",
          cursor: "pointer",
          borderStyle: "dashed",
          borderColor: dragging ? "var(--accent)" : "var(--border-2)",
          background: dragging ? "rgba(255,45,0,0.06)" : "var(--bg-2)",
        }}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>Drop photos here</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>or click to choose · JPG, PNG, WebP, HEIC · a whole race weekend is fine</div>
        {files.length > 0 && (
          <div style={{ marginTop: 14, fontSize: 13 }}>
            <strong>{files.length}</strong> files · {fmtBytes(totalBytes)}
          </div>
        )}
      </div>

      {webp === false && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#e9c46a" }}>
          This browser can&apos;t encode WebP (Safari). Images will be JPEG; use Chrome or Firefox for WebP.
        </div>
      )}

      {files.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 16, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Field label="Year">
              <input className="input" type="number" value={year || ""} onChange={(e) => setYear(Number(e.target.value))} />
            </Field>
            <Field label="Round">
              <input className="input" value={round} onChange={(e) => setRound(e.target.value.replace(/\D/g, ""))} placeholder="14" />
            </Field>
            <Field label="Location (ISO3)">
              <input className="input" value={loc} onChange={(e) => setLoc(e.target.value.toUpperCase())} placeholder="ESP" />
            </Field>
            <Field label="Session">
              <select className="input" value={session} onChange={(e) => setSession(e.target.value)}>
                <option value="">— none —</option>
                {SESSIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Context">
              <select className="input" value={context} onChange={(e) => setContext(e.target.value as Context)}>
                {CONTEXTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Longest edge">
              <select className="input" value={edge} onChange={(e) => setEdge(Number(e.target.value) as EdgePreset)}>
                {EDGE_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p === 0 ? "original" : `${p} px`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Folder: <code>10_Media-Galleries/{proposeFolder({ year, round: round ? Number(round) : undefined, test: guess.test, loc: loc || "XXX", session: session || undefined })}</code>
            {" · "}Names: <code>{proposeFileName({ year, loc: loc || "XXX", context, nn: 1 })}</code> …
            {parsed[0] && (
              <>
                {" · "}Read from <code>{files[0].name}</code>: {parsed[0].round != null ? `round ${parsed[0].round}` : parsed[0].test != null ? `test ${parsed[0].test}` : "no round"}
                {parsed[0].loc ? `, ${parsed[0].loc}` : ""}
                {parsed[0].date ? `, ${parsed[0].date}` : ""}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-primary" onClick={start} disabled={Boolean(busy) || !loc}>
              {busy ? `Compressing ${busy.done + 1} of ${busy.total}…` : `Compress ${files.length} and create batch`}
            </button>
            <button className="btn" onClick={() => setFiles([])} disabled={Boolean(busy)}>
              Clear
            </button>
            {!loc && <span style={{ fontSize: 12, color: "var(--muted)" }}>Set the location code first.</span>}
          </div>
          {busy && (
            <div style={{ height: 4, background: "var(--border)", borderRadius: 2 }}>
              <div style={{ height: 4, width: `${Math.round(((busy.done + 1) / busy.total) * 100)}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.2s" }} />
            </div>
          )}
          {error && <div style={{ color: "#e06c5b", fontSize: 13 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
      {label}
      {children}
    </label>
  );
}
