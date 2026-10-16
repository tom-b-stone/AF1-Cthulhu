"use client";

// Sitemap Sync: one campaign in the same state in Figma, here and in the
// staging CMS. Opening the page runs the check (newest change wins) and asks
// when both sides changed the same text.
import { useEffect, useMemo, useState } from "react";
import { Table, type TableColumn } from "@/components/ui/table-editable";

type Diff = { key: string; pageId: string; page: string; block: string; layer: string; kind?: string; base?: string; cms?: string; figma?: string; state: string };
type Page = { id: string; url: string; title: string; updatedAt: string; status: string; blocks: { id: string; blockType: string; hidden: boolean; fields: unknown[] }[] };
type Status = {
  campaign: { key: string; name: string; figmaFile: string; figmaPage: string };
  pages: Page[];
  diffs: Diff[];
  inSync: number;
  total: number;
  syncedAt: string | null;
  figma: { reportedAt: string; by: string; nodes: Record<string, string> } | null;
  pending: number;
  log: { at: string; by: string; summary: string }[];
};

const STG = "https://staging.audif1team.com";
const LABEL: Record<string, string> = { "figma-newer": "Figma is newer", "cms-newer": "CMS is newer", conflict: "Changed on both sides", "missing-in-figma": "Not in Figma yet" };
const when = (s?: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");

export default function Page() {
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, "figma" | "cms">>({});
  const [result, setResult] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenAt, setTokenAt] = useState<string | null>(null);

  const load = () => {
    setError(null);
    return fetch("/api/sitemap/sin")
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setS(j)))
      .catch(() => setError("Could not load the campaign"));
  };
  useEffect(() => {
    void load();
    fetch("/api/sitemap/token").then((r) => r.json()).then((j) => setTokenAt(j.createdAt ?? null)).catch(() => {});
  }, []);

  const real = useMemo(() => (s?.diffs ?? []).filter((d) => d.state !== "missing-in-figma"), [s]);
  const missingFields = (s?.diffs ?? []).length - real.length;
  const counts = useMemo(() => ({ fig: real.filter((d) => d.state === "figma-newer").length, cms: real.filter((d) => d.state === "cms-newer").length, conf: real.filter((d) => d.state === "conflict").length }), [real]);
  const byPage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of real) m[d.pageId] = (m[d.pageId] ?? 0) + 1;
    return m;
  }, [real]);

  async function apply() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/sitemap/sin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisions }) }).then((r) => r.json());
      if (r.error) throw new Error(r.error);
      setResult(`${r.summary}.` + (r.toFigma.length ? " Figma picks up the CMS changes the next time the plugin runs." : ""));
      setDecisions({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const [imported, setImported] = useState<string | null>(null);
  async function importCards() {
    setImported("Adding the Singapore cards …");
    const r = await fetch("/api/sitemap/sin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import-cards" }) }).then((r) => r.json());
    setImported(r.error ? r.error : `Card list updated: ${r.added.length} new, ${r.total} cards in total.`);
  }

  async function mint() {
    const r = await fetch("/api/sitemap/token", { method: "POST" }).then((r) => r.json());
    setToken(r.token);
    setTokenAt(new Date().toISOString());
  }

  const figmaLink = (node?: string) => (s ? `https://www.figma.com/design/${s.campaign.figmaFile}/WorkingDoc?node-id=${(node ?? s.campaign.figmaPage).replace(":", "-")}` : "#");

  const pageColumns: TableColumn<Page>[] = [
    { key: "title", header: "Page", width: "300px", sortable: true, cell: (p) => <div><div style={{ fontWeight: 600 }}>{p.title}</div><div style={{ color: "var(--muted)", fontSize: 12 }}>/{p.url}</div></div> },
    { key: "url", header: "URL", width: "260px", sortable: true, cell: (p) => <span style={{ fontSize: 12 }}>/{p.url}</span> },
    { key: "modules", header: "Modules", width: "90px", sortable: true, sortValue: (p) => p.blocks.length, cell: (p) => p.blocks.length },
    { key: "figma", header: "Figma", width: "100px", cell: (p) => { const node = s?.figma?.nodes?.[p.id]; return node ? <a href={figmaLink(node)} target="_blank" rel="noreferrer">Frame ↗</a> : <span style={{ color: "var(--muted)" }}>not built</span>; } },
    { key: "staging", header: "Staging", width: "140px", cell: (p) => <span style={{ fontSize: 12, whiteSpace: "nowrap" }}><a href={`${STG}/en/${p.url}`} target="_blank" rel="noreferrer">Page ↗</a> · <a href={`${STG}/cms/admin/collections/pages/${p.id}`} target="_blank" rel="noreferrer">CMS ↗</a></span> },
    { key: "state", header: "State", width: "140px", sortable: true, sortValue: (p) => byPage[p.id] ?? 0, cell: (p) => (byPage[p.id] ? `${byPage[p.id]} difference${byPage[p.id] === 1 ? "" : "s"}` : s?.figma?.nodes?.[p.id] ? "in sync" : "–") },
  ];

  return (
    <div style={{ display: "grid", gap: 24, maxWidth: 1400 }}>
      <div>
        <h1 style={{ margin: "0 0 6px" }}>Sitemap Sync{s ? ` · ${s.campaign.name}` : ""}</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          The campaign sitemap in Figma, this tool and the staging CMS stay in the same state. The newest change wins. When a text changed on both sides, I ask you which one to keep.
        </p>
      </div>

      {error && <div style={{ color: "#e06c5b" }}>{error}</div>}
      {!s && !error && <div style={{ color: "var(--muted)" }}>Checking Figma and the staging CMS…</div>}

      {s && (
        <div className="card" style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 12, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <div><strong>{s.pages.length}</strong> pages</div>
            <div><strong>{s.inSync}</strong> / {s.total} texts in sync</div>
            <div>Last sync: <strong>{when(s.syncedAt)}</strong></div>
            <div>Figma last read: <strong>{s.figma ? `${when(s.figma.reportedAt)} (${s.figma.by})` : "not yet"}</strong></div>
            {s.pending > 0 && <div><strong>{s.pending}</strong> change{s.pending === 1 ? "" : "s"} waiting for Figma</div>}
          </div>
          {!s.figma && (
            <div style={{ fontSize: 13 }}>
              Figma hasn&apos;t reported yet. Run the <strong>AF1 Ktulu Sync</strong> plugin once in the{" "}
              <a href={figmaLink()} target="_blank" rel="noreferrer">Figma sitemap ↗</a>: it builds the pages that are missing and records their state.
            </div>
          )}
          {s.figma && real.length === 0 && <div style={{ fontSize: 13 }}>Everything is in sync.{missingFields ? ` ${missingFields} text${missingFields === 1 ? "" : "s"} are on pages that aren't in Figma yet.` : ""}</div>}
          {real.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 14 }}>
                I found <strong>{real.length}</strong> difference{real.length === 1 ? "" : "s"} since the last sync:
                {counts.fig > 0 && <> {counts.fig} changed in Figma (they go to the CMS),</>}
                {counts.cms > 0 && <> {counts.cms} changed in the CMS (they go to Figma),</>}
                {counts.conf > 0 && <> <strong>{counts.conf} changed on both sides</strong>. Which version should stay?</>}
              </div>
              {real.map((d) => (
                <div key={d.key} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, fontSize: 13, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border-2)", color: d.state === "conflict" ? "var(--accent)" : undefined }}>{LABEL[d.state]}</span>
                    <span style={{ color: "var(--muted)" }}>/{d.page} · {d.block} · {d.layer}</span>
                  </div>
                  {d.kind === "image" ? (
                    <div style={{ color: "var(--muted)" }}>Image {d.state === "figma-newer" ? "replaced in Figma, goes to the staging media library" : d.state === "cms-newer" ? "changed in the CMS, Figma loads it with the next plugin run" : "changed on both sides"}.{d.state === "conflict" && (
                      <span> {(["figma", "cms"] as const).map((side) => (<label key={side} style={{ marginLeft: 10 }}><input type="radio" name={d.key} checked={decisions[d.key] === side} onChange={() => setDecisions({ ...decisions, [d.key]: side })} /> Keep {side === "figma" ? "Figma" : "CMS"}</label>))}</span>
                    )}</div>
                  ) : d.state === "conflict" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {(["figma", "cms"] as const).map((side) => (
                        <label key={side} style={{ display: "grid", gap: 4, padding: 10, borderRadius: 8, cursor: "pointer", border: `1px solid ${decisions[d.key] === side ? "var(--accent)" : "var(--border)"}` }}>
                          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input type="radio" name={d.key} checked={decisions[d.key] === side} onChange={() => setDecisions({ ...decisions, [d.key]: side })} />
                            Keep {side === "figma" ? "Figma" : "CMS"}
                          </span>
                          <span style={{ whiteSpace: "pre-wrap" }}>{side === "figma" ? d.figma : d.cms}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div><div style={{ color: "var(--muted)", fontSize: 11 }}>Before</div><div style={{ whiteSpace: "pre-wrap" }}>{d.base}</div></div>
                      <div><div style={{ color: "var(--muted)", fontSize: 11 }}>Now ({d.state === "figma-newer" ? "Figma" : "CMS"})</div><div style={{ whiteSpace: "pre-wrap" }}>{d.state === "figma-newer" ? d.figma : d.cms}</div></div>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn btn-primary" disabled={busy} onClick={() => void apply()}>
                  {busy ? "Syncing…" : counts.conf && Object.keys(decisions).length < counts.conf ? "Sync, leave undecided open" : "Sync now"}
                </button>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>Figma changes are published on staging. CMS changes reach Figma with the next plugin run.</span>
              </div>
            </div>
          )}
          {result && <div style={{ fontSize: 13 }}>{result}</div>}
        </div>
      )}

      {s && (
        <div className="beui beui-compact">
          <Table<Page>
            data={s.pages}
            columns={pageColumns}
            getRowId={(p) => p.id}
            resizable
            reorderable
            defaultSort={{ key: "url", direction: "asc" }}
            height={Math.min(760, 120 + s.pages.length * 48)}
            rowHeight={48}
            className="rounded-lg border border-border"
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        <button className="btn" onClick={() => void importCards()}>Update the card list with the Singapore cards</button>
        {imported && <span style={{ color: "var(--muted)" }}>{imported}</span>}
      </div>

      <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Figma plugin</h2>
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Figma desktop → Plugins → Development → Import plugin from manifest → <code>~/projects/AF1-Ktulu/figma-plugin/af1-ktulu-sync/manifest.json</code></li>
          <li>Create your plugin token below and paste it into the plugin once.</li>
          <li>Open the <a href={figmaLink()} target="_blank" rel="noreferrer">Figma sitemap ↗</a> and run <strong>AF1 Ktulu Sync</strong>: it checks on open, builds the activations (pages + card journey), and syncs live every 20 seconds while it is open.</li>
        </ol>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={() => void mint()}>{tokenAt ? "Create a new plugin token" : "Figma plugin token"}</button>
          {tokenAt && !token && <span style={{ color: "var(--muted)", fontSize: 12 }}>Token created {when(tokenAt)}. A new one replaces it.</span>}
          {token && <code style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, userSelect: "all" }}>{token}</code>}
        </div>
      </div>

      {s && s.log.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 14, color: "var(--fg)" }}>History</h2>
          {s.log.slice(0, 10).map((l, i) => (
            <div key={i}>{when(l.at)} · {l.by} · {l.summary}</div>
          ))}
        </div>
      )}
    </div>
  );
}
