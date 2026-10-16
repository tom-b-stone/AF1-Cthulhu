// Sitemap sync: keeps one campaign in the same state in Figma, in the AF1
// Tool and in the staging CMS.
//
// What syncs: the English texts of every module (block) on the campaign's
// pages: category/kicker, headline, subline, copy, CTA labels and carousel
// item texts. Images, settings and German stay CMS-only for now.
//
// How: three-way compare per field.
//   base  = the value both sides agreed on at the last sync (KV snapshot)
//   cms   = staging now (latest draft)
//   figma = what the Figma plugin last reported (KV), or sends right now
// figma == cms             → in sync
// figma changed, cms not   → Figma is newer → write to the CMS
// cms changed, figma not   → CMS is newer → plugin updates the layer
// both changed differently → conflict → the person decides
import { kvGet, kvSet } from "./kv";
import { stagingRequest } from "./payloadClient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export type Campaign = {
  key: string;
  name: string;
  root: string; // page url prefix on staging
  figmaFile: string;
  figmaPage: string;
};

export const CAMPAIGNS: Record<string, Campaign> = {
  sin: {
    key: "sin",
    name: "Unlock Singapore",
    root: "unlock-singapore",
    figmaFile: "rGxt5J0qhiK759uEbaKgTO",
    figmaPage: "692:56",
  },
};

// Library modules (07 / 05-1 design system) per CMS block type. The plugin
// builds missing pages from these; types without a module become a labelled
// placeholder frame.
export const MODULES: Record<string, { key: string; variant?: string; name: string }> = {
  // Mobile modules (375 px) – the sitemap is built mobile-only.
  hero: { key: "92f328fd4f4868c2c96ee2bc66df76f37909f02b", variant: "Position=Text bottom centered, Color Variant=Light, Size=XL", name: "Hero Image Mobile" },
  "single-card-showcase": { key: "37a990fda306c3ff11d7c56a8a251fa685b60cc4", variant: "Background=Grey 01", name: "Single Card Showcase Mobile" },
  "badges-grid": { key: "63028e426d41adf48eaf96ba5a717c66a7eb1853", variant: "Background=Chalk, Items=6", name: "Team Cards Grid Mobile" },
  carousel: { key: "e98001eeafb9f5cc5920c3304af8c30a462fa620", variant: "Tile Variation=4, State=Unlocked, Ratio=4x5, Background=Grey 01", name: "Carousel Mobile" },
  "carousel-tags": { key: "e98001eeafb9f5cc5920c3304af8c30a462fa620", variant: "Tile Variation=4, State=Unlocked, Ratio=4x5, Background=Grey 01", name: "Carousel Mobile (tags)" },
  "call-to-action": { key: "918553ca6aa8215213e716b9e9af6d0ea64daa49", variant: "Alignment=Center, Background=Image, Width=Boxed, Text=Light", name: "Call to Action Mobile" },
  "hot-spot": { key: "b267359bc26e0f4056e099e7db30d3772cbe4707", name: "Hotspot Mobile" },
  teaser: { key: "291e2a3471c882c11668c7c763b6cc0e96b95b87", name: "Teaser Big Mobile" },
  gallery: { key: "67bef93065cdc55535cd9b95add968beffebf056", name: "Gallery Grid Mobile" },
  "badge-engagement-teaser": { key: "680bea534dcfc57a2242dbe732252c4f895e6894", variant: "Background=Chalk", name: "Badge Engagement Teaser Mobile" },
};
export const SKIP_BLOCKS = new Set(["spacer"]);

// CMS path → Figma text layer name inside the module instance.
const TOP_FIELDS: [string, string][] = [
  ["category", "Kicker"],
  ["headline", "Headline"],
  ["subline", "Subline"],
  ["copy", "Copy"],
];
const CTA_ARRAYS = ["ctas", "unearnedBadgeCTA"];

export type Field = { path: string; layer: string; value: string };
export type Block = { id: string; blockType: string; hidden: boolean; name?: string; fields: Field[] };
export type SyncPage = { id: string; url: string; title: string; updatedAt: string; status: string; blocks: Block[] };
export type FieldMap = Record<string, string>; // "<pageId>|<blockId>|<path>" → value

export function fieldsOf(block: Json): Field[] {
  const out: Field[] = [];
  for (const [p, layer] of TOP_FIELDS) if (typeof block[p] === "string") out.push({ path: p, layer, value: block[p] });
  for (const arr of CTA_ARRAYS) {
    const c = Array.isArray(block[arr]) ? block[arr][0] : null;
    if (c && typeof c.label === "string") {
      out.push({ path: `${arr}.0.label`, layer: "Learn more", value: c.label });
      break;
    }
  }
  if (Array.isArray(block.carouselItems)) {
    block.carouselItems.slice(0, 8).forEach((it: Json, i: number) => {
      const ci = it?.carouselImage;
      if (!ci) return;
      const n = i + 1;
      if (typeof ci.headline === "string") out.push({ path: `carouselItems.${i}.carouselImage.headline`, layer: `Tile ${n} · Headline`, value: ci.headline });
      if (typeof ci.copy === "string") out.push({ path: `carouselItems.${i}.carouselImage.copy`, layer: `Tile ${n} · Copy`, value: ci.copy });
      const l = ci.contentCtas?.[0]?.label;
      if (typeof l === "string") out.push({ path: `carouselItems.${i}.carouselImage.contentCtas.0.label`, layer: `Tile ${n} · Link 1`, value: l });
    });
  }
  return out;
}

async function stg(path: string, init: RequestInit = {}): Promise<Json> {
  const res = await stagingRequest(path, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`staging ${init.method ?? "GET"} ${path.split("?")[0]}: ${res.status} ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : {};
}

export async function loadPages(c: Campaign): Promise<SyncPage[]> {
  const where = encodeURIComponent(JSON.stringify({ url: { like: c.root } }));
  const r = await stg(`/pages?where=${where}&limit=100&depth=0&draft=true&locale=en&fallback-locale=none`);
  const docs: Json[] = (r.docs ?? []).filter((d: Json) => d.url === c.root || String(d.url ?? "").startsWith(c.root + "/"));
  return docs
    .map((d) => ({
      id: d.id,
      url: d.url,
      title: d.title,
      updatedAt: d.updatedAt,
      status: d._status,
      blocks: (d.sections ?? [])
        .filter((s: Json) => !SKIP_BLOCKS.has(s.blockType))
        .map((s: Json) => ({ id: s.id, blockType: s.blockType, hidden: s.authRequirement === "HIDDEN", name: s.blockName, fields: fieldsOf(s) })),
    }))
    .sort((a, b) => (a.url === c.root ? -1 : b.url === c.root ? 1 : a.url.localeCompare(b.url)));
}

export const fkey = (pageId: string, blockId: string, path: string) => `${pageId}|${blockId}|${path}`;

export function cmsMap(pages: SyncPage[]): FieldMap {
  const m: FieldMap = {};
  for (const p of pages) for (const b of p.blocks) for (const f of b.fields) m[fkey(p.id, b.id, f.path)] = f.value;
  return m;
}

// ---- KV state
type Snapshot = { base: FieldMap; syncedAt: string | null };
export type FigmaReport = {
  values: FieldMap;
  nodes: Record<string, string>; // pageId → frame node id
  reportedAt: string;
  by: string;
};
type Pending = Record<string, string>; // field key → value the plugin must write into Figma

const kSnap = (c: string) => `sitemap:${c}:snapshot`;
const kFigma = (c: string) => `sitemap:${c}:figma`;
const kPending = (c: string) => `sitemap:${c}:pending`;
const kLog = (c: string) => `sitemap:${c}:log`;

async function getJson<T>(k: string, d: T): Promise<T> {
  const raw = await kvGet(k);
  if (!raw) return d;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return d;
  }
}
export const getSnapshot = (c: string) => getJson<Snapshot>(kSnap(c), { base: {}, syncedAt: null });
export const getFigmaReport = (c: string) => getJson<FigmaReport | null>(kFigma(c), null);
export const getPending = (c: string) => getJson<Pending>(kPending(c), {});
export const getLog = (c: string) => getJson<{ at: string; by: string; summary: string }[]>(kLog(c), []);
async function addLog(c: string, by: string, summary: string) {
  const l = await getLog(c);
  l.unshift({ at: new Date().toISOString(), by, summary });
  await kvSet(kLog(c), JSON.stringify(l.slice(0, 50)));
}

// ---- compare
export type Diff = {
  key: string;
  pageId: string;
  blockId: string;
  path: string;
  page: string;
  block: string;
  layer: string;
  base?: string;
  cms?: string;
  figma?: string;
  state: "figma-newer" | "cms-newer" | "conflict" | "missing-in-figma";
};

export function compare(pages: SyncPage[], base: FieldMap, figma: FieldMap | null): { diffs: Diff[]; inSync: number; total: number } {
  const diffs: Diff[] = [];
  let inSync = 0;
  let total = 0;
  for (const p of pages)
    for (const b of p.blocks)
      for (const f of b.fields) {
        total++;
        const k = fkey(p.id, b.id, f.path);
        const cms = f.value;
        const fg = figma ? figma[k] : undefined;
        const bs = base[k];
        const meta = { key: k, pageId: p.id, blockId: b.id, path: f.path, page: p.url, block: b.name || b.blockType, layer: f.layer, base: bs, cms, figma: fg };
        if (fg === undefined) {
          if (figma) diffs.push({ ...meta, state: "missing-in-figma" });
          continue;
        }
        if (norm(fg) === norm(cms)) {
          inSync++;
          continue;
        }
        if (bs === undefined) diffs.push({ ...meta, state: "conflict" });
        else if (norm(cms) === norm(bs)) diffs.push({ ...meta, state: "figma-newer" });
        else if (norm(fg) === norm(bs)) diffs.push({ ...meta, state: "cms-newer" });
        else diffs.push({ ...meta, state: "conflict" });
      }
  return { diffs, inSync, total };
}
// Figma text layers turn "\n" into line separators; compare loosely.
const norm = (s?: string) => (s ?? "").replace(/\u2028|\r/g, "\n").replace(/[ \t]+\n/g, "\n").trim();

export async function status(campaign: string) {
  const c = CAMPAIGNS[campaign];
  if (!c) throw new Error("unknown campaign");
  const [pages, snap, figma, pending, log] = await Promise.all([loadPages(c), getSnapshot(campaign), getFigmaReport(campaign), getPending(campaign), getLog(campaign)]);
  const cmp = compare(pages, snap.base, figma?.values ?? null);
  return { campaign: c, pages, ...cmp, syncedAt: snap.syncedAt, figma: figma ? { reportedAt: figma.reportedAt, by: figma.by, nodes: figma.nodes } : null, pending: Object.keys(pending).length, log };
}

// ---- apply
// decisions: field key → "figma" | "cms". Fields not listed follow the rule
// (newer side wins); conflicts without a decision are left alone.
export async function applySync(
  campaign: string,
  by: string,
  opts: { figma?: FieldMap; nodes?: Record<string, string>; decisions?: Record<string, "figma" | "cms"> },
) {
  const c = CAMPAIGNS[campaign];
  if (!c) throw new Error("unknown campaign");
  if (opts.figma) {
    const prev = await getFigmaReport(campaign);
    await kvSet(kFigma(campaign), JSON.stringify({ values: opts.figma, nodes: { ...(prev?.nodes ?? {}), ...(opts.nodes ?? {}) }, reportedAt: new Date().toISOString(), by }));
  }
  const figma = opts.figma ?? (await getFigmaReport(campaign))?.values ?? null;
  const pages = await loadPages(c);
  const snap = await getSnapshot(campaign);
  const { diffs } = compare(pages, snap.base, figma);
  const dec = opts.decisions ?? {};
  const toCms: Diff[] = [];
  const toFigma: Diff[] = [];
  const open: Diff[] = [];
  for (const d of diffs) {
    if (d.state === "missing-in-figma") continue;
    const choice = dec[d.key] ?? (d.state === "figma-newer" ? "figma" : d.state === "cms-newer" ? "cms" : undefined);
    if (choice === "figma") toCms.push(d);
    else if (choice === "cms") toFigma.push(d);
    else open.push(d);
  }
  // write Figma → CMS, page by page (draft PATCH, then publish on staging)
  const written: string[] = [];
  const byPage = new Map<string, Diff[]>();
  for (const d of toCms) byPage.set(d.pageId, [...(byPage.get(d.pageId) ?? []), d]);
  for (const [pageId, list] of byPage) {
    const page = await stg(`/pages/${pageId}?locale=en&fallback-locale=none&depth=0&draft=true`);
    for (const d of list) {
      const block = (page.sections ?? []).find((s: Json) => s.id === d.blockId);
      if (!block) continue;
      setPath(block, d.path.split(".").map((x) => (/^\d+$/.test(x) ? Number(x) : x)), d.figma ?? "");
    }
    await stg(`/pages/${pageId}?locale=en&draft=true`, { method: "PATCH", body: JSON.stringify({ sections: page.sections, _status: "draft" }) });
    await stg(`/pages/${pageId}?locale=en`, { method: "PATCH", body: JSON.stringify({ _status: "published" }) });
    written.push(`${list[0].page}: ${list.length} field${list.length === 1 ? "" : "s"}`);
  }
  // CMS → Figma: queue for the plugin
  const pending = await getPending(campaign);
  for (const d of toFigma) pending[d.key] = d.cms ?? "";
  await kvSet(kPending(campaign), JSON.stringify(pending));
  // new base = agreed values
  const base = { ...snap.base };
  const cm = cmsMap(pages);
  for (const k of Object.keys(cm)) if (figma && figma[k] !== undefined && norm(figma[k]) === norm(cm[k])) base[k] = cm[k];
  for (const d of toCms) base[d.key] = d.figma ?? "";
  for (const d of toFigma) base[d.key] = d.cms ?? "";
  await kvSet(kSnap(campaign), JSON.stringify({ base, syncedAt: new Date().toISOString() }));
  const summary = `${toCms.length} Figma → CMS, ${toFigma.length} CMS → Figma, ${open.length} open`;
  if (toCms.length || toFigma.length) await addLog(campaign, by, summary);
  return { toCms, toFigma, open, written, pending, summary };
}

// The plugin confirms which pending fields it wrote into Figma.
export async function ackPending(campaign: string, keys: string[]) {
  const p = await getPending(campaign);
  for (const k of keys) delete p[k];
  await kvSet(kPending(campaign), JSON.stringify(p));
  return Object.keys(p).length;
}

function setPath(o: Json, p: (string | number)[], v: unknown) {
  let cur = o;
  for (let i = 0; i < p.length - 1; i++) {
    if (cur[p[i]] == null) cur[p[i]] = typeof p[i + 1] === "number" ? [] : {};
    cur = cur[p[i]];
  }
  cur[p[p.length - 1]] = v;
}

// Dry run for the plugin: what would happen with this Figma state.
export async function previewSync(campaign: string, figma: FieldMap) {
  const c = CAMPAIGNS[campaign];
  if (!c) throw new Error("unknown campaign");
  const [pages, snap] = await Promise.all([loadPages(c), getSnapshot(campaign)]);
  return { ...compare(pages, snap.base, figma), syncedAt: snap.syncedAt };
}
