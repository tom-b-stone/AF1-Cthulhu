"use client";

import { useEffect, useMemo, useState } from "react";

type Card = { id: string; title: string; mechanic?: string; updatedAt: string };
type Step = { step: string; ok: boolean; detail?: string; link?: string };

// First building block of the configurator's publish step: copy a live
// Team Card (badge, engagement, page teaser, images) from production to
// staging. The badge stays hidden (isDraft) and the page change is a draft
// version unless the switches say otherwise.
export default function CopyCard() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string>("");
  const [keepDraft, setKeepDraft] = useState(true);
  const [withPage, setWithPage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    fetch("/api/teamcards/prod")
      .then((r) => r.json())
      .then((j) => (j.cards ? setCards(j.cards) : setError(j.error ?? "Could not load production cards")))
      .catch(() => setError("Could not load production cards"));
  }, []);

  const list = useMemo(() => (cards ?? []).filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase())), [cards, q]);

  async function run() {
    if (!picked) return;
    setBusy(true);
    setSteps(null);
    const j = await fetch("/api/teamcards/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ badgeId: picked, keepDraft, withPageBlock: withPage }) })
      .then((r) => r.json())
      .catch(() => ({ steps: [{ step: "request failed", ok: false }] }));
    setSteps(j.steps ?? [{ step: j.error ?? "failed", ok: false }]);
    setBusy(false);
  }

  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18, display: "grid", gap: 12, background: "var(--surface)" }}>
      <div>
        <div style={{ fontWeight: 600 }}>Copy a Team Card from production to staging</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Card, engagement, images and the teaser on its page. Production is only read.</div>
      </div>
      {error && <div style={{ color: "#e06c5b", fontSize: 13 }}>{error}</div>}
      <input className="input" placeholder={cards ? `Search ${cards.length} production cards…` : "Loading production cards…"} value={q} onChange={(e) => setQ(e.target.value)} />
      <select className="input" size={8} value={picked} onChange={(e) => setPicked(e.target.value)} style={{ height: "auto" }}>
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title} {c.mechanic ? `· ${c.mechanic}` : ""}
          </option>
        ))}
      </select>
      <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={keepDraft} onChange={(e) => setKeepDraft(e.target.checked)} /> Keep the card hidden on staging (isDraft)
      </label>
      <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={withPage} onChange={(e) => setWithPage(e.target.checked)} /> Add the teaser block to its staging page (as a draft version)
      </label>
      <div>
        <button className="btn btn-primary" disabled={!picked || busy} onClick={run}>
          {busy ? "Copying…" : "Copy to staging"}
        </button>
      </div>
      {steps && (
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 13 }}>
          {steps.map((s, i) => (
            <li key={i} style={{ color: s.ok ? "inherit" : "#e06c5b" }}>
              {s.link ? (
                <a href={s.link} target="_blank" rel="noreferrer">
                  {s.step} ↗
                </a>
              ) : (
                s.step
              )}
              {s.detail ? <span style={{ color: "var(--muted)" }}> · {s.detail}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
