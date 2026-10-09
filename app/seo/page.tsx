"use client";

import { useEffect, useMemo, useState } from "react";
import EditPanel from "./EditPanel";
import type { SeoListItem } from "./types";

type Locale = "en" | "de";

// A doc counts as "missing" (for both the row button label and the bulk
// Generate missing button) when either language's SEO title or description
// is blank — Tom's call, so partial gaps (DE written but EN empty, etc.)
// still get picked up.
function isMissing(item: SeoListItem): boolean {
  return !item.en.title || !item.en.description || !item.de.title || !item.de.description;
}

export default function SeoStudioPage() {
  const [items, setItems] = useState<SeoListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const [collectionFilter, setCollectionFilter] = useState<"all" | "news" | "pages">("all");
  const [selected, setSelected] = useState<SeoListItem | null>(null);

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

  // Refresh when the user comes back from the claude.ai tab / the apply page
  // so a freshly published title shows up without a manual reload.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const missingCount = useMemo(() => (items ? items.filter(isMissing).length : 0), [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (collectionFilter !== "all" && item.collection !== collectionFilter) return false;
      if (!q) return true;
      const meta = item[locale];
      return (
        item.internalTitle.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        meta.title.toLowerCase().includes(q) ||
        meta.description.toLowerCase().includes(q)
      );
    });
  }, [items, query, locale, collectionFilter]);

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>SEO Studio</h1>
      <p style={{ opacity: 0.6, fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        Staging only (staging.audif1team.com). Reads and writes go straight to Payload — this trial doesn&apos;t
        touch the AF1-SEO Google Sheet.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
        <a
          href="/api/seo/handoff?missing=1"
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            background: missingCount ? "var(--accent)" : "#333",
            color: "#fff",
            fontSize: 13,
            whiteSpace: "nowrap",
            textDecoration: "none",
            pointerEvents: missingCount ? "auto" : "none",
          }}
        >
          Generate missing {items ? `(${missingCount} left, 3 per round)` : ""}
        </a>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          Opens claude.ai with the page content pre-filled. Press send there; Claude replies with a link that publishes
          the text here (publication date unchanged).
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, slug, SEO title/description…"
          style={{
            flex: 1,
            background: "#161617",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
          }}
        />
        <select
          value={collectionFilter}
          onChange={(e) => setCollectionFilter(e.target.value as typeof collectionFilter)}
          style={{ background: "#161617", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px" }}
        >
          <option value="all">All</option>
          <option value="news">News</option>
          <option value="pages">Pages</option>
        </select>
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          {(["en", "de"] as Locale[]).map((loc) => (
            <button
              key={loc}
              onClick={() => setLocale(loc)}
              style={{
                padding: "8px 14px",
                background: locale === loc ? "var(--accent)" : "none",
                color: locale === loc ? "#fff" : "var(--fg)",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {loc.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ color: "#e06c5b", marginBottom: 16, fontSize: 13 }}>
          Couldn&apos;t load the list: {error}
        </div>
      )}
      {!items && !error && <p style={{ opacity: 0.6 }}>Loading from staging CMS…</p>}

      {items && (
        <>
          <p style={{ opacity: 0.5, fontSize: 12, marginBottom: 8 }}>
            {filtered.length} of {items.length}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.6, fontSize: 11, textTransform: "uppercase" }}>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  <th style={{ padding: "6px 8px" }}>Published Date</th>
                  <th style={{ padding: "6px 8px" }}>Title</th>
                  <th style={{ padding: "6px 8px" }}>URL</th>
                  <th style={{ padding: "6px 8px" }}>SEO Title</th>
                  <th style={{ padding: "6px 8px" }}>Count</th>
                  <th style={{ padding: "6px 8px" }}>SEO Description</th>
                  <th style={{ padding: "6px 8px" }}>Count</th>
                  <th style={{ padding: "6px 8px" }}>Language</th>
                  <th style={{ padding: "6px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const meta = item[locale];
                  const url = item.urls[locale];
                  let displayUrl = url;
                  try {
                    displayUrl = new URL(url).pathname;
                  } catch {
                    // keep the full URL if it doesn't parse for some reason
                  }
                  return (
                    <tr
                      key={`${item.collection}:${item.id}`}
                      onClick={() => setSelected(item)}
                      style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
                    >
                      <td style={{ padding: "8px" }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: item.status === "published" ? "#1e3a24" : "#333",
                            color: item.status === "published" ? "#6fcf7c" : "#ccc",
                          }}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                        {item.publishedDate ? item.publishedDate.slice(0, 10) : "—"}
                      </td>
                      <td style={{ padding: "8px", maxWidth: 220 }}>{item.internalTitle}</td>
                      <td style={{ padding: "8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          {displayUrl}
                        </a>
                      </td>
                      <td style={{ padding: "8px", maxWidth: 240 }}>{meta.title || <span style={{ opacity: 0.4 }}>—</span>}</td>
                      <td style={{ padding: "8px" }}>{meta.title.length}</td>
                      <td style={{ padding: "8px", maxWidth: 280 }}>
                        {meta.description || <span style={{ opacity: 0.4 }}>—</span>}
                      </td>
                      <td style={{ padding: "8px" }}>{meta.description.length}</td>
                      <td style={{ padding: "8px" }}>{locale.toUpperCase()}</td>
                      <td style={{ padding: "8px" }}>
                        <a
                          href={`/api/seo/handoff?collection=${item.collection}&id=${item.id}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 4,
                            border: "1px solid var(--border)",
                            color: "var(--fg)",
                            fontSize: 11,
                            whiteSpace: "nowrap",
                            textDecoration: "none",
                          }}
                        >
                          {isMissing(item) ? "Generate SEO title" : "Regenerate"}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && (
        <EditPanel
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
}
