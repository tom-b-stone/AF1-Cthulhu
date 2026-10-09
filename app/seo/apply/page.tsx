"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { validateSeoField } from "@/lib/seoBrand";

type Values = {
  collection: "news" | "pages";
  id: string;
  en: { title: string; description: string };
  de: { title: string; description: string };
};

// Landing page for the link Claude answers with after a "Generate" hand-off.
// It carries the finished EN/DE copy in the query string; this page publishes
// it straight away (Tom's call: no review step), via the same /api/seo/doc
// publish path the edit drawer uses — DE draft, settle, EN publish,
// publishedAt preserved. Hard brand-rule violations stop the auto-publish and
// show a "Publish anyway" button instead.
function ApplyInner() {
  const params = useSearchParams();
  const [state, setState] = useState<"checking" | "publishing" | "done" | "blocked" | "error">("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [values, setValues] = useState<Values | null>(null);
  const started = useRef(false);

  async function publish(v: Values, force: boolean) {
    setState("publishing");
    const res = await fetch("/api/seo/doc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: v.collection, id: v.id, action: "publish", en: v.en, de: v.de, force }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setState("done");
      return;
    }
    if (json.error === "validation_failed") {
      setIssues(json.issues ?? []);
      setState("blocked");
      return;
    }
    setMessage(json.error ?? "Publish failed.");
    setState("error");
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const c = params.get("c");
    const id = params.get("id");
    const et = params.get("et") ?? "";
    const ed = params.get("ed") ?? "";
    const dt = params.get("dt") ?? "";
    const dd = params.get("dd") ?? "";
    if ((c !== "news" && c !== "pages") || !id || !et || !ed) {
      setMessage("This link is missing the collection, id, or English title/description — ask Claude for the link again.");
      setState("error");
      return;
    }
    const v: Values = {
      collection: c,
      id,
      en: { title: et.trim(), description: ed.trim() },
      de: { title: dt.trim(), description: dd.trim() },
    };
    setValues(v);

    // Same hard-error check the API applies, done here first so a blocked
    // publish shows the reasons instead of a bare 422.
    const hard = [
      ...validateSeoField("title", v.en.title).errors,
      ...validateSeoField("description", v.en.description).errors,
      ...(v.de.title ? validateSeoField("title", v.de.title).errors : []),
      ...(v.de.description ? validateSeoField("description", v.de.description).errors : []),
    ];
    if (hard.length) {
      setIssues(hard);
      setState("blocked");
      return;
    }
    publish(v, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const box = (label: string, v: string) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>
        {label} · {v.length} chars
      </div>
      <div style={{ fontSize: 13 }}>{v || <span style={{ opacity: 0.4 }}>—</span>}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ marginBottom: 4 }}>SEO Studio</h1>
      <p style={{ opacity: 0.6, fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        {state === "checking" && "Checking the text from Claude…"}
        {state === "publishing" && "Publishing to the CMS (DE draft, then EN publish, publication date unchanged)…"}
        {state === "done" && "Published. The publication date was not changed."}
        {state === "blocked" && "Not published yet — the text breaks a brand rule:"}
        {state === "error" && "Couldn't publish."}
      </p>

      {state === "blocked" && (
        <div style={{ background: "#2a1512", border: "1px solid #c0392b", borderRadius: 6, padding: 12, fontSize: 12, marginBottom: 16 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {issues.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
          </ul>
          {values && (
            <button
              onClick={() => publish(values, true)}
              style={{ marginTop: 10, background: "none", border: "1px solid #c0392b", color: "#e06c5b", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
            >
              Publish anyway
            </button>
          )}
        </div>
      )}
      {state === "error" && message && (
        <div style={{ color: "#e06c5b", fontSize: 13, marginBottom: 16 }}>{message}</div>
      )}

      {values && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase", marginBottom: 10 }}>{values.collection}</div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>English</div>
          {box("SEO Title", values.en.title)}
          {box("SEO Description", values.en.description)}
          <div style={{ fontWeight: 600, fontSize: 13, margin: "16px 0 8px" }}>Deutsch</div>
          {box("SEO Title", values.de.title)}
          {box("SEO Description", values.de.description)}
        </div>
      )}

      <p style={{ marginTop: 20, fontSize: 13 }}>
        <Link href="/seo">← Back to the list</Link>
      </p>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<p style={{ opacity: 0.6 }}>Loading…</p>}>
      <ApplyInner />
    </Suspense>
  );
}
