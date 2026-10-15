// Server-only: read access to SlashLens (slashlens.netlify.app), the team's
// photo library on Google Drive. Its function endpoint lists every photo
// with weekend, day, AI tags and a description, plus the team's collections.
// We only read, except when the user explicitly saves a pick as a
// collection (same call the SlashLens UI makes).
//
// Images are not downloaded here: the picks are shown via Drive thumbnails
// (the viewer's own Google session) and imported as the ZIP that SlashLens
// exports for a collection.

export type SlPhoto = { id: string; name: string; weekend: string; sub: string; tags: string[]; desc?: string; analyzed?: boolean };
export type SlCollection = { id: string; name: string; weekend: string; parentId: string | null; photoIds: string[] };

const BASE = (process.env.SLASHLENS_URL || "https://slashlens.netlify.app").replace(/\/$/, "");
const FN = `${BASE}/.netlify/functions/analyze`;

let cache: { at: number; photos: SlPhoto[] } | null = null;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`SlashLens ${String(body.action)} failed (${res.status})`);
  return (await res.json()) as T;
}

export async function slPhotos(): Promise<SlPhoto[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.photos;
  const j = await call<{ photos: SlPhoto[] }>({ action: "scan" });
  cache = { at: Date.now(), photos: j.photos ?? [] };
  return cache.photos;
}

export async function slCollections(): Promise<SlCollection[]> {
  return (await call<{ collections: SlCollection[] }>({ action: "getCollections" })).collections ?? [];
}

export async function slSaveCollection(weekend: string, name: string, photoIds: string[]): Promise<string> {
  const id = `col_${Date.now()}`;
  await call({ action: "createCollection", id, name, weekend, parentId: null });
  await call({ action: "updateCollection", id, photoIds });
  return id;
}

export function slThumb(id: string, w = 600) {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
}

// "R17_SINGAPORE" for round 17 / Singapore. SlashLens numbers its weekends
// itself, so the city name wins over the round number when both exist.
export function findWeekend(weekends: string[], round: number | undefined, city: string, country: string): string | null {
  const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z]/g, "");
  const names = [city, country].filter(Boolean).map(norm);
  const byName = weekends.find((w) => names.some((n) => n && norm(w).includes(n)));
  if (byName) return byName;
  if (round) return weekends.find((w) => new RegExp(`^R0?${round}_`).test(w)) ?? null;
  return null;
}

// ---- auto pick ----------------------------------------------------------
// 14 photos: 1 cover + 13 inside. A mix that tells the weekend: the car on
// track, both drivers, details, garage and people, atmosphere. One photo
// per burst (same minute), spread over the days.

type Slot = { key: string; n: number; test: (t: Set<string>) => boolean };

const has = (t: Set<string>, ...k: string[]) => k.some((x) => t.has(x));

const SLOTS: Slot[] = [
  { key: "car on track", n: 3, test: (t) => t.has("auto") && has(t, "strecke", "action") },
  { key: "Nico", n: 2, test: (t) => t.has("nico") && has(t, "portrait", "closeup", "fahrer") && !t.has("vip") },
  { key: "Gabi", n: 2, test: (t) => t.has("gabi") && has(t, "portrait", "closeup", "fahrer") && !t.has("vip") },
  { key: "details", n: 2, test: (t) => has(t, "helm", "reifen", "frontflügel", "hinterflügel", "carbon") && t.has("closeup") },
  { key: "garage + crew", n: 2, test: (t) => has(t, "garage", "boxenstopp", "mechaniker") },
  { key: "atmosphere", n: 2, test: (t) => has(t, "publikum", "fan", "jubel", "establisher") && !t.has("vip") },
];

function burstKey(p: SlPhoto) {
  // R17_SIN_ARF1T_2026_10_11_222252G.jpg → 2026_10_11_2222 (date + HHMM)
  const m = p.name.match(/(\d{4}_\d{2}_\d{2})_(\d{4})\d{2}/);
  return m ? `${m[1]}_${m[2]}` : p.name.replace(/\D+$/, "").slice(0, -2);
}

function score(p: SlPhoto) {
  const t = new Set(p.tags);
  let s = p.tags.length + Math.min(3, (p.desc?.length ?? 0) / 60);
  if (t.has("action")) s += 1;
  if (t.has("closeup") || t.has("portrait")) s += 1;
  if (t.has("vip") || t.has("hospitality")) s -= 3;
  if (has(t, "emma", "freddie") || /F1A|ACADEMY/i.test(p.sub)) s -= 4; // F1 Academy / junior shots: only if nothing else fits
  if (!p.analyzed) s -= 5;
  return s;
}

export type Pick = { id: string; name: string; sub: string; tags: string[]; desc?: string; slot: string; thumb: string };

// seed 0 = the best pick; any other seed shuffles near-equal photos so
// "reload" gives a different but still balanced selection
function jitter(id: string, seed: number) {
  if (!seed) return 0;
  let h = seed * 2654435761;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 250; // 0 … 4 points
}

export function autoPick(all: SlPhoto[], weekend: string, n = 14, seed = 0): { cover: Pick | null; inside: Pick[] } {
  // Getty agency shots are licensed for editorial use, not for a fan
  // download; and no other team's car in our zine
  const rival = /haas|ferrari|mercedes|mclaren|red bull|williams|alpine|aston martin|racing bulls|cadillac/i;
  const pool = all
    .filter((p) => p.weekend === weekend && p.analyzed !== false && !/getty/i.test(p.sub + p.name) && !rival.test(p.desc ?? ""))
    // F1 Academy / junior programme has its own stories; the zine is the F1 team
    .filter((p) => !/F1A|ACADEMY/i.test(p.sub) && !p.tags.some((t) => ["academy", "emma", "freddie"].includes(t)))
    .sort((a, b) => score(b) + jitter(b.id, seed) - (score(a) + jitter(a.id, seed)));
  const usedBursts = new Set<string>();
  const usedIds = new Set<string>();
  const take = (p: SlPhoto, slot: string): Pick => {
    usedIds.add(p.id);
    usedBursts.add(burstKey(p));
    return { id: p.id, name: p.name, sub: p.sub, tags: p.tags, desc: p.desc, slot, thumb: slThumb(p.id) };
  };
  const free = (p: SlPhoto) => !usedIds.has(p.id) && !usedBursts.has(burstKey(p));

  // cover: a driver close-up with the helmet reads best as a line drawing
  const coverSrc =
    pool.find((p) => free(p) && has(new Set(p.tags), "nico", "gabi") && p.tags.includes("helm") && has(new Set(p.tags), "closeup", "portrait")) ??
    pool.find((p) => free(p) && has(new Set(p.tags), "nico", "gabi") && has(new Set(p.tags), "closeup", "portrait"));
  const cover = coverSrc ? take(coverSrc, "cover") : null;

  const inside: Pick[] = [];
  // race days first (track shots, then Sunday back to Friday); the days
  // before the weekend (Mon–Wed: arrivals, media) give at most two photos
  const pre = (sub: string) => /MON|TUE|WED/i.test(sub);
  const days = [...new Set(pool.map((p) => p.sub))].sort((a, b) => (a.startsWith("00") ? -1 : b.startsWith("00") ? 1 : b.localeCompare(a)));
  let preCount = 0;
  const allowed = (p: SlPhoto) => !pre(p.sub) || preCount < 2;
  for (const slot of SLOTS) {
    let got = 0;
    // round-robin over the days so Thursday to Sunday all show up
    for (let pass = 0; pass < 3 && got < slot.n; pass++) {
      for (const d of days) {
        if (got >= slot.n) break;
        const p = pool.find((x) => x.sub === d && free(x) && allowed(x) && slot.test(new Set(x.tags)));
        if (p) {
          if (pre(p.sub)) preCount++;
          inside.push(take(p, slot.key));
          got++;
        }
      }
    }
  }
  // fill up with the best remaining, still one per burst
  for (const p of pool) {
    if (inside.length >= n - 1) break;
    if (free(p) && allowed(p) && !p.tags.includes("vip")) {
      if (pre(p.sub)) preCount++;
      inside.push(take(p, "best of the rest"));
    }
  }
  // reading order: by day and time, like the weekend happened
  // (the photographers' track selection "00_CarOnTrack" has no date: it goes last)
  const k = (x: Pick) => `${x.sub.startsWith("00") ? "99" : x.sub}|${x.name}`;
  inside.sort((a, b) => k(a).localeCompare(k(b)));
  return { cover, inside: inside.slice(0, n - 1) };
}
