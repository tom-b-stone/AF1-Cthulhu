// Read-only access to the production media library (public REST, same data
// the website renders). Used for the learning session: Claude looks at
// photos that already carry a good alt text and derives cues + examples.
const PROD_API = process.env.PRODUCTION_CMS_API_URL ?? "https://www.audif1.com/cms/api";
const PROD_SITE = PROD_API.replace(/\/cms\/api$/, "");

export type LibraryItem = { id: string; filename: string; alt: string; createdAt: string; width?: number; height?: number; preview?: string };

type MediaDoc = {
  id: string;
  filename?: string;
  alt?: string;
  createdAt: string;
  width?: number;
  height?: number;
  mimeType?: string;
  url?: string;
  sizes?: Record<string, { url?: string; width?: number; height?: number }>;
};

function previewUrl(d: MediaDoc): string | undefined {
  const s = d.sizes ?? {};
  const pick = s.medium?.url ?? s.small?.url ?? s.thumbnail?.url ?? d.url;
  return pick ? `${PROD_SITE}${pick}` : undefined;
}

export async function searchLibrary(q: string, limit = 20, page = 1): Promise<{ total: number; items: LibraryItem[] }> {
  const where = q ? `&where[alt][contains]=${encodeURIComponent(q)}` : "";
  const res = await fetch(`${PROD_API}/media?limit=${Math.min(50, limit)}&page=${page}&depth=0&sort=-createdAt&where[mimeType][contains]=image${where}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`library search failed (${res.status})`);
  const json = (await res.json()) as { totalDocs: number; docs: MediaDoc[] };
  return {
    total: json.totalDocs,
    items: json.docs.map((d) => ({ id: d.id, filename: d.filename ?? "", alt: d.alt ?? "", createdAt: d.createdAt, width: d.width, height: d.height, preview: previewUrl(d) })),
  };
}

export async function fetchLibraryImage(id: string): Promise<{ mime: string; data: string; alt: string; filename: string } | null> {
  const res = await fetch(`${PROD_API}/media/${id}?depth=0`, { cache: "no-store" });
  if (!res.ok) return null;
  const d = (await res.json()) as MediaDoc;
  const url = previewUrl(d);
  if (!url) return null;
  const img = await fetch(url, { cache: "no-store" });
  if (!img.ok) return null;
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length > 900_000) return null;
  return { mime: img.headers.get("content-type") ?? "image/webp", data: buf.toString("base64"), alt: d.alt ?? "", filename: d.filename ?? "" };
}
