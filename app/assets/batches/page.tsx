"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { batchStore, type Batch } from "@/lib/batchStore";
import { fmtBytes } from "@/lib/imageCompress";

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  useEffect(() => {
    batchStore.list().then(setBatches);
  }, []);
  return (
    <div style={{ maxWidth: 960 }}>
      <h1>Batches</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
        Batches are kept in this browser until you delete them. Once a batch has been uploaded to a CMS it can still be pushed to the
        other one (staging → production) from here.
      </p>
      {batches === null && <p style={{ color: "var(--muted)" }}>Loading…</p>}
      {batches && batches.length === 0 && (
        <p>
          No batches yet. <Link href="/assets">Create one</Link>.
        </p>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {batches?.map((b) => (
          <Link key={b.id} href={`/assets/batch/${b.id}`} className="card" style={{ padding: "12px 16px", textDecoration: "none", display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>
              <code style={{ fontSize: 13 }}>10_Media-Galleries/{b.folderPath}</code>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                {b.rows.length} images · {fmtBytes(b.rows.reduce((n, r) => n + r.bytes, 0))} · {b.rows.filter((r) => r.alt).length} with alt text ·{" "}
                {b.rows.filter((r) => r.status === "uploaded").length} uploaded
              </div>
            </span>
            <span style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>{new Date(b.createdAt).toLocaleString("en-GB")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
