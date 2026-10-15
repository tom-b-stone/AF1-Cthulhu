// Photobook: a printable 16-page mini book per Grand Prix, made from two A4
// sheets. Each sheet is a classic one-cut zine (8 panels of A7, 74.25 × 105
// mm); the second sheet sits inside the first at the centre spread.
// Pure data + layout here (no DOM), shared by the editor, the PDF builder
// and the API routes.

export type BookPhoto = { id: string; name: string; width: number; height: number };

export type Book = {
  id: string;
  slug: string; // e.g. "2026-sin" — share page /p/<slug>
  createdAt: string;
  updatedAt: string;
  round?: number;
  gpName: string; // "Singapore Grand Prix"
  city: string; // "Singapore"
  loc: string; // "SIN"
  year: number;
  dateLabel: string; // "3–5 October 2026"
  hashtags: string[]; // ["#ARF1", "#SingaporeGP"]
  instagram: string; // handle without @
  source: string; // where the photos came from (SlashLens collection name / link)
  photos: BookPhoto[];
  coverId?: string;
  order: string[]; // the 13 inside photos, reading order (book pages 3–15)
  stagingPageId?: string;
  stagingPageUrl?: string;
  pdfUrl?: string;
  coverUrl?: string;
};

export const INSIDE_PHOTOS = 13; // book pages 3–15
export const BOOK_PAGES = 16;

// A4 landscape in PDF points, panel = A4 / (4 × 2)
export const SHEET_W = 841.89;
export const SHEET_H = 595.28;
export const PANEL_W = SHEET_W / 4;
export const PANEL_H = SHEET_H / 2;
// panel raster at 300 dpi (74.25 × 105 mm)
export const PANEL_PX_W = 877;
export const PANEL_PX_H = 1240;

// One-cut zine imposition: where zine page n (1–8) sits on the sheet.
// Top row is printed upside down; the cut runs along the horizontal centre
// line across the two middle columns.
//   top    (rotated): 5 4 3 2
//   bottom (upright): 6 7 8 1
export const ZINE_SLOTS: Record<number, { col: number; row: "top" | "bottom"; rotated: boolean }> = {
  1: { col: 3, row: "bottom", rotated: false },
  2: { col: 3, row: "top", rotated: true },
  3: { col: 2, row: "top", rotated: true },
  4: { col: 1, row: "top", rotated: true },
  5: { col: 0, row: "top", rotated: true },
  6: { col: 0, row: "bottom", rotated: false },
  7: { col: 1, row: "bottom", rotated: false },
  8: { col: 2, row: "bottom", rotated: false },
};

// Two nested zines → book pages. Outer sheet carries 1–4 and 13–16, the
// inner sheet (opened at the outer one's centre spread) carries 5–12.
export const SHEETS: { name: string; bookPages: number[] }[] = [
  { name: "Sheet 1 (outside)", bookPages: [1, 2, 3, 4, 13, 14, 15, 16] },
  { name: "Sheet 2 (inside)", bookPages: [5, 6, 7, 8, 9, 10, 11, 12] },
];

export type PageContent =
  | { kind: "cover"; photoId?: string }
  | { kind: "intro" }
  | { kind: "photo"; photoId?: string; n: number }
  | { kind: "back" };

export function pageContent(book: Book, bookPage: number): PageContent {
  if (bookPage === 1) return { kind: "cover", photoId: book.coverId ?? book.photos[0]?.id };
  if (bookPage === 2) return { kind: "intro" };
  if (bookPage === BOOK_PAGES) return { kind: "back" };
  const i = bookPage - 3;
  const order = book.order.length ? book.order : book.photos.filter((p) => p.id !== book.coverId).map((p) => p.id);
  // fewer photos than pages: repeat from the start rather than leave a hole
  const photoId = order.length ? order[i % order.length] : undefined;
  return { kind: "photo", photoId, n: bookPage };
}

export function slugFor(year: number, loc: string): string {
  return `${year}-${loc.toLowerCase()}`;
}

// QR target: the public share page, tagged for analytics like every link
// from print (UTM Studio convention: source = channel, medium = format).
export function shareUrl(origin: string, book: Pick<Book, "slug" | "year" | "loc">): string {
  const q = new URLSearchParams({
    utm_source: "photobook",
    utm_medium: "print_qr",
    utm_campaign: `${book.year}_${book.loc.toLowerCase()}_photobook`,
  });
  return `${origin}/p/${book.slug}?${q.toString()}`;
}

export function gpHashtag(city: string): string {
  return `#${city.replace(/[^A-Za-z0-9]/g, "")}GP`;
}

// What the public share page shows; stored server-side per slug.
export type SharePage = {
  slug: string;
  gpName: string;
  city: string;
  year: number;
  dateLabel: string;
  hashtags: string[];
  instagram: string;
  coverUrl?: string;
  pdfUrl?: string;
  updatedAt: string;
};
