"use client";

import { useEffect, useState } from "react";
import { validateSeoField } from "@/lib/seoBrand";
import type { SeoListItem, SeoLocaleMeta } from "./types";

function FieldBox({
  label,
  value,
  onChange,
  kind,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  kind: "title" | "description";
  multiline?: boolean;
}) {
  const { errors, warnings } = validateSeoField(kind, value);
  const Tag = multiline ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
        <span>{label}</span>
        <span>{value.length} chars</span>
      </div>
      <Tag
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={multiline ? 3 : undefined}
        style={{
          width: "100%",
          background: "#161617",
          color: "var(--fg)",
          border: `1px solid ${errors.length ? "#c0392b" : "var(--border)"}`,
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 13,
          fontFamily: "inherit",
          resize: multiline ? "vertical" : undefined,
        }}
      />
      {errors.map((e, i) => (
        <div key={`e${i}`} style={{ color: "#e06c5b", fontSize: 11, marginTop: 4 }}>
          ⚠ {e}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div key={`w${i}`} style={{ color: "#c9a227", fontSize: 11, marginTop: 4 }}>
          · {w}
        </div>
      ))}
    </div>
  );
}

export default function EditPanel({
  item,
  onClose,
  onSaved,
}: {
  item: SeoListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [en, setEn] = useState<SeoLocaleMeta>(item.en);
  const [de, setDe] = useState<SeoLocaleMeta>(item.de);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockingIssues, setBlockingIssues] = useState<string[] | null>(null);

  // Re-fetch the live doc on open rather than trusting the list snapshot —
  // someone else may have edited it in the CMS since the list loaded.
  useEffect(() => {
    let cancelled = false;
    setLoadingDoc(true);
    fetch(`/api/seo/doc?collection=${item.collection}&id=${item.id}`)
      .then((r) => r.json())
      .then((doc) => {
        if (cancelled) return;
        setEn({ title: doc.en?.meta?.title ?? "", description: doc.en?.meta?.description ?? "" });
        setDe({ title: doc.de?.meta?.title ?? "", description: doc.de?.meta?.description ?? "" });
      })
      .catch(() => {
        // Fall back to the list snapshot already in state if the refetch fails.
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.collection, item.id]);

  async function save(action: "draft" | "publish", force = false) {
    setSaving(action);
    setError(null);
    setBlockingIssues(null);
    try {
      const res = await fetch("/api/seo/doc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: item.collection, id: item.id, action, en, de, force }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "validation_failed") {
          setBlockingIssues(json.issues as string[]);
        } else {
          setError(json.error ?? "Save failed.");
        }
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "100%",
          height: "100%",
          overflowY: "auto",
          background: "var(--bg)",
          borderLeft: "1px solid var(--border)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase" }}>{item.collection}</div>
            <h2 style={{ margin: "2px 0 0", fontSize: 16 }}>{item.internalTitle}</h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", fontSize: 18 }}
          >
            ×
          </button>
        </div>
        {loadingDoc ? (
          <p style={{ opacity: 0.6, marginTop: 24 }}>Loading live values from the CMS…</p>
        ) : (
          <>
            <div style={{ marginTop: 24, marginBottom: 8, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>English</span>
              <a
                href={item.urls.en}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, opacity: 0.6, textDecoration: "underline" }}
              >
                {item.urls.en}
              </a>
            </div>
            <FieldBox label="SEO Title" kind="title" value={en.title} onChange={(v) => setEn({ ...en, title: v })} />
            <FieldBox
              label="SEO Description"
              kind="description"
              multiline
              value={en.description}
              onChange={(v) => setEn({ ...en, description: v })}
            />

            <div style={{ marginTop: 16, marginBottom: 8, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Deutsch</span>
              <a
                href={item.urls.de}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, opacity: 0.6, textDecoration: "underline" }}
              >
                {item.urls.de}
              </a>
            </div>
            <FieldBox label="SEO Title" kind="title" value={de.title} onChange={(v) => setDe({ ...de, title: v })} />
            <FieldBox
              label="SEO Description"
              kind="description"
              multiline
              value={de.description}
              onChange={(v) => setDe({ ...de, description: v })}
            />

            {blockingIssues && (
              <div
                style={{
                  background: "#2a1512",
                  border: "1px solid #c0392b",
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ marginBottom: 6 }}>Fix these before saving, or save anyway:</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {blockingIssues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
                <button
                  onClick={() => save(saving === "publish" ? "publish" : "draft", true)}
                  style={{
                    marginTop: 8,
                    background: "none",
                    border: "1px solid #c0392b",
                    color: "#e06c5b",
                    borderRadius: 4,
                    padding: "4px 8px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Save anyway
                </button>
              </div>
            )}
            {error && (
              <div style={{ color: "#e06c5b", fontSize: 12, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => save("draft")}
                disabled={saving !== null}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "none",
                  color: "var(--fg)",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving === "draft" ? "Saving…" : "Save as draft"}
              </button>
              <button
                onClick={() => save("publish")}
                disabled={saving !== null}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving === "publish" ? "Publishing…" : "Publish"}
              </button>
            </div>
            <p style={{ fontSize: 11, opacity: 0.5, marginTop: 10 }}>
              Publish writes DE as a draft first, waits 3s for Payload to settle, then publishes EN live —
              same two-step trick used in the CMS console workflow, so unrelated DE validation issues
              never block getting EN live.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
