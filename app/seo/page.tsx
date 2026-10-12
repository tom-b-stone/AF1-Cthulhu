"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Table, type TableColumn } from "@/components/ui/table-editable";
import { validateSeoField } from "@/lib/seoBrand";
import EditPanel from "./EditPanel";
import type { SeoListItem, SeoLocaleMeta } from "./types";

type Locale = "en" | "de";

// A doc counts as "missing" when either language's SEO title or description
// is blank — Tom's call, so partial gaps still get picked up.
function isMissing(item: SeoListItem): boolean {
  return !item.en.title || !item.en.description || !item.de.title || !item.de.description;
}

const rowKey = (item: { collection: string; id: string }) => `${item.collection}:${item.id}`;

// One table row = one doc in the currently chosen locale, with any unsaved
// inline edits already applied.
type Row = {
  key: string;
  item: SeoListItem;
  status: string;
  publishedDate: string;
  internalTitle: string;
  url: string;
  seoTitle: string;
  seoDescription: string;
  language: string;
  missing: boolean;
  dirty: boolean;
};

type Edits = Record<string, { en?: Partial<SeoLocaleMeta>; de?: Partial<SeoLocaleMeta> }>;

export default function SeoStudioPage() {
  return (
    <Suspense fallback={null}>
      <SeoStudio />
    </Suspense>
  );
}

function SeoStudio() {
  const [items, setItems] = useState<SeoListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const [collectionFilter, setCollectionFilter] = useState<"all" | "news" | "pages">("all");
  const searchParams = useSearchParams();
  const [onlyMissing, setOnlyMissing] = useState(false);
  useEffect(() => {
    setOnlyMissing(searchParams?.get("missing") === "1");
  }, [searchParams]);
  const [selected, setSelected] = useState<SeoListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [edits, setEdits] = useState<Edits>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    setError(null);
    fetch("/api/seo/list")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          return;
        }
        setItems(json.items as SeoListItem[]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(load, []);

  // Refresh when the user comes back from the claude.ai tab / the apply page.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const [hasConnector, setHasConnector] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/connector")
      .then((r) => r.json())
      .then((j) => setHasConnector(Boolean(j.active)))
      .catch(() => setHasConnector(false));
  }, []);

  const missingCount = useMemo(() => (items ? items.filter(isMissing).length : 0), [items]);

  // Merge an item's saved meta with whatever is typed but not yet saved.
  const merged = (item: SeoListItem, loc: Locale): SeoLocaleMeta => ({
    title: edits[rowKey(item)]?.[loc]?.title ?? item[loc].title,
    description: edits[rowKey(item)]?.[loc]?.description ?? item[loc].description,
  });

  const rows = useMemo<Row[]>(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (collectionFilter !== "all" && item.collection !== collectionFilter) return false;
        if (onlyMissing && !isMissing(item)) return false;
        if (!q) return true;
        const meta = merged(item, locale);
        return (
          item.internalTitle.toLowerCase().includes(q) ||
          item.slug.toLowerCase().includes(q) ||
          meta.title.toLowerCase().includes(q) ||
          meta.description.toLowerCase().includes(q)
        );
      })
      .map((item) => {
        const meta = merged(item, locale);
        const key = rowKey(item);
        const e = edits[key];
        return {
          key,
          item,
          status: item.status,
          publishedDate: item.publishedDate ? item.publishedDate.slice(0, 10) : "",
          internalTitle: item.internalTitle,
          url: item.urls[locale],
          seoTitle: meta.title,
          seoDescription: meta.description,
          language: locale.toUpperCase(),
          missing: isMissing(item),
          dirty: Boolean(e?.en?.title !== undefined || e?.en?.description !== undefined || e?.de?.title !== undefined || e?.de?.description !== undefined),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, locale, collectionFilter, onlyMissing, edits]);

  const dirtyKeys = useMemo(() => Object.keys(edits), [edits]);

  function onCellEdit(id: string, columnKey: string, value: string) {
    if (columnKey !== "seoTitle" && columnKey !== "seoDescription") return;
    const field = columnKey === "seoTitle" ? "title" : "description";
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [locale]: { ...prev[id]?.[locale], [field]: value } },
    }));
  }

  // Writes every row with unsaved inline edits to the CMS — as drafts, or
  // published (publication date untouched, same two-step path as the edit
  // panel). No Claude involved: Claude only writes text, the tool publishes.
  // Rows whose text breaks a hard brand rule are reported, not forced.
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; action: "draft" | "publish"; current: string } | null>(null);
  async function saveDrafts() {
    return writeEdits("draft");
  }
  async function writeEdits(action: "draft" | "publish") {
    if (!items || dirtyKeys.length === 0) return;
    setConfirmPublish(false);
    setSaving(true);
    setNotice(null);
    const failures: string[] = [];
    let saved = 0;
    let n = 0;
    for (const key of dirtyKeys) {
      const item = items.find((i) => rowKey(i) === key);
      if (!item) continue;
      setProgress({ done: n++, total: dirtyKeys.length, action, current: item.internalTitle });
      const en = merged(item, "en");
      const de = merged(item, "de");
      const hard = [
        ...validateSeoField("title", en.title).errors,
        ...validateSeoField("description", en.description).errors,
        ...(de.title ? validateSeoField("title", de.title).errors : []),
        ...(de.description ? validateSeoField("description", de.description).errors : []),
      ];
      if (hard.length) {
        failures.push(`${item.internalTitle}: ${hard[0]}`);
        continue;
      }
      const res = await fetch("/api/seo/doc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: item.collection, id: item.id, action, en, de }),
      });
      if (res.ok) {
        saved++;
        const j = await res.json().catch(() => ({}));
        if (j.dateLine && String(j.dateLine).startsWith("WARNING")) failures.push(`${item.internalTitle}: ${j.dateLine}`);
        setEdits((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        const j = await res.json().catch(() => ({}));
        failures.push(`${item.internalTitle}: ${j.error ?? res.status}`);
      }
    }
    setSaving(false);
    setProgress(null);
    const verb = action === "publish" ? "published, publication dates untouched" : "saved as draft";
    setNotice(`Done. ${saved} doc${saved === 1 ? "" : "s"} ${verb}${failures.length ? `\nNot written: ${failures.length}\n${failures.join("\n")}` : "."}`);
    load();
  }

  // Search & replace across the visible rows' SEO title/description for the
  // current locale. Only touches local edits — nothing reaches the CMS until
  // "Save drafts" / "Publish edited". Case-sensitive, plain text.
  const [srOpen, setSrOpen] = useState(false);
  const [srFind, setSrFind] = useState("");
  const [srReplace, setSrReplace] = useState("");
  const [srScope, setSrScope] = useState<"both" | "title" | "description">("both");
  const srMatches = useMemo(() => {
    if (!srFind) return 0;
    return rows.reduce((n, r) => {
      const t = srScope !== "description" && r.seoTitle.includes(srFind) ? 1 : 0;
      const d = srScope !== "title" && r.seoDescription.includes(srFind) ? 1 : 0;
      return n + (t || d ? 1 : 0);
    }, 0);
  }, [rows, srFind, srScope]);
  function applyReplace() {
    if (!srFind) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        const patch: Partial<SeoLocaleMeta> = {};
        if (srScope !== "description" && r.seoTitle.includes(srFind)) patch.title = r.seoTitle.split(srFind).join(srReplace);
        if (srScope !== "title" && r.seoDescription.includes(srFind)) patch.description = r.seoDescription.split(srFind).join(srReplace);
        if (Object.keys(patch).length) next[r.key] = { ...next[r.key], [locale]: { ...next[r.key]?.[locale], ...patch } };
      }
      return next;
    });
    setNotice(`Replaced in ${srMatches} row${srMatches === 1 ? "" : "s"} (${locale.toUpperCase()}). Not in the CMS yet: Save drafts or Publish edited.`);
  }

  const selectedParam = selectedIds.join(",");

  // Column visibility: a per-browser choice (localStorage). The two
  // character-count columns start hidden; the counts still colour the edit
  // panel and the validation, this is only about table real estate.
  const COLUMN_LABELS: Record<string, string> = {
    status: "Status",
    publishedDate: "Published",
    internalTitle: "Title",
    seoTitle: "SEO Title",
    seoTitleCount: "SEO Title length",
    seoDescription: "SEO Description",
    seoDescriptionCount: "SEO Description length",
    actions: "Actions",
  };
  const DEFAULT_HIDDEN = ["seoTitleCount", "seoDescriptionCount"];
  const [hiddenCols, setHiddenCols] = useState<string[]>(DEFAULT_HIDDEN);
  const [colsOpen, setColsOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("seo:hiddenCols");
      if (saved) setHiddenCols(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);
  function toggleCol(key: string) {
    setHiddenCols((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem("seo:hiddenCols", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const allColumns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: "status",
        header: "Status",
        width: "96px",
        sortable: true,
        cell: (r) => (
          <span
            className="rounded-full px-2 py-0.5 text-[11px]"
            style={{ background: r.status === "published" ? "#1e3a24" : "#333", color: r.status === "published" ? "#6fcf7c" : "#ccc" }}
          >
            {r.status}
          </span>
        ),
      },
      { key: "publishedDate", header: "Published", width: "96px", sortable: true, cell: (r) => <span className="tabular-nums">{r.publishedDate || "—"}</span> },
      {
        key: "internalTitle",
        header: "Title",
        width: "200px",
        sortable: true,
        cell: (r) => (
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-medium hover:underline"
            title={`${r.internalTitle} — open in CMS`}
            onClick={(e) => e.stopPropagation()}
          >
            {r.dirty ? <span style={{ color: "var(--accent)" }}>● </span> : null}
            {r.internalTitle}
          </a>
        ),
      },
      { key: "seoTitle", header: "SEO Title", width: "1fr", editable: true },
      {
        key: "seoTitleCount",
        header: "#",
        width: "48px",
        align: "right",
        sortable: true,
        sortValue: (r) => r.seoTitle.length,
        cell: (r) => <Count n={r.seoTitle.length} kind="title" />,
      },
      { key: "seoDescription", header: "SEO Description", width: "1.6fr", editable: true },
      {
        key: "seoDescriptionCount",
        header: "#",
        width: "48px",
        align: "right",
        sortable: true,
        sortValue: (r) => r.seoDescription.length,
        cell: (r) => <Count n={r.seoDescription.length} kind="description" />,
      },
      {
        key: "actions",
        header: "",
        width: "140px",
        cell: (r) => (
          <span className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelected(r.item);
              }}
              className="rounded border border-border bg-transparent px-2 py-1 text-[11px] text-foreground"
            >
              Edit
            </button>
            <a
              href={`/api/seo/handoff?collection=${r.item.collection}&id=${r.item.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-border px-2 py-1 text-[11px] no-underline"
            >
              {r.missing ? "Generate" : "Regenerate"}
            </a>
          </span>
        ),
      },
    ],
    []
  );
  const columns = useMemo(() => allColumns.filter((c) => !hiddenCols.includes(c.key)), [allColumns, hiddenCols]);

  const input = {
    background: "#161617",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 13,
  } as const;

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>SEO Studio</h1>
      <p style={{ opacity: 0.6, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Staging only. Reads and writes go straight to Payload, never to the Google Sheet. Click a title to open it in
        the CMS, type into SEO Title / Description to edit inline (or use Search &amp; replace), then Save drafts or
        Publish edited. Claude is only needed to write new text; publishing never needs it.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <a
          href="/api/seo/handoff?missing=1"
          target="_blank"
          rel="noreferrer"
          style={{ padding: "8px 14px", borderRadius: 6, background: missingCount ? "var(--accent)" : "#333", color: "#fff", fontSize: 13, whiteSpace: "nowrap", textDecoration: "none", pointerEvents: missingCount ? "auto" : "none" }}
        >
          Generate missing {items ? `(${missingCount} left${hasConnector ? ", all at once" : hasConnector === false ? ", 5 per round" : ""})` : ""}
        </a>
        {selectedIds.length > 0 && (
          <a
            href={`/api/seo/handoff?items=${encodeURIComponent(selectedParam)}`}
            target="_blank"
            rel="noreferrer"
            style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--accent)", color: "var(--fg)", fontSize: 13, whiteSpace: "nowrap", textDecoration: "none" }}
          >
            Generate selected ({selectedIds.length})
          </a>
        )}
        {dirtyKeys.length > 0 && (
          <>
            <button
              onClick={saveDrafts}
              disabled={saving}
              style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "none", color: "var(--fg)", fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Saving…" : `Save ${dirtyKeys.length} draft${dirtyKeys.length === 1 ? "" : "s"}`}
            </button>
            <button
              onClick={() => setConfirmPublish(true)}
              disabled={saving}
              style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--accent)", background: "none", color: "var(--fg)", fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              Publish edited ({dirtyKeys.length})
            </button>
          </>
        )}
        <button
          onClick={() => setSrOpen((o) => !o)}
          style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)", background: srOpen ? "#1b1b1d" : "none", color: "var(--fg)", fontSize: 13, cursor: "pointer" }}
        >
          Search &amp; replace
        </button>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {hasConnector
            ? "Generate opens claude.ai; Claude writes and publishes (publication date unchanged)."
            : "Generate opens claude.ai; Claude replies with a Publish link. "}
          {!hasConnector && (
            <>
              With the <Link href="/connector">Claude connector</Link> it publishes directly.
            </>
          )}
        </span>
      </div>

      {confirmPublish && (
        <div style={{ background: "#141416", border: "1px solid var(--accent)", borderRadius: 8, padding: "12px 14px", margin: "0 0 12px", fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>
            Publish {dirtyKeys.length} edited doc{dirtyKeys.length === 1 ? "" : "s"} to the CMS now? Publication dates stay untouched. Texts that
            break a hard brand rule are skipped and listed.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => writeEdits("publish")} style={{ padding: "6px 12px", borderRadius: 6, background: "var(--accent)", border: "none", color: "#fff", fontSize: 12, cursor: "pointer" }}>
              Publish all edited
            </button>
            <button onClick={() => setConfirmPublish(false)} style={{ padding: "6px 12px", borderRadius: 6, background: "none", border: "1px solid var(--border)", color: "var(--fg)", fontSize: 12, cursor: "pointer" }}>
              Keep editing
            </button>
          </div>
        </div>
      )}
      {srOpen && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "#141416", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", margin: "0 0 12px", fontSize: 13 }}>
          <input value={srFind} onChange={(e) => setSrFind(e.target.value)} placeholder="Find" style={{ ...input, padding: "6px 10px", width: 220 }} />
          <span style={{ opacity: 0.5 }}>→</span>
          <input value={srReplace} onChange={(e) => setSrReplace(e.target.value)} placeholder="Replace with" style={{ ...input, padding: "6px 10px", width: 220 }} />
          <select value={srScope} onChange={(e) => setSrScope(e.target.value as typeof srScope)} style={{ ...input, padding: "6px 10px" }}>
            <option value="both">Title + Description</option>
            <option value="title">SEO Title only</option>
            <option value="description">SEO Description only</option>
          </select>
          <span style={{ opacity: 0.6, fontSize: 12 }}>
            {srFind ? `${srMatches} of ${rows.length} visible rows match (${locale.toUpperCase()})` : "Matches the visible rows in the current language"}
          </span>
          <button
            onClick={applyReplace}
            disabled={!srFind || srMatches === 0}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--accent)", background: "none", color: "var(--fg)", fontSize: 12, cursor: srMatches ? "pointer" : "default", opacity: srMatches ? 1 : 0.5 }}
          >
            Replace in {srMatches} row{srMatches === 1 ? "" : "s"}
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, slug, SEO title/description…" style={{ ...input, flex: 1 }} />
        <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value as typeof collectionFilter)} style={{ ...input, padding: "8px 10px" }}>
          <option value="all">All</option>
          <option value="news">News</option>
          <option value="pages">Pages</option>
        </select>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", opacity: 0.8 }}>
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          only missing
        </label>
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          {(["en", "de"] as Locale[]).map((loc) => (
            <button
              key={loc}
              onClick={() => setLocale(loc)}
              style={{ padding: "8px 14px", background: locale === loc ? "var(--accent)" : "none", color: locale === loc ? "#fff" : "var(--fg)", border: "none", cursor: "pointer", fontSize: 13 }}
            >
              {loc.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ color: "#e06c5b", marginBottom: 16, fontSize: 13 }}>Couldn&apos;t load the list: {error}</div>}
      {progress && (
        <div
          role="status"
          style={{ background: "#141416", border: "1px solid var(--vapor-purple)", borderRadius: 8, padding: "10px 14px", margin: "0 0 12px", fontSize: 13 }}
        >
          {progress.action === "publish" ? "Publishing" : "Saving drafts"} {progress.done + 1} of {progress.total}: {progress.current}
          <div style={{ height: 4, background: "#2a2a2d", borderRadius: 2, marginTop: 8 }}>
            <div style={{ height: 4, width: `${Math.round(((progress.done + 1) / progress.total) * 100)}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.2s" }} />
          </div>
        </div>
      )}
      {notice && (
        <div
          role="status"
          style={{
            background: notice.includes("WARNING") || notice.includes("Not written") ? "#2a1512" : "#122a18",
            border: `1px solid ${notice.includes("WARNING") || notice.includes("Not written") ? "#c0392b" : "#2e7d4f"}`,
            borderRadius: 8,
            padding: "10px 14px",
            margin: "0 0 12px",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.6, fontSize: 14, lineHeight: 1 }}>
            ×
          </button>
        </div>
      )}

      {items && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
          <span style={{ opacity: 0.5 }}>
            {rows.length} of {items.length}
            {selectedIds.length ? ` · ${selectedIds.length} selected` : ""}
          </span>
          <span style={{ position: "relative" }}>
            <button
              onClick={() => setColsOpen((o) => !o)}
              style={{ background: "none", border: "1px solid var(--border)", color: "inherit", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", opacity: 0.8 }}
            >
              Columns{hiddenCols.length ? ` (${allColumns.length - hiddenCols.length}/${allColumns.length})` : ""}
            </button>
            {colsOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 20,
                  background: "#141416",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  minWidth: 220,
                  boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
                }}
              >
                {allColumns.map((c) => (
                  <label key={c.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", cursor: "pointer", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={!hiddenCols.includes(c.key)} onChange={() => toggleCol(c.key)} />
                    {COLUMN_LABELS[c.key] ?? c.key}
                  </label>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, opacity: 0.6 }}>
                  <button onClick={() => { setHiddenCols([]); try { localStorage.setItem("seo:hiddenCols", "[]"); } catch {} }} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 11, padding: 0 }}>
                    Show all
                  </button>
                  <button onClick={() => setColsOpen(false)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 11, padding: 0 }}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </span>
        </div>
      )}

      <div className="beui beui-compact">
      <Table<Row>
        data={rows}
        columns={columns}
        getRowId={(r) => r.key}
        selectable
        selectedRowIds={selectedIds}
        onSelectionChange={setSelectedIds}
        resizable
        reorderable
        defaultSort={{ key: "publishedDate", direction: "desc" }}
        onCellEdit={onCellEdit}
        height={Math.max(360, typeof window !== "undefined" ? window.innerHeight - 280 : 600)}
        rowHeight={36}
        loading={!items && !error}
        emptyState="Nothing matches."
        className="rounded-lg border border-border"
      />
      </div>

      {selected && (
        <EditPanel
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={(msg) => {
            setSelected(null);
            setNotice(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

function Count({ n, kind }: { n: number; kind: "title" | "description" }) {
  const ok = kind === "title" ? n >= 50 && n <= 60 : n >= 100 && n <= 150;
  const bad = kind === "title" ? n > 60 : n > 160;
  const color = n === 0 ? "#666" : bad ? "#e06c5b" : ok ? "#6fcf7c" : "#c9a227";
  return (
    <span className="tabular-nums" style={{ color }}>
      {n}
    </span>
  );
}
