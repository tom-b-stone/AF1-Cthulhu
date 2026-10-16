"use client";

// Figma ↔ CMS changes: is the campaign the same in Figma and on staging?
// Lists only what changed, in which direction, before → after, and lets
// you approve the changes (all or a selection). Setup lives at the bottom.
import { useEffect, useMemo, useState } from "react";

type Diff = { key: string; pageId: string; page: string; block: string; layer: string; kind?: string; base?: string; cms?: string; figma?: string; state: string };
type Status = {
  campaign: { key: string; name: string; figmaFile: string; figmaPage: string };
  pages: { id: string; url: string; title: string }[];
  diffs: Diff[];
  syncedAt: string | null;
  figma: { reportedAt: string; by: string; nodes: Record<string, string> } | null;
  pending: number;
  log: { at: string; by: string; summary: string }[];
};

const DIR: Record<string, { label: string; tone: string }> = {
  "figma-newer": { label: "Figma → CMS", tone: "#7fb8ff" },
  "cms-newer": { label: "CMS → Figma", tone: "#6fcf7c" },
  conflict: { label: "Changed on both", tone: "var(--accent)" },
};
const when = (s?: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");
const short = (v?: string) => (v ?? "").trim() || "(empty)";

export default function Page() {
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<Record<string, "figma" | "cms">>({});
  const [result, setResult] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenAt, setTokenAt] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);

  const load = () =>
    fetch("/api/sitemap/sin")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setError(j.error);
        setS(j);
        // non-conflicting changes are pre-selected, conflicts need a decision first
        setSel(Object.fromEntries((j.diffs as Diff[]).filter((d) => DIR[d.state]).map((d) => [d.key, d.state !== "conflict"])));
      })
      .catch(() => setError("Could not load the campaign"));
  useEffect(() => {
    void load();
    fetch("/api/sitemap/token").then((r) => r.json()).then((j) => setTokenAt(j.createdAt ?? null)).catch(() => {});
  }, []);

  const changes = useMemo(() => (s?.diffs ?? []).filter((d) => DIR[d.state]), [s]);
  const titleOf = useMemo(() => Object.fromEntries((s?.pages ?? []).map((p) => [p.id, p.title.replace(/^SIN \| /, "")])), [s]);
  const chosen = changes.filter((d) => sel[d.key] && (d.state !== "conflict" || decisions[d.key]));
  const figmaLink = (node?: string) => (s ? `https://www.figma.com/design/${s.campaign.figmaFile}/WorkingDoc?node-id=${(node ?? s.campaign.figmaPage).replace(":", "-")}` : "#");

  async function approve() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/sitemap/sin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ only: chosen.map((d) => d.key), decisions }) }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setResult(`${r.summary}.` + (r.toFigma?.length ? " Figma takes the CMS changes the next time the plugin runs." : ""));
      setDecisions({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 1100 }}>
      <div>
        <h1 style={{ margin: "0 0 4px" }}>Figma ↔ CMS changes{s ? ` · ${s.campaign.name}` : ""}</h1>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Texts and images edited in Figma or in the staging CMS. Approve a change and it is copied to the other side.
          {s && <> Last checked {when(s.figma?.reportedAt)} · <a href={figmaLink()} target="_blank" rel="noreferrer">Open Figma ↗</a></>}
        </div>
      </div>

      {error && <div style={{ color: "#e06c5b" }}>{error}</div>}
      {!s && !error && <div style={{ color: "var(--muted)" }}>Checking Figma and the staging CMS…</div>}

      {s && changes.length === 0 && (
        <div style={{ padding: 22, borderRadius: 14, border: "1px solid rgba(111,207,124,.4)", background: "rgba(111,207,124,.08)", fontSize: 16 }}>
          ✓ <b>In sync.</b> Figma and the staging CMS show the same content.
          {s.pending > 0 && <span style={{ color: "var(--muted)", fontSize: 13 }}> {s.pending} approved change{s.pending === 1 ? " is" : "s are"} waiting for the Figma plugin.</span>}
        </div>
      )}

      {s && changes.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 16 }}>
              {changes.length} change{changes.length === 1 ? "" : "s"} to approve
            </b>
            <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setSel(Object.fromEntries(changes.map((d) => [d.key, true])))}>
              Select all
            </button>
            <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setSel({})}>
              None
            </button>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {changes.map((d, i) => {
              const dir = DIR[d.state];
              const after = d.state === "figma-newer" ? d.figma : d.cms;
              return (
                <label key={d.key} style={{ display: "grid", gridTemplateColumns: "28px 150px minmax(0,1fr)", gap: 12, padding: "12px 14px", borderTop: i ? "1px solid var(--border)" : undefined, alignItems: "start", cursor: "pointer", background: sel[d.key] ? "rgba(255,255,255,.02)" : undefined }}>
                  <input type="checkbox" checked={!!sel[d.key]} onChange={(e) => setSel({ ...sel, [d.key]: e.target.checked })} style={{ marginTop: 3 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: dir.tone }}>{dir.label}</span>
                  <span style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {titleOf[d.pageId] ?? d.page} · {d.block} · {d.layer}
                    </span>
                    {d.kind === "image" ? (
                      <span style={{ fontSize: 13 }}>Image {d.state === "figma-newer" ? "replaced in Figma" : d.state === "cms-newer" ? "changed in the CMS" : "changed on both sides"}</span>
                    ) : d.state === "conflict" ? (
                      <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {(["figma", "cms"] as const).map((side) => (
                          <span
                            key={side}
                            onClick={(e) => {
                              e.preventDefault();
                              setDecisions({ ...decisions, [d.key]: side });
                              setSel({ ...sel, [d.key]: true });
                            }}
                            style={{ padding: 8, borderRadius: 8, fontSize: 13, whiteSpace: "pre-wrap", border: `1px solid ${decisions[d.key] === side ? "var(--accent)" : "var(--border)"}` }}
                          >
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>Keep {side === "figma" ? "Figma" : "CMS"}</span>
                            <br />
                            {short(side === "figma" ? d.figma : d.cms)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
                        <span style={{ color: "var(--muted)", textDecoration: "line-through" }}>{short(d.base)}</span>
                        <span style={{ color: "var(--muted)" }}> → </span>
                        {short(after)}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-primary" disabled={busy || chosen.length === 0} onClick={() => void approve()}>
              {busy ? "Copying…" : `Approve ${chosen.length} change${chosen.length === 1 ? "" : "s"}`}
            </button>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>Figma → CMS is published on staging right away. CMS → Figma arrives with the next plugin run.</span>
          </div>
        </div>
      )}
      {result && <div style={{ fontSize: 13 }}>{result}</div>}

      <details style={{ fontSize: 13 }}>
        <summary style={{ cursor: "pointer", color: "var(--muted)" }}>Setup and history</summary>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Figma desktop → Plugins → Development → Import plugin from manifest → <code>~/projects/AF1-Ktulu/figma-plugin/af1-ktulu-sync/manifest.json</code></li>
            <li>Create the plugin token and paste it into the plugin once.</li>
            <li>Keep the plugin open in the Figma file: it checks every 20 seconds.</li>
          </ol>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" onClick={async () => { const r = await fetch("/api/sitemap/token", { method: "POST" }).then((x) => x.json()); setToken(r.token); setTokenAt(new Date().toISOString()); }}>
              {tokenAt ? "New plugin token" : "Create plugin token"}
            </button>
            {tokenAt && !token && <span style={{ color: "var(--muted)", fontSize: 12 }}>Token created {when(tokenAt)}. A new one replaces it.</span>}
            {token && <code style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, userSelect: "all" }}>{token}</code>}
            <button className="btn" onClick={async () => { setImported("Updating …"); const r = await fetch("/api/sitemap/sin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import-cards" }) }).then((x) => x.json()); setImported(r.error ? r.error : `${r.added.length} new, ${r.total} cards in total.`); }}>
              Update the card list
            </button>
            {imported && <span style={{ color: "var(--muted)" }}>{imported}</span>}
          </div>
          {s?.log.slice(0, 10).map((l, i) => (
            <div key={i} style={{ color: "var(--muted)", fontSize: 12 }}>
              {when(l.at)} · {l.by} · {l.summary}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
