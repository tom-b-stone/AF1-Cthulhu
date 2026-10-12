"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import JSZip from "jszip";
import { Table, type TableColumn } from "@/components/ui/table-editable";
import { batchStore, type AssetRow, type Batch } from "@/lib/batchStore";
import { fmtBytes } from "@/lib/imageCompress";
import { ALT_MAX, CONTEXTS, cleanDescriptor, proposeFileName, validateAlt, type Context } from "@/lib/assetNaming";

type Row = AssetRow & { key: string; thumb?: string; issues: string[]; nn: number };

export default function BatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [batch, setBatch] = useState<Batch | null | undefined>(undefined);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
        issues: [...validateAlt(r.alt), ...(r.descriptor && cleanDescriptor(r.descriptor) !== r.descriptor ? ["Descriptor was normalised"] : [])],
      })),
    [batch, thumbs]
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
      {
        key: "context",
        header: "Context",
        width: "110px",
        cell: (r) => (
          <select value={r.context} onChange={(e) => updateRow(r.id, { context: e.target.value })} className="input" style={{ padding: "3px 6px", fontSize: 12, width: "100%" }}>
            {CONTEXTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
        key: "issues",
        header: "Check",
        width: "140px",
        cell: (r) =>
          r.issues.length ? (
            <span title={r.issues.join("\n")} style={{ color: "#e9c46a", fontSize: 12 }}>
              {r.issues.length} issue{r.issues.length === 1 ? "" : "s"}
            </span>
          ) : r.alt ? (
            <span style={{ color: "#6fcf7c", fontSize: 12 }}>ok · {r.alt.length}/{ALT_MAX}</span>
          ) : (
            <span style={{ color: "var(--muted)", fontSize: 12 }}>no alt yet</span>
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

  async function remove() {
    if (!batch) return;
    await batchStore.remove(batch.id);
    router.push("/assets/batches");
  }

  if (batch === undefined) return <p style={{ color: "var(--muted)" }}>Loading batch…</p>;
  if (batch === null) return <p style={{ color: "var(--muted)" }}>Batch not found in this browser. Batches live in the browser they were created in.</p>;

  const withAlt = batch.rows.filter((r) => r.alt).length;
  const issues = rows.reduce((n, r) => n + r.issues.length, 0);

  return (
    <div>
      <section className="page-head reveal">
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Batch · created {new Date(batch.createdAt).toLocaleString("en-GB")}</div>
          <h1 style={{ fontSize: 24 }}>10_Media-Galleries/{batch.folderPath}</h1>
        </div>
      </section>
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button className="btn btn-primary" disabled title="Next step: Claude writes descriptor + alt text per image through the AF1 Tools connector">
          Generate names + alt text
        </button>
        <button className="btn" disabled title="Next step: upload to the staging CMS folder">
          Upload to staging
        </button>
        <button className="btn" onClick={exportZip} disabled={Boolean(busy)}>
          {busy ?? "Export ZIP + CSV"}
        </button>
        <button className="btn" onClick={remove} style={{ marginLeft: "auto", color: "#e06c5b" }}>
          Delete batch
        </button>
      </div>

      {notice && (
        <div role="status" style={{ background: "#122a18", border: "1px solid #2e7d4f", borderRadius: 8, padding: "10px 14px", margin: "0 0 12px", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
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
