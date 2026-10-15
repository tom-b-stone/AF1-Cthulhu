"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bookStore } from "@/lib/photobookStore";
import type { Book } from "@/lib/photobook";
import { newId } from "@/lib/batchStore";

// Photobook (prototype): after a Grand Prix the team turns its SlashLens
// selection into a printable 16-page mini book (two A4 sheets) plus a fan
// microsite (draft page on the staging CMS) and a share page for the QR.
export default function PhotobookList() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[] | null>(null);
  useEffect(() => {
    bookStore.list().then(setBooks);
  }, []);

  async function create() {
    const now = new Date().toISOString();
    const b: Book = {
      id: newId(),
      slug: "",
      createdAt: now,
      updatedAt: now,
      gpName: "",
      city: "",
      loc: "",
      year: new Date().getFullYear(),
      dateLabel: "",
      hashtags: ["#ARF1"],
      instagram: "audif1",
      source: "",
      photos: [],
      order: [],
    };
    await bookStore.put(b);
    router.push(`/photobook/${b.id}`);
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <section className="page-head reveal">
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>GP Mini-Zine · prototype</div>
          <h1>GP Mini-Zine</h1>
          <p>
            The SlashLens selection of a Grand Prix becomes a printable 16-page GP Mini-Zine (two A4 sheets, one cut each, no glue) with a QR
            code on the back, plus a fan page on the staging CMS to download it.
          </p>
        </div>
        <button className="btn btn-primary" onClick={create}>
          New photobook
        </button>
      </section>

      {books === null && <p style={{ color: "var(--muted)" }}>Loading…</p>}
      {books?.length === 0 && <div className="card" style={{ padding: 18, color: "var(--muted)", fontSize: 13 }}>No photobooks yet. Books live in this browser until a page is published to the CMS.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {books?.map((b) => (
          <Link key={b.id} href={`/photobook/${b.id}`} className="card reveal" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", textDecoration: "none", color: "inherit" }}>
            <span>
              <strong style={{ fontFamily: "var(--font-heading)" }}>{b.gpName || "Untitled zine"}</strong>
              <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 10 }}>
                {b.photos.length} photos{b.stagingPageUrl ? " · page on staging" : ""}
              </span>
            </span>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{new Date(b.updatedAt).toLocaleString("en-GB")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
