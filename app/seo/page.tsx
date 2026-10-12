"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Table, type TableColumn } from "@/components/ui/table-editable";
import { validateSeoField } from "@/lib/seoBrand";
import EditPanel from "./EditPanel";
import Modal from "@/app/components/Modal";
import { SideButton, SideSection, useSidebarContent } from "@/app/components/SidebarSlot";
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
  seoTitle: string; // EN
  seoDescription: string; // EN
  seoTitleDe: string;
  seoDescriptionDe: string;
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
  const [tab, setTab] = useState<"all" | "missing" | "drafts" | "published">("all");
  useEffect(() => {
    const m = searchParams?.get("missing") === "1";
    setOnlyMissing(m);
    if (m) setTab("missing");
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
        if (tab === "missing" && !isMissing(item)) return false;
        if (tab === "drafts" && item.status !== "draft") return false;
        if (tab === "published" && item.status !== "published") return false;
        if (!q) return true;
        const en = merged(item, "en");
        const de = merged(item, "de");
        return (
          item.internalTitle.toLowerCase().includes(q) ||
          item.slug.toLowerCase().includes(q) ||
          en.title.toLowerCase().includes(q) ||
          en.description.toLowerCase().includes(q) ||
          de.title.toLowerCase().includes(q) ||
          de.description.toLowerCase().includes(q)
        );
      })
      .map((item) => {
        const meta = merged(item, "en");
        const metaDe = merged(item, "de");
        const key = rowKey(item);
        const e = edits[key];
        return {
          key,
          item,
          status: item.status,
          publishedDate: item.publishedDate ? item.publishedDate.slice(0, 10) : "",
          internalTitle: item.internalTitle,
          url: item.urls.en,
          seoTitle: meta.title,
          seoDescription: meta.description,
          seoTitleDe: metaDe.title,
          seoDescriptionDe: metaDe.description,
          missing: isMissing(item),
          dirty: Boolean(e?.en?.title !== undefined || e?.en?.description !== undefined || e?.de?.title !== undefined || e?.de?.description !== undefined),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, locale, collectionFilter, onlyMissing, tab, edits]);

  const dirtyKeys = useMemo(() => Object.keys(edits), [edits]);

  // EN and DE are both in the table (one view, so a missing language is
  // visible by scrolling); the column key says which locale an edit is for.
  const CELL_FIELDS: Record<string, { loc: Locale; field: "title" | "description" }> = {
    seoTitle: { loc: "en", field: "title" },
    seoDescription: { loc: "en", field: "description" },
    seoTitleDe: { loc: "de", field: "title" },
    seoDescriptionDe: { loc: "de", field: "description" },
  };
  function onCellEdit(id: string, columnKey: string, value: string) {
    const f = CELL_FIELDS[columnKey];
    if (!f) return;
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [f.loc]: { ...prev[id]?.[f.loc], [f.field]: value } },
    }));
  }

  // Writes every row with unsaved inline edits to the CMS — as drafts, or
  // published (publication date untouched, same two-step path as the edit
  // panel). No Claude involved: Claude only writes text, the tool publishes.
  // Rows whose text breaks a hard brand rule are reported, not forced.
  const [confirmPublish, setConfirmPublish] = useState(false);
  // Which rows the confirm overlay is about: all edited rows, or only the
  // selected ones when the smart top button was used on a selection.
  const [publishKeys, setPublishKeys] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; action: "draft" | "publish"; current: string } | null>(null);
  async function saveDrafts() {
    return writeEdits("draft");
  }
  // Refs so the memoised table cells (per-row Publish) always see the live
  // list and edits, not the closure from the first render.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const dirtyRef = useRef(dirtyKeys);
  dirtyRef.current = dirtyKeys;
  async function writeEdits(action: "draft" | "publish", onlyKeys?: string[], _allowClean = false) {
    const items = itemsRef.current;
    const keys = onlyKeys ?? dirtyRef.current;
    if (!items || keys.length === 0) return;
    setConfirmPublish(false);
    setSaving(true);
    setNotice(null);
    const failures: string[] = [];
    let saved = 0;
    let n = 0;
    for (const key of keys) {
      const item = items.find((i) => rowKey(i) === key);
      if (!item) continue;
      setProgress({ done: n++, total: keys.length, action, current: item.internalTitle });
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
  const [srLang, setSrLang] = useState<"en" | "de" | "both">("both");
  const srHit = (r: Row) => {
    if (!srFind) return false;
    const fields: string[] = [];
    if (srLang !== "de") {
      if (srScope !== "description") fields.push(r.seoTitle);
      if (srScope !== "title") fields.push(r.seoDescription);
    }
    if (srLang !== "en") {
      if (srScope !== "description") fields.push(r.seoTitleDe);
      if (srScope !== "title") fields.push(r.seoDescriptionDe);
    }
    return fields.some((f) => f.includes(srFind));
  };
  const srMatches = useMemo(() => rows.filter(srHit).length, [rows, srFind, srScope, srLang]); // eslint-disable-line react-hooks/exhaustive-deps
  function applyReplace() {
    if (!srFind) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        const apply = (loc: Locale, title: string, description: string) => {
          const patch: Partial<SeoLocaleMeta> = {};
          if (srScope !== "description" && title.includes(srFind)) patch.title = title.split(srFind).join(srReplace);
          if (srScope !== "title" && description.includes(srFind)) patch.description = description.split(srFind).join(srReplace);
          if (Object.keys(patch).length) next[r.key] = { ...next[r.key], [loc]: { ...next[r.key]?.[loc], ...patch } };
        };
        if (srLang !== "de") apply("en", r.seoTitle, r.seoDescription);
        if (srLang !== "en") apply("de", r.seoTitleDe, r.seoDescriptionDe);
      }
      return next;
    });
    setNotice(`Replaced in ${srMatches} row${srMatches === 1 ? "" : "s"}. Not in the CMS yet: Save drafts or Publish edited.`);
  }

  const selectedParam = selectedIds.join(",");

  // Column visibility: a per-browser choice (localStorage). The two
  // character-count columns start hidden; the counts still colour the edit
  // panel and the validation, this is only about table real estate.
  const COLUMN_LABELS: Record<string, string> = {
    status: "Status",
    publishedDate: "Published",
    internalTitle: "Title",
    seoTitle: "SEO Title (EN)",
    seoTitleCount: "SEO Title length",
    seoDescription: "SEO Description (EN)",
    seoTitleDe: "SEO Title (DE)",
    seoTitleDeCount: "SEO Title (DE) length",
    seoDescriptionDe: "SEO Description (DE)",
    seoDescriptionDeCount: "SEO Description (DE) length",
    seoDescriptionCount: "SEO Description length",
    actions: "Actions",
  };
  const DEFAULT_HIDDEN = ["seoTitleCount", "seoDescriptionCount", "seoTitleDeCount", "seoDescriptionDeCount"];
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
      { key: "seoTitle", header: "SEO Title · EN", width: "1fr", editable: true },
      {
        key: "seoTitleCount",
        header: "#",
        width: "48px",
        align: "right",
        sortable: true,
        sortValue: (r) => r.seoTitle.length,
        cell: (r) => <Count n={r.seoTitle.length} kind="title" />,
      },
      { key: "seoDescription", header: "SEO Description · EN", width: "1.4fr", editable: true },
      { key: "seoTitleDe", header: "SEO Title · DE", width: "1fr", editable: true },
      {
        key: "seoTitleDeCount",
        header: "#",
        width: "48px",
        align: "right",
        sortable: true,
        sortValue: (r) => r.seoTitleDe.length,
        cell: (r) => <Count n={r.seoTitleDe.length} kind="title" />,
      },
      { key: "seoDescriptionDe", header: "SEO Description · DE", width: "1.4fr", editable: true },
      {
        key: "seoDescriptionDeCount",
        header: "#",
        width: "48px",
        align: "right",
        sortable: true,
        sortValue: (r) => r.seoDescriptionDe.length,
        cell: (r) => <Count n={r.seoDescriptionDe.length} kind="description" />,
      },
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
            {r.dirty || r.status === "draft" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void writeEdits("publish", [r.key], !r.dirty);
                }}
                className="rounded border px-2 py-1 text-[11px]"
                style={{ borderColor: "var(--accent)", background: "rgba(255,45,0,0.12)", color: "#fff" }}
                title={r.dirty ? "Publish this row's edit now (publication date untouched)" : "Publish this draft's current SEO text"}
              >
                Publish
              </button>
            ) : (
              <a
                href={`/api/seo/handoff?collection=${r.item.collection}&id=${r.item.id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-border px-2 py-1 text-[11px] no-underline"
              >
                {r.missing ? "Generate" : "Regenerate"}
              </a>
            )}
          </span>
        ),
      },
    ],
    []
  );
  const columns = useMemo(() => allColumns.filter((c) => !hiddenCols.includes(c.key)), [allColumns, hiddenCols]);

  // Everything the tool can do lives on the left: generate (one smart
  // button), publish, search & replace, columns, language. The header above
  // the table only filters (tabs) and searches.
  const selectedDirty = selectedIds.filter((k) => dirtyKeys.includes(k));
  useSidebarContent(
    <>
      <SideSection title="Generate">
        {selectedDirty.length > 0 ? (
          <SideButton
            primary
            onClick={() => {
              setPublishKeys(selectedDirty);
              setConfirmPublish(true);
            }}
            disabled={saving}
            note={selectedDirty.length}
          >
            Publish selected
          </SideButton>
        ) : selectedIds.length > 0 ? (
          <SideButton primary href={`/api/seo/handoff?items=${encodeURIComponent(selectedParam)}`} note={selectedIds.length}>
            Generate selected
          </SideButton>
        ) : (
          <SideButton primary href="/api/seo/handoff?missing=1" disabled={!missingCount} note={items ? missingCount : ""}>
            Generate missing
          </SideButton>
        )}
        <div style={{ fontSize: 11, color: "var(--muted)", padding: "2px 10px 4px", lineHeight: 1.5 }}>
          {hasConnector ? "Opens claude.ai; Claude writes and publishes, all at once." : hasConnector === false ? "Opens claude.ai; Claude replies with Publish links, 5 per round." : ""}
        </div>
      </SideSection>
      <SideSection title="Edits">
        <SideButton
          onClick={() => {
            setPublishKeys(null);
            setConfirmPublish(true);
          }}
          disabled={dirtyKeys.length === 0 || saving}
          note={dirtyKeys.length || ""}
        >
          Publish edited
        </SideButton>
        <SideButton onClick={saveDrafts} disabled={dirtyKeys.length === 0 || saving} note={dirtyKeys.length || ""}>
          Save as drafts
        </SideButton>
        <SideButton onClick={() => setSrOpen(true)} active={srOpen}>
          Search &amp; replace
        </SideButton>
      </SideSection>
      <SideSection title="View">
        <SideButton onClick={() => setColsOpen(true)} note={`${allColumns.length - hiddenCols.length}/${allColumns.length}`}>
          Columns
        </SideButton>
      </SideSection>
    </>,
    [selectedIds, dirtyKeys, saving, missingCount, items?.length, hasConnector, locale, hiddenCols, srOpen, selectedParam, allColumns]
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
      <section className="page-head reveal">
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Tool · staging</div>
          <h1>SEO Studio</h1>
          <p>
            Meta titles and descriptions for news and pages, EN and DE. Click a title to open it in the CMS, edit inline, publish from the
            row. Claude writes new text; the tool publishes, publication dates stay untouched.
          </p>
        </div>
      </section>

      <section className="reveal reveal-d1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 26 }}>
        {[
          { n: items?.length ?? "–", l: "Docs" },
          { n: items ? missingCount : "–", l: "Missing SEO" },
          { n: items ? items.filter((i) => i.status === "draft").length : "–", l: "Drafts" },
          { n: dirtyKeys.length, l: "Edited here" },
        ].map((st) => (
          <div key={st.l} className="stat">
            <span className="n">{st.n}</span>
            <span className="l">{st.l}</span>
          </div>
        ))}
      </section>

      <section className="reveal reveal-d2" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <div className="tabs" role="tablist">
          {(
            [
              ["all", "All", items?.length ?? 0],
              ["missing", "Missing SEO", items ? missingCount : 0],
              ["drafts", "Drafts", items ? items.filter((i) => i.status === "draft").length : 0],
              ["published", "Published", items ? items.filter((i) => i.status === "published").length : 0],
            ] as const
          ).map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)}>
              {label}
              <span className="count">{n}</span>
            </button>
          ))}
        </div>
        <div className="tabs">
          {(["all", "news", "pages"] as const).map((c) => (
            <button key={c} className={`tab${collectionFilter === c ? " is-active" : ""}`} onClick={() => setCollectionFilter(c)}>
              {c === "all" ? "News + Pages" : c[0].toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 0, flex: 1, minWidth: 300 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, slug, SEO text (EN + DE)…"
            className="input"
            style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          />
          <button
            className="btn"
            onClick={() => {
              if (query && !srFind) setSrFind(query);
              setSrOpen(true);
            }}
            style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1, whiteSpace: "nowrap" }}
            title="Find and replace across the visible rows"
          >
            Replace…
          </button>
        </div>
      </section>

      {confirmPublish && (
        <Modal title={`Publish ${(publishKeys ?? dirtyKeys).length} edited doc${(publishKeys ?? dirtyKeys).length === 1 ? "" : "s"}?`} onClose={() => setConfirmPublish(false)} width={520}>
          <p style={{ fontSize: 13, margin: "0 0 14px", lineHeight: 1.6 }}>
            Writes the edited texts to the CMS and publishes them. Publication dates stay untouched. Texts that break a hard brand rule are skipped
            and listed afterwards.
          </p>
          <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 12, color: "var(--muted)", maxHeight: 160, overflow: "auto" }}>
            {(publishKeys ?? dirtyKeys).map((k) => {
              const it = items?.find((i) => rowKey(i) === k);
              return <li key={k}>{it?.internalTitle ?? k}</li>;
            })}
          </ul>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setConfirmPublish(false)}>
              Keep editing
            </button>
            <button className="btn" onClick={() => writeEdits("draft", publishKeys ?? undefined)}>
              Save as drafts
            </button>
            <button className="btn btn-primary" onClick={() => writeEdits("publish", publishKeys ?? undefined)}>
              {publishKeys ? `Publish ${publishKeys.length} selected` : "Publish all edited"}
            </button>
          </div>
        </Modal>
      )}
      {srOpen && (
        <Modal title="Search & replace" onClose={() => setSrOpen(false)} width={640}>
          <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
              <input className="input" value={srFind} onChange={(e) => setSrFind(e.target.value)} placeholder="Find" autoFocus />
              <span style={{ color: "var(--muted)" }}>→</span>
              <input className="input" value={srReplace} onChange={(e) => setSrReplace(e.target.value)} placeholder="Replace with" />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select className="input" value={srScope} onChange={(e) => setSrScope(e.target.value as typeof srScope)}>
                <option value="both">Title + Description</option>
                <option value="title">SEO Title only</option>
                <option value="description">SEO Description only</option>
              </select>
              <select className="input" value={srLang} onChange={(e) => setSrLang(e.target.value as typeof srLang)}>
                <option value="both">EN + DE</option>
                <option value="en">EN only</option>
                <option value="de">DE only</option>
              </select>
              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                {srFind ? `${srMatches} of ${rows.length} visible rows match` : `Matches the ${rows.length} visible rows, case-sensitive`}
              </span>
            </div>
            {srFind && srMatches > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--muted)", maxHeight: 140, overflow: "auto" }}>
                {rows
                  .filter(srHit)
                  .slice(0, 30)
                  .map((r) => (
                    <li key={r.key}>{r.internalTitle}</li>
                  ))}
              </ul>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 4 }}>
              {dirtyKeys.length > 0 && (
                <span style={{ fontSize: 12, color: "var(--muted)", marginRight: "auto" }}>
                  {dirtyKeys.length} doc{dirtyKeys.length === 1 ? "" : "s"} edited, not in the CMS yet
                </span>
              )}
              <button className="btn" onClick={() => setSrOpen(false)}>
                Close
              </button>
              <button className="btn" onClick={applyReplace} disabled={!srFind || srMatches === 0}>
                Replace in {srMatches} row{srMatches === 1 ? "" : "s"}
              </button>
              <button
                className="btn btn-primary"
                disabled={dirtyKeys.length === 0}
                onClick={() => {
                  setSrOpen(false);
                  setPublishKeys(null);
                  setConfirmPublish(true);
                }}
              >
                Publish edited ({dirtyKeys.length})
              </button>
            </div>
          </div>
        </Modal>
      )}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "var(--muted)" }}>
          <span>
            {rows.length} of {items.length}
            {selectedIds.length ? ` · ${selectedIds.length} selected` : ""}
          </span>
          <span>EN + DE</span>
        </div>
      )}
      {colsOpen && (
        <Modal title="Columns" onClose={() => setColsOpen(false)} width={380}>
          <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
            {allColumns.map((c) => (
              <label key={c.key} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={!hiddenCols.includes(c.key)} onChange={() => toggleCol(c.key)} style={{ accentColor: "#ff2d00" }} />
                {COLUMN_LABELS[c.key] ?? c.key}
              </label>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button className="btn" onClick={() => { setHiddenCols([]); try { localStorage.setItem("seo:hiddenCols", "[]"); } catch {} }}>
                Show all
              </button>
              <button className="btn btn-primary" onClick={() => setColsOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </Modal>
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
