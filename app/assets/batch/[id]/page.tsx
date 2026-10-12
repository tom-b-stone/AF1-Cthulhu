"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import JSZip from "jszip";
import { Table, type TableColumn } from "@/components/ui/table-editable";
import { batchStore, type AssetRow, type Batch } from "@/lib/batchStore";
import { fmtBytes } from "@/lib/imageCompress";
import { ALT_MAX, CONTEXTS, cleanDescriptor, knowledgeIssues, proposeFileName, validateAlt, type Context } from "@/lib/assetNaming";
import type { KnowledgeEntry } from "@/lib/teamKnowledge";
import FolderPicker from "@/app/components/FolderPicker";
import Modal from "@/app/components/Modal";
import { SideButton, SideSection, useSidebarContent } from "@/app/components/SidebarSlot";
import Steps from "@/app/components/Steps";

type Row = AssetRow & { key: string; thumb?: string; issues: string[]; nn: number };

export default function BatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [batch, setBatch] = useState<Batch | null | undefined>(undefined);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pickFolder, setPickFolder] = useState(false);
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [dialogRow, setDialogRow] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  useEffect(() => {
    fetch("/api/assets/knowledge")
      .then((r) => r.json())
      .then((j) => setKnowledge(j.entries ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    batchStore.get(params.id).then(async (b) => {
      if (cancelled) return;
      setBatch(b ?? null);
      if (!b) return;
      const t: Record<string, string> = {};
      for (const r of b.rows) {
        const d = await batchStore.getThumb(b.id, r.id);
        if (d) t[r.id] = d;
      }
      if (!cancelled) setThumbs(t);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const save = useCallback(
    async (next: Batch) => {
      setBatch(next);
      await batchStore.put(next);
    },
    []
  );

  function updateRow(id: string, patch: Partial<AssetRow>) {
    if (!batch) return;
    const rows = batch.rows.map((r, i) => {
      if (r.id !== id) return r;
      const merged = { ...r, ...patch };
      if (patch.descriptor !== undefined || patch.context !== undefined) {
        merged.fileName = proposeFileName({
          year: batch.year,
          loc: batch.loc,
          context: merged.context as Context,
          descriptor: merged.descriptor,
          nn: i + 1,
          ext: merged.mime === "image/webp" ? "webp" : "jpg",
        });
      }
      return merged;
    });
    void save({ ...batch, rows });
  }

  const rows = useMemo<Row[]>(
    () =>
      (batch?.rows ?? []).map((r, i) => ({
        ...r,
        key: r.id,
        nn: i + 1,
        thumb: thumbs[r.id],
        issues: [...validateAlt(r.alt), ...knowledgeIssues(r.alt, knowledge), ...(r.descriptor && cleanDescriptor(r.descriptor) !== r.descriptor ? ["Descriptor was normalised"] : [])],
      })),
    [batch, thumbs, knowledge]
  );

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: "thumb",
        header: "",
        width: "64px",
        cell: (r) =>
          r.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.thumb} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, display: "block" }} />
          ) : (
            <span style={{ display: "block", width: 44, height: 44, background: "var(--surface)", borderRadius: 6 }} />
          ),
      },
      { key: "nn", header: "#", width: "44px", align: "right", cell: (r) => <span className="tabular-nums">{String(r.nn).padStart(2, "0")}</span> },
      {
        key: "originalName",
        header: "Original",
        width: "190px",
        cell: (r) => (
          <span title={`${r.originalName} · ${r.srcWidth}×${r.srcHeight} · ${fmtBytes(r.originalBytes)}`} className="block truncate" style={{ color: "var(--muted)", fontSize: 12 }}>
            {r.originalName}
          </span>
        ),
      },
      {
        key: "size",
        header: "Size",
        width: "120px",
        cell: (r) => (
          <span className="tabular-nums" style={{ fontSize: 12 }}>
            {r.width}×{r.height} · {fmtBytes(r.bytes)}
          </span>
        ),
      },
      { key: "descriptor", header: "Descriptor", width: "1fr", editable: true },
      {
        key: "fileName",
        header: "File name",
        width: "260px",
        cell: (r) => (
          <span className="block truncate" title={r.fileName} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>
            {r.fileName}
          </span>
        ),
      },
      { key: "alt", header: "Alt text (EN)", width: "1.6fr", editable: true },
      {
        key: "status",
        header: "CMS",
        width: "90px",
        cell: (r) =>
          r.status === "uploaded" ? (
            <a href={r.cmsUrl ? `https://staging.audif1team.com${r.cmsUrl}` : "#"} target="_blank" rel="noreferrer" style={{ color: "#6fcf7c", fontSize: 12 }} title={r.uploadedName}>
              uploaded ↗
            </a>
          ) : r.status === "error" ? (
            <span style={{ color: "#e06c5b", fontSize: 12 }} title={r.note}>
              failed
            </span>
          ) : (
            <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
          ),
      },
      {
        key: "issues",
        header: "Check",
        width: "140px",
        cell: (r) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDialogRow(r.id);
            }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: r.issues.length ? "#e9c46a" : r.alt ? "#6fcf7c" : "var(--muted)", textDecoration: "underline dotted" }}
            title="Open"
          >
            {r.issues.length ? `${r.issues.length} issue${r.issues.length === 1 ? "" : "s"}` : r.alt ? `ok · ${r.alt.length}/${ALT_MAX}` : "no alt yet"}
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batch?.id]
  );

  function onCellEdit(id: string, columnKey: string, value: string) {
    if (columnKey === "descriptor") updateRow(id, { descriptor: cleanDescriptor(value) });
    if (columnKey === "alt") updateRow(id, { alt: value.trim() });
  }

  async function exportZip() {
    if (!batch) return;
    setBusy("Building ZIP…");
    try {
      const zip = new JSZip();
      const csv: string[] = ["file_name,alt_text,original_name,width,height,bytes"];
      const md: string[] = [`# ${batch.folderPath}`, ""];
      for (const r of batch.rows) {
        const blob = await batchStore.getBlob(batch.id, r.id);
        if (blob) zip.file(r.fileName, blob);
        csv.push([r.fileName, r.alt, r.originalName, r.width, r.height, r.bytes].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
        md.push(`- **${r.fileName}** — ${r.alt || "(no alt text)"}`);
      }
      zip.file("alt-texts.csv", csv.join("\n"));
      zip.file("alt-texts.md", md.join("\n"));
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `${batch.folderPath.replace(/\//g, "_")}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setNotice(`Done. ZIP with ${batch.rows.length} images + alt-texts.csv + alt-texts.md`);
    } finally {
      setBusy(null);
    }
  }

  // Upload every ready row with an alt text to the chosen CMS folder. The
  // number continues from the highest one already in that folder, per
  // context prefix. One request per image; results land on the rows.
  async function uploadAll() {
    if (!batch || !batch.targetFolderId) return;
    setConfirmUpload(false);
    const todo = batch.rows.filter((r) => r.status !== "uploaded" && r.alt.trim());
    if (todo.length === 0) {
      setNotice("Nothing to upload: every image is either uploaded already or has no alt text yet.");
      return;
    }
    setBusy("Uploading…");
    const counters: Record<string, number> = {};
    let ok = 0;
    const failures: string[] = [];
    let rows = batch.rows;
    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      setProgress({ done: i, total: todo.length, current: r.fileName });
      try {
        const prefix = `audif1_${batch.year}_${batch.loc}_GP_${r.context}`;
        if (counters[prefix] == null) {
          const j = await fetch(`/api/assets/next-number?folder=${encodeURIComponent(batch.targetFolderId)}&prefix=${encodeURIComponent(prefix)}`).then((x) => x.json());
          counters[prefix] = Number(j.next ?? 1);
        }
        const nn = counters[prefix]++;
        const finalName = proposeFileName({ year: batch.year, loc: batch.loc, context: r.context as Context, descriptor: r.descriptor, nn, ext: r.mime === "image/webp" ? "webp" : "jpg" });
        const blob = await batchStore.getBlob(batch.id, r.id);
        if (!blob) throw new Error("image data missing in this browser");
        const form = new FormData();
        form.append("file", blob, finalName);
        form.append("filename", finalName);
        form.append("alt", r.alt);
        form.append("folder", batch.targetFolderId);
        const res = await fetch("/api/assets/upload", { method: "POST", body: form });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        rows = rows.map((x) => (x.id === r.id ? { ...x, status: "uploaded" as const, cmsId: j.doc.id, cmsUrl: j.doc.url, uploadedName: j.doc.filename, note: undefined } : x));
        ok++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "failed";
        rows = rows.map((x) => (x.id === r.id ? { ...x, status: "error" as const, note: msg } : x));
        failures.push(`${r.fileName}: ${msg}`);
      }
      await save({ ...batch, rows });
    }
    setProgress(null);
    setBusy(null);
    setNotice(`Done. ${ok} of ${todo.length} uploaded to ${batch.targetFolderPath}${failures.length ? `\nNot uploaded: ${failures.length}\n${failures.join("\n")}` : "."}`);
  }

  async function remove() {
    if (!batch) return;
    await batchStore.remove(batch.id);
    router.push("/assets/batches");
  }

  const readyCount = batch ? batch.rows.filter((r) => r.status !== "uploaded" && r.alt.trim()).length : 0;
  useSidebarContent(
    <>
      <SideSection title="Batch">
        <SideButton primary disabled note="next">
          Generate names + alt text
        </SideButton>
        <SideButton onClick={() => setPickFolder(true)} note={batch?.targetFolderId ? "set" : ""}>
          {batch?.targetFolderId ? "Change folder" : "Choose CMS folder"}
        </SideButton>
        <SideButton onClick={() => setConfirmUpload(true)} disabled={!batch?.targetFolderId || readyCount === 0 || Boolean(busy)} note={readyCount || ""}>
          Upload to staging
        </SideButton>
        <SideButton onClick={exportZip} disabled={Boolean(busy)}>
          Export ZIP + CSV
        </SideButton>
      </SideSection>
      <SideSection title="Danger">
        <SideButton onClick={remove}>Delete batch</SideButton>
      </SideSection>
    </>,
    [batch?.id, batch?.targetFolderId, readyCount, busy]
  );

  if (batch === undefined) return <p style={{ color: "var(--muted)" }}>Loading batch…</p>;
  if (batch === null) return <p style={{ color: "var(--muted)" }}>Batch not found in this browser. Batches live in the browser they were created in.</p>;

  const withAlt = batch.rows.filter((r) => r.alt).length;
  const issues = rows.reduce((n, r) => n + r.issues.length, 0);

  return (
    <div>
      <section className="page-head reveal">
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Batch · created {new Date(batch.createdAt).toLocaleString("en-GB")}</div>
          <h1 style={{ fontSize: 24 }}>{batch.targetFolderPath ?? `10_Media-Galleries/${batch.folderPath}`}</h1>
        </div>
      </section>
      <Steps current={batch.rows.every((r) => r.status === "uploaded") ? 4 : withAlt === batch.rows.length ? 4 : 3} done={[1, 2, ...(withAlt === batch.rows.length ? [3] : []), ...(batch.rows.every((r) => r.status === "uploaded") ? [4] : [])]} />
      <section className="reveal reveal-d1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { n: batch.rows.length, l: "Images" },
          { n: fmtBytes(batch.rows.reduce((n, r) => n + r.bytes, 0)), l: `from ${fmtBytes(batch.rows.reduce((n, r) => n + r.originalBytes, 0))}` },
          { n: withAlt, l: "With alt text" },
          { n: issues, l: "Checks open" },
        ].map((st) => (
          <div key={st.l} className="stat">
            <span className="n">{st.n}</span>
            <span className="l">{st.l}</span>
          </div>
        ))}
      </section>

      <section className="reveal reveal-d2 card" style={{ padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Target folder (staging)</div>
        <code style={{ fontSize: 13 }}>{batch.targetFolderPath ?? "— not chosen —"}</code>
        <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => setPickFolder(true)}>
          {batch.targetFolderId ? "Change" : "Choose folder"}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
          Step 3: every image needs an alt text (click a row&apos;s check to edit it in a dialog). Step 4: Upload, in the left bar.
        </span>
      </section>
      {progress && (
        <div role="status" style={{ background: "#141416", border: "1px solid var(--vapor-purple)", borderRadius: 8, padding: "10px 14px", margin: "0 0 12px", fontSize: 13 }}>
          Uploading {progress.done + 1} of {progress.total}: {progress.current}
          <div style={{ height: 4, background: "#2a2a2d", borderRadius: 2, marginTop: 8 }}>
            <div style={{ height: 4, width: `${Math.round(((progress.done + 1) / progress.total) * 100)}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.2s" }} />
          </div>
        </div>
      )}
      {pickFolder && (
        <FolderPicker
          initialPath={batch.folderPath}
          onClose={() => setPickFolder(false)}
          onPick={(f: { id: string; path: string }) => {
            void save({ ...batch, targetFolderId: f.id, targetFolderPath: f.path });
            setPickFolder(false);
          }}
        />
      )}
      {confirmUpload && (
        <Modal title="Upload to staging?" onClose={() => setConfirmUpload(false)} width={520}>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
            {batch.rows.filter((r) => r.status !== "uploaded" && r.alt.trim()).length} images go to <code>{batch.targetFolderPath}</code> on staging.audif1team.com, with their alt
            text, numbered after what is already in that folder. Images without alt text stay here.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={() => setConfirmUpload(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={uploadAll}>
              Upload
            </button>
          </div>
        </Modal>
      )}
      {dialogRow && (() => {
        const r = rows.find((x) => x.id === dialogRow);
        if (!r) return null;
        return (
          <Modal title={r.originalName} onClose={() => setDialogRow(null)} width={720}>
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 18, fontSize: 13 }}>
              <div>
                {r.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumb} alt="" style={{ width: 200, height: 200, objectFit: "cover", borderRadius: 8 }} />
                )}
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
                  {r.width}×{r.height} · {fmtBytes(r.bytes)}
                  <br />
                  <code style={{ fontSize: 11 }}>{r.fileName}</code>
                </div>
              </div>
              <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                  Alt text (English, under {ALT_MAX})
                  <textarea className="input" rows={3} value={r.alt} onChange={(e) => updateRow(r.id, { alt: e.target.value })} />
                  <span style={{ textAlign: "right", color: r.alt.length > ALT_MAX ? "#e06c5b" : "var(--muted)" }}>{r.alt.length}/{ALT_MAX}</span>
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                  Descriptor (2–6 words, goes into the file name)
                  <input className="input" value={r.descriptor} onChange={(e) => updateRow(r.id, { descriptor: e.target.value })} onBlur={(e) => updateRow(r.id, { descriptor: cleanDescriptor(e.target.value) })} />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                  Image type in the file name (gallery is the default; hero / teaser / quote only when the picture is made for that slot)
                  <select className="input" value={r.context} onChange={(e) => updateRow(r.id, { context: e.target.value })}>
                    {CONTEXTS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>Checks</div>
                  {r.issues.length === 0 ? (
                    <div style={{ color: "#6fcf7c" }}>{r.alt ? "All good." : "No alt text yet."}</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, color: "#e9c46a", lineHeight: 1.7 }}>
                      {r.issues.map((i, k) => (
                        <li key={k}>{i}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => { const i = rows.findIndex((x) => x.id === r.id); if (i > 0) setDialogRow(rows[i - 1].id); }} disabled={rows.findIndex((x) => x.id === r.id) === 0}>
                      ← Prev
                    </button>
                    <button className="btn" onClick={() => { const i = rows.findIndex((x) => x.id === r.id); if (i < rows.length - 1) setDialogRow(rows[i + 1].id); }} disabled={rows.findIndex((x) => x.id === r.id) === rows.length - 1}>
                      Next →
                    </button>
                  </div>
                  <button className="btn btn-primary" onClick={() => setDialogRow(null)}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}
      {notice && (
        <div role="status" style={{ background: notice.includes("Not uploaded") ? "#2a1512" : "#122a18", border: `1px solid ${notice.includes("Not uploaded") ? "#c0392b" : "#2e7d4f"}`, borderRadius: 8, padding: "10px 14px", margin: "0 0 12px", fontSize: 13, display: "flex", justifyContent: "space-between", whiteSpace: "pre-wrap" }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.6 }}>
            ×
          </button>
        </div>
      )}

      <div className="beui beui-compact">
        <Table<Row>
          data={rows}
          columns={columns}
          getRowId={(r) => r.key}
          resizable
          onCellEdit={onCellEdit}
          height={Math.max(360, typeof window !== "undefined" ? window.innerHeight - 300 : 600)}
          rowHeight={56}
          emptyState="No images in this batch."
          className="rounded-lg border border-border"
        />
      </div>
      <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
        Descriptor: 2–6 lowercase words, hyphens, no umlauts (Hulkenberg). Alt text: English, under {ALT_MAX} characters, pattern
        “&lt;subject&gt; of the Audi Revolut F1® Team &lt;action&gt; at the &lt;race&gt; Grand Prix”. Final numbering is set per CMS folder at upload.
      </p>
    </div>
  );
}
