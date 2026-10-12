"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { KnowledgeEntry } from "@/lib/teamKnowledge";
import type { AltExample } from "@/lib/examplesStore";
import type { RefMeta } from "@/lib/referenceStore";
import { correctionLine, type Correction } from "@/lib/feedbackStore";

// Learning session: your Claude scans the live library (photos that already
// have good alt texts), writes recognition cues per person and saves style
// examples. This page starts it and shows what came back.
export default function LearnPage() {
  const [people, setPeople] = useState<KnowledgeEntry[]>([]);
  const [examples, setExamples] = useState<AltExample[]>([]);
  const [refs, setRefs] = useState<RefMeta[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [hasConnector, setHasConnector] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);

  const load = () => {
    fetch("/api/assets/knowledge").then((r) => r.json()).then((j) => setPeople((j.entries ?? []).filter((e: KnowledgeEntry) => e.kind === "person")));
    fetch("/api/assets/examples").then((r) => r.json()).then((j) => setExamples(j.examples ?? []));
    fetch("/api/assets/references").then((r) => r.json()).then((j) => setRefs(j.refs ?? []));
    fetch("/api/assets/feedback").then((r) => r.json()).then((j) => setCorrections(j.corrections ?? []));
  };
  useEffect(() => {
    load();
    fetch("/api/connector").then((r) => r.json()).then((j) => setHasConnector(Boolean(j.active))).catch(() => setHasConnector(false));
  }, []);
  // refresh every 10s while the page is open, so results from Claude show up
  useEffect(() => {
    const t = setInterval(() => {
      load();
      setTick((x) => x + 1);
    }, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ maxWidth: 960 }}>
      <section className="page-head reveal">
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Asset Uploader · learning</div>
          <h1>Learn from the library</h1>
          <p>
            Claude looks at photos on audif1.com that already carry a good alt text, works out how to recognise each person (car number, helmet, suit,
            face, usual place) and which alt texts to imitate. Everything it writes lands in Team knowledge and in the examples below, where you can
            correct or delete it. Run it once now, again when the team or the car changes.
          </p>
        </div>
        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
          <a href="/api/assets/learn" target="_blank" rel="noreferrer" className={`btn btn-primary${hasConnector === false ? " is-disabled" : ""}`} aria-disabled={hasConnector === false}>
            Start a learning session
          </a>
          <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "right", maxWidth: 240 }}>
            {hasConnector === false ? "Needs the AF1 Tools connector (home page shows the setup)." : "Opens claude.ai; results come back here on their own."}
          </span>
        </div>
      </section>

      <section className="reveal reveal-d1" style={{ marginBottom: 28 }}>
        <div className="section-label" style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span>Recognition cues</span>
          <Link href="/assets/knowledge" className="link-line" style={{ color: "var(--muted)" }}>
            edit in Team knowledge
          </Link>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {people.map((p) => (
            <div key={p.id} className="card" style={{ padding: "10px 14px", fontSize: 13, opacity: p.active ? 1 : 0.5 }}>
              <strong style={{ fontFamily: "var(--font-heading)" }}>{p.name}</strong> <span style={{ color: "var(--muted)", fontSize: 12 }}>{p.role}</span>
              <div style={{ color: p.cue ? "var(--fg)" : "var(--muted)", fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>{p.cue ?? "no cue yet"}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="reveal reveal-d2" style={{ marginBottom: 28 }}>
        <div className="section-label" style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span>Reference photos ({refs.length})</span>
          <span>what Claude compares faces, helmets and suits against</span>
        </div>
        {refs.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            None yet. A learning session saves them from the library; you can also save one from any batch photo (row dialog → Teach Claude).
          </div>
        )}
        <div style={{ display: "grid", gap: 14 }}>
          {Array.from(new Set(refs.map((r) => r.person))).map((person) => (
            <div key={person}>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{person}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {refs.filter((r) => r.person === person).map((r) => (
                  <div key={r.id} className="card" style={{ width: 128, padding: 6, fontSize: 11, color: "var(--muted)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/assets/references?id=${r.id}`} alt="" style={{ width: 116, height: 116, objectFit: "cover", borderRadius: 6, display: "block" }} />
                    <div style={{ marginTop: 4, lineHeight: 1.4, minHeight: 16 }}>{r.note ?? ""}</div>
                    <button
                      onClick={async () => {
                        const j = await fetch(`/api/assets/references?id=${r.id}`, { method: "DELETE" }).then((x) => x.json());
                        setRefs(j.refs ?? []);
                      }}
                      style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, padding: 0, marginTop: 2 }}
                    >
                      remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="reveal reveal-d2" style={{ marginBottom: 28 }}>
        <div className="section-label" style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span>Corrections ({corrections.length})</span>
          <span>logged at upload when you changed Claude&apos;s people or scene; shown to Claude next time</span>
        </div>
        {corrections.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>None yet.</div>}
        <div style={{ display: "grid", gap: 6 }}>
          {corrections.slice(0, 30).map((c) => (
            <div key={c.id} className="card" style={{ padding: "8px 12px", fontSize: 12, lineHeight: 1.5 }}>
              <span style={{ color: "var(--muted)" }}>{c.at.slice(0, 10)} · {c.originalName}</span>
              <div>{correctionLine(c).replace(/^- /, "")}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="reveal reveal-d2">
        <div className="section-label" style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span>Style examples ({examples.length})</span>
          <span>refreshes every 10 s · {tick}</span>
        </div>
        {examples.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>None yet. The learning session fills this.</div>}
        <div style={{ display: "grid", gap: 6 }}>
          {examples.map((e) => (
            <div key={e.id} className="card" style={{ padding: "8px 12px", fontSize: 13, display: "flex", gap: 12, alignItems: "baseline" }}>
              <span style={{ fontSize: 11, color: "var(--vapor-rose)", fontFamily: "var(--font-label)", minWidth: 90 }}>{e.subject}</span>
              <span style={{ flex: 1 }}>{e.alt}</span>
              <button
                onClick={async () => {
                  const j = await fetch(`/api/assets/examples?id=${e.id}`, { method: "DELETE" }).then((r) => r.json());
                  setExamples(j.examples ?? []);
                }}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
