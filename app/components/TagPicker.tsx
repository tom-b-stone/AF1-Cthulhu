"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ContentTag } from "@/lib/contentTags";

// Chip input for content tags. Type to filter the CMS vocabulary, Enter or
// click to add; a title that does not exist yet can be created on the spot
// (it is created on staging immediately, so it is real before the upload).
// `locked` chips are shown but cannot be removed here (the batch tags inside
// a single photo's dialog).
export default function TagPicker({
  value,
  available,
  locked = [],
  suggestions = [],
  onChange,
  onCreate,
  placeholder = "Add a tag…",
  compact = false,
}: {
  value: string[];
  available: ContentTag[];
  locked?: string[];
  suggestions?: string[];
  onChange: (next: string[]) => void;
  onCreate?: (title: string) => Promise<ContentTag | null>;
  placeholder?: string;
  compact?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const titles = useMemo(() => available.map((t) => t.title), [available]);
  const shown = useMemo(() => [...locked, ...value.filter((v) => !locked.includes(v))], [locked, value]);
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    const pool = titles.filter((t) => !shown.includes(t) && !/do not use|wip/.test(t));
    if (!n) return pool.slice(0, 12);
    const starts = pool.filter((t) => t.startsWith(n));
    const inc = pool.filter((t) => !t.startsWith(n) && t.includes(n));
    return [...starts, ...inc].slice(0, 12);
  }, [q, titles, shown]);
  const canCreate = Boolean(onCreate) && q.trim().length >= 2 && !titles.some((t) => t === q.trim().toLowerCase()) && !creating;
  const options = [...matches, ...(canCreate ? [`__create__`] : [])];
  const openSuggestions = suggestions.filter((s) => !shown.includes(s) && titles.includes(s));

  useEffect(() => {
    setHi(0);
  }, [q]);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function add(t: string) {
    if (!t || shown.includes(t)) return;
    onChange([...value.filter((v) => !locked.includes(v)), t]);
    setQ("");
  }
  function remove(t: string) {
    if (locked.includes(t)) return;
    onChange(value.filter((v) => v !== t));
  }
  async function create() {
    if (!onCreate || !canCreate) return;
    setCreating(true);
    const made = await onCreate(q.trim().toLowerCase());
    setCreating(false);
    if (made) add(made.title);
  }
  async function pick(opt: string) {
    if (opt === "__create__") await create();
    else add(opt);
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          padding: compact ? "4px 6px" : "6px 8px",
          border: "1px solid var(--border-2)",
          background: "var(--bg-2)",
          borderRadius: 8,
          minHeight: compact ? 32 : 38,
        }}
        onClick={() => setOpen(true)}
      >
        {shown.map((t) => {
          const isLocked = locked.includes(t);
          return (
            <span
              key={t}
              title={isLocked ? "Batch tag: applies to every image (change it in Step 4)" : t}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 12,
                lineHeight: "18px",
                background: isLocked ? "rgba(255,255,255,0.05)" : t.startsWith("gp | ") ? "rgba(255,45,0,0.14)" : "var(--surface)",
                border: `1px solid ${isLocked ? "var(--border)" : t.startsWith("gp | ") ? "rgba(255,45,0,0.5)" : "var(--border-2)"}`,
                color: isLocked ? "var(--muted)" : "var(--fg)",
              }}
            >
              {t}
              {!isLocked && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(t);
                  }}
                  aria-label={`Remove ${t}`}
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1, opacity: 0.6 }}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={async (e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (options[hi]) await pick(options[hi]);
            } else if (e.key === "Escape") setOpen(false);
            else if (e.key === "Backspace" && !q && value.length) remove(value[value.length - 1]);
          }}
          placeholder={shown.length ? "" : placeholder}
          style={{ flex: 1, minWidth: 120, background: "transparent", border: "none", outline: "none", color: "var(--fg)", fontSize: 13, padding: "2px 4px" }}
        />
      </div>
      {openSuggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Suggested:</span>
          {openSuggestions.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, border: "1px dashed var(--border-2)", background: "transparent", color: "var(--fg)", cursor: "pointer" }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      {open && options.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 30,
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 4,
            maxHeight: 260,
            overflow: "auto",
            listStyle: "none",
            padding: 4,
            background: "var(--surface)",
            border: "1px solid var(--border-2)",
            borderRadius: 8,
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
          }}
        >
          {options.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={i === hi}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                void pick(opt);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
                background: i === hi ? "rgba(255,255,255,0.07)" : "transparent",
                color: opt === "__create__" ? "var(--vapor-rose)" : "var(--fg)",
              }}
            >
              {opt === "__create__" ? (creating ? "Creating…" : `Create "${q.trim().toLowerCase()}" on staging`) : opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
