"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [items, setItems] = useState<SeoListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const [collectionFilter, setCollectionFilter] = useState<"all" | "news" | "pages">("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
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

  // Saves every row with unsaved inline edits as a draft (never publishes
  // from here — publishing stays an explicit act in the drawer or via
  // Generate). Rows whose text breaks a hard brand rule are reported, not
  // forced.
  async function saveDrafts() {
    if (!items || dirtyKeys.length === 0) return;
    setSaving(true);
    const failures: string[] = [];
    let saved = 0;
    for (const key of dirtyKeys) {
      const item = items.find((i) => rowKey(i) === key);
      if (!item) continue;
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
        body: JSON.stringify({ collection: item.collection, id: item.id, action: "draft", en, de }),
      });
      if (res.ok) {
        saved++;
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
    setNotice(`${saved} draft${saved === 1 ? "" : "s"} saved${failures.length ? `, ${failures.length} not saved:\n${failures.join("\n")}` : "."}`);
    load();
  }

  const selectedParam = selectedIds.join(",");

  const columns = useMemo<TableColumn<Row>[]>(
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
        the CMS, type into SEO Title / Description to edit inline, then Save drafts.
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
          <button
            onClick={saveDrafts}
            disabled={saving}
            style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "none", color: "var(--fg)", fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : `Save ${dirtyKeys.length} draft${dirtyKeys.length === 1 ? "" : "s"}`}
          </button>
        )}
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
      {notice && (
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10, whiteSpace: "pre-wrap" }}>
          {notice}{" "}
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.6 }}>
            ×
          </button>
        </div>
      )}

      {items && (
        <p style={{ opacity: 0.5, fontSize: 12, marginBottom: 8 }}>
          {rows.length} of {items.length}
          {selectedIds.length ? ` · ${selectedIds.length} selected` : ""}
        </p>
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
