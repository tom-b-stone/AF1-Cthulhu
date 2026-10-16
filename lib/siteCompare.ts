// Compare (and repair) a copied campaign: production pages vs their staging
// copies. Checks every module, its images (same file, same focal point /
// crop), the engagements and Team Cards behind them, and texts that are
// filled on production but empty on staging.
//
// Repairs:
//   image missing / different file → production file copied again, reference set
//   focal point differs            → staging media focal point updated
//   engagement incomplete          → engagement content copied again from production
//   text empty on staging          → production text written
//   placeholder (lorem) on staging → production text written ("" if production has none)
// Also reported (no auto-fix): texts that differ, texts only on staging.
import { MEDIA_KEYS, isId, prod, project, stg, withIds, hasDe } from "./teamCardCopy";
import { kvGet, kvSet } from "./kv";
import { stagingRequest } from "./payloadClient";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Loc = "en" | "de";

export type Issue = {
  page: string;
  where: string; // human readable path
  kind: "image-missing" | "image-file" | "image-focal" | "engagement" | "badge" | "empty-text" | "placeholder" | "text-differs" | "extra-text" | "link" | "items" | "block-missing";
  detail: string;
  fix?: Fix;
};
type Fix =
  | { type: "media-focal"; stagingMedia: string; focalX: number; focalY: number }
  | { type: "media-copy"; prodMedia: string; target: Target }
  | { type: "text"; value: string; target: Target }
  | { type: "engagement"; prodId: string; stagingId: string }
  | { type: "badge-media"; prodMedia: string; target: Target }
  | { type: "link"; value: Json; target: Target };
type Target = { collection: "pages" | "engagements" | "badges"; id: string; locale: Loc; path: (string | number)[] };

const SKIP = new Set(["id", "createdAt", "updatedAt", "createdBy", "updatedBy", "internalId", "sortingTime", "_status", "slug", "generateSlug", "doc", "loyaltyId", "contentTags", "relationTo", "value", "url", "breadcrumbs", "parent", "meta", "loggedOutBadge", "mechanics", "badge", "engagement", "folder", "partnerTag", "raceTag", "season", "campaignTitle", "badgeType", "publishedAt", "blockName", "anchorId"]);

const LOREM = /lorem ipsum|dolor sit amet|consectetu(?:e)?r adipisc|consectetuer/i;
// CMS default texts that appear when a block is created without the field (never on production on purpose)
const CMS_DEFAULT = /^By joining, you.ll get early access to exclusive content/i;
const richText = (v: Json): string => (!v || typeof v !== "object" ? "" : typeof v.text === "string" ? v.text : Array.isArray(v.children) ? v.children.map(richText).join(" ") : v.root ? richText(v.root) : "");

type Ctx = { media: Map<string, Json>; stgMedia: Map<string, Json>; seenEng: Set<string>; seenBadge: Set<string>; issues: Issue[]; page: string; deadline: number };

async function prodMedia(ctx: Ctx, id: string) {
  if (!ctx.media.has(id)) ctx.media.set(id, await prod(`/media/${id}?depth=0`).catch(() => null));
  return ctx.media.get(id);
}
async function stgMediaDoc(ctx: Ctx, id: string) {
  if (!ctx.stgMedia.has(id)) ctx.stgMedia.set(id, await stg(`/media/${id}?depth=0`).catch(() => null));
  return ctx.stgMedia.get(id);
}
const idOf = (v: Json) => (isId(v) ? v : v && typeof v === "object" && isId(v.id) ? v.id : null);
const label = (path: (string | number)[]) => path.map((p) => (typeof p === "number" ? `[${p + 1}]` : p)).join(".").replace(/\.\[/g, "[");

async function compareMedia(ctx: Ctx, pId: string, sVal: Json, target: Target, where: string) {
  const pm = await prodMedia(ctx, pId);
  if (!pm) return;
  const sId = idOf(sVal);
  if (!sId) {
    ctx.issues.push({ page: ctx.page, where, kind: "image-missing", detail: `missing on staging (production: ${pm.filename})`, fix: { type: "media-copy", prodMedia: pId, target } });
    return;
  }
  const sm = await stgMediaDoc(ctx, sId);
  if (!sm) {
    ctx.issues.push({ page: ctx.page, where, kind: "image-missing", detail: `staging media ${sId} not found (production: ${pm.filename})`, fix: { type: "media-copy", prodMedia: pId, target } });
    return;
  }
  // our re-copies carry a "-sin" suffix; staging may re-encode, so size is not a criterion
  const base = (f: string) => String(f ?? "").replace(/-sin(\.[a-z0-9]+)$/i, "$1").replace(/-\d+(\.[a-z0-9]+)$/i, "$1");
  const sameFile = (sm.filename === pm.filename || base(sm.filename) === base(pm.filename)) && sm.width === pm.width && sm.height === pm.height;
  if (!sameFile) {
    ctx.issues.push({ page: ctx.page, where, kind: "image-file", detail: `different image: staging ${sm.filename} (${sm.width}×${sm.height}), production ${pm.filename} (${pm.width}×${pm.height})`, fix: { type: "media-copy", prodMedia: pId, target } });
    return;
  }
  const fx = pm.focalX ?? 50, fy = pm.focalY ?? 50;
  if (Math.abs((sm.focalX ?? 50) - fx) > 0.5 || Math.abs((sm.focalY ?? 50) - fy) > 0.5)
    ctx.issues.push({ page: ctx.page, where, kind: "image-focal", detail: `crop/focal point differs: staging ${sm.focalX ?? 50}/${sm.focalY ?? 50}, production ${fx}/${fy} (${pm.filename})`, fix: { type: "media-focal", stagingMedia: sId, focalX: fx, focalY: fy } });
}

async function walk(ctx: Ctx, p: Json, s: Json, path: (string | number)[], target: Omit<Target, "path">, where: string) {
  if (Date.now() > ctx.deadline) return;
  if (Array.isArray(p)) {
    const sa = Array.isArray(s) ? s : [];
    if (p.length !== sa.length && p.length > 0) ctx.issues.push({ page: ctx.page, where: where || label(path), kind: "items", detail: `production has ${p.length} items, staging ${sa.length}` });
    for (let i = 0; i < Math.min(p.length, sa.length); i++) await walk(ctx, p[i], sa[i], [...path, i], target, `${where}[${i + 1}]`);
    return;
  }
  if (!p || typeof p !== "object") return;
  if (p.blockType === "link-button" && s && typeof s === "object") await compareLink(ctx, p, s, path, target, where);
  for (const [k, pv] of Object.entries(p)) {
    if (p.blockType === "link-button" && ["linkType", "url", "anchor", "doc"].includes(k)) continue;
    const sv = s ? s[k] : undefined;
    const here = [...path, k];
    const w = `${where}${where ? "." : ""}${k}`;
    if (MEDIA_KEYS.has(k)) {
      const pid = idOf(pv);
      if (pid) await compareMedia(ctx, pid, sv, { ...target, path: here }, w);
      continue;
    }
    if (k === "engagement") {
      const pid = idOf(pv), sid = idOf(sv);
      if (pid) await compareEngagement(ctx, pid, sid, w);
      continue;
    }
    if (k === "badge" || k === "loggedOutBadge") {
      const pid = idOf(pv), sid = idOf(sv);
      if (pid && sid) await compareBadge(ctx, pid, sid, w);
      continue;
    }
    if (SKIP.has(k)) continue;
    if (typeof pv === "string") {
      const L = target.locale.toUpperCase();
      if (typeof sv === "string" && LOREM.test(sv) && !LOREM.test(pv)) ctx.issues.push({ page: ctx.page, where: w, kind: "placeholder", detail: `placeholder text on staging (${L}): "${sv.slice(0, 60)}" → production: "${pv.slice(0, 60)}"`, fix: { type: "text", value: pv, target: { ...target, path: here } } });
      else if (pv.trim() && (typeof sv !== "string" || !sv.trim())) ctx.issues.push({ page: ctx.page, where: w, kind: "empty-text", detail: `empty on staging (${L}): "${pv.slice(0, 60)}"`, fix: { type: "text", value: pv, target: { ...target, path: here } } });
      else if (!pv.trim() && typeof sv === "string" && sv.trim())
        ctx.issues.push(CMS_DEFAULT.test(sv.trim())
          ? { page: ctx.page, where: w, kind: "placeholder", detail: `CMS default text on staging (${L}), empty on production: "${sv.slice(0, 60)}"`, fix: { type: "text", value: "", target: { ...target, path: here } } }
          : { page: ctx.page, where: w, kind: "extra-text", detail: `only on staging (${L}), empty on production: "${sv.slice(0, 60)}"` });
      else if (typeof sv === "string" && pv.trim() && sv.trim() && pv.trim() !== sv.trim() && !(isId(pv) && isId(sv))) ctx.issues.push({ page: ctx.page, where: w, kind: "text-differs", detail: `differs (${L}): staging "${sv.slice(0, 50)}" · production "${pv.slice(0, 50)}"` });
      continue;
    }
    if (pv && typeof pv === "object") {
      if ((pv as Json).root) {
        // rich text: links differ by design, but placeholders must not
        const st = richText(sv);
        if (LOREM.test(st) && !LOREM.test(richText(pv))) ctx.issues.push({ page: ctx.page, where: w, kind: "placeholder", detail: `placeholder rich text on staging (${target.locale.toUpperCase()}): "${st.slice(0, 60)}"` });
        continue;
      }
      await walk(ctx, pv, sv, here, target, w);
    }
  }
  // keys only on staging (production never had them): placeholders there are copy leftovers
  if (s && typeof s === "object" && !Array.isArray(s)) {
    for (const [k, sv] of Object.entries(s)) {
      if (k in p || SKIP.has(k) || typeof sv !== "string" || !(LOREM.test(sv) || CMS_DEFAULT.test(sv.trim()))) continue;
      ctx.issues.push({ page: ctx.page, where: `${where}${where ? "." : ""}${k}`, kind: "placeholder", detail: `placeholder text on staging (${target.locale.toUpperCase()}), not set on production: "${sv.slice(0, 60)}"`, fix: { type: "text", value: "", target: { ...target, path: [...path, k] } } });
    }
  }
}

// slugs of linked pages (production / staging), to compare internal links across both systems
const slugCache = new Map<string, string | null>();
async function slugOf(sys: "prod" | "stg", id: string): Promise<string | null> {
  const key = `${sys}:${id}`;
  if (slugCache.has(key)) return slugCache.get(key)!;
  const d = await (sys === "prod" ? prod(`/pages/${id}?depth=0`) : stg(`/pages/${id}?depth=0&draft=true`)).catch(() => null);
  const v = d?.slug ?? null;
  slugCache.set(key, v);
  return v;
}
async function stagingPageBySlug(slug: string): Promise<string | null> {
  const r = await stg(`/pages?where[slug][equals]=${encodeURIComponent(slug)}&limit=5&depth=0&draft=true&sort=-updatedAt`).catch(() => null);
  return r?.docs?.[0]?.id ?? null;
}
// a link must work like on production: same type and anchor; internal links go to the staging page
// with the same slug. Production pages that have no staging copy may be linked externally (audif1.com).
async function compareLink(ctx: Ctx, p: Json, s: Json, path: (string | number)[], target: Omit<Target, "path">, where: string) {
  const L = target.locale.toUpperCase();
  const push = (detail: string, fixed?: Json) => ctx.issues.push({ page: ctx.page, where: where || label(path), kind: "link", detail: `link "${p.label ?? ""}" (${L}): ${detail}`, fix: fixed && target.collection === "pages" ? { type: "link", value: fixed, target: { ...target, path } } : undefined });
  if (p.linkType === "internal" && p.doc?.value) {
    const pslug = await slugOf("prod", idOf(p.doc.value) as string);
    if (!pslug) return;
    if (s.linkType === "internal" && s.doc?.value) {
      // same page, or the campaign's own copy of it (e.g. vegas-grand-prize → vegas-grand-prize-2026)
      const sslug = await slugOf("stg", idOf(s.doc.value) as string);
      if (sslug && (sslug === pslug || sslug.startsWith(`${pslug}-`) || sslug.endsWith(`/${pslug.split("/").pop()}`))) return;
    }
    const sid = await stagingPageBySlug(pslug);
    if (!sid) {
      if (s.linkType === "external" && typeof s.url === "string" && s.url.includes(pslug.split("/").pop() ?? pslug)) return; // no staging copy: production URL is fine
      return push(`goes to ${s.linkType} ${s.url ?? ""}, production links /${pslug} (no staging copy)`);
    }
    const fixed = { ...s, linkType: "internal", doc: { relationTo: p.doc.relationTo ?? "pages", value: sid } };
    delete fixed.url;
    return push(`staging ${s.linkType}${s.url ? " " + s.url : ""} · production internal /${pslug}`, fixed);
  }
  if (p.linkType === "anchor" || (p.linkType && p.linkType !== "internal" && p.linkType !== "external")) {
    if (s.linkType === p.linkType && s.anchor === p.anchor) return;
    const fixed = { ...s, linkType: p.linkType, anchor: p.anchor };
    delete fixed.url;
    delete fixed.doc;
    return push(`staging ${s.linkType}${s.url ? " " + s.url : ""} · production ${p.linkType} ${p.anchor ?? ""}`, fixed);
  }
  if (p.linkType === "external" && (s.linkType !== "external" || s.url !== p.url)) {
    const fixed = { ...s, linkType: "external", url: p.url };
    delete fixed.doc;
    return push(`staging ${s.linkType} ${s.url ?? ""} · production external ${p.url}`, fixed);
  }
}

async function compareEngagement(ctx: Ctx, pid: string, sid: string | null, where: string) {
  const key = `${pid}>${sid}`;
  if (ctx.seenEng.has(key)) return;
  ctx.seenEng.add(key);
  if (!sid) {
    ctx.issues.push({ page: ctx.page, where, kind: "engagement", detail: "engagement missing on staging" });
    return;
  }
  const before = ctx.issues.length;
  for (const loc of ["en", "de"] as Loc[]) {
    const [pe, se] = await Promise.all([prod(`/engagements/${pid}?depth=0&locale=${loc}&fallback-locale=none`).catch(() => null), stg(`/engagements/${sid}?depth=0&locale=${loc}&fallback-locale=none`).catch(() => null)]);
    if (!pe) return;
    if (!se) {
      ctx.issues.push({ page: ctx.page, where, kind: "engagement", detail: `staging engagement ${sid} not found` });
      return;
    }
    await walk(ctx, pe, se, [], { collection: "engagements", id: sid, locale: loc }, `${where} "${pe.title ?? ""}"`);
  }
  // only real copy faults (fixable ones) justify a re-copy; reported text differences may be edits made on staging
  const found = ctx.issues.slice(before).filter((i) => i.fix).length;
  if (found) {
    // one complete re-copy fixes them all
    for (let i = before; i < ctx.issues.length; i++) delete ctx.issues[i].fix;
    ctx.issues.push({ page: ctx.page, where, kind: "engagement", detail: `${found} difference(s) in the engagement → copy it again from production`, fix: { type: "engagement", prodId: pid, stagingId: sid } });
  }
}

async function compareBadge(ctx: Ctx, pid: string, sid: string, where: string) {
  const key = `${pid}>${sid}`;
  if (ctx.seenBadge.has(key)) return;
  ctx.seenBadge.add(key);
  for (const loc of ["en", "de"] as Loc[]) {
    const [pb, sb] = await Promise.all([prod(`/badges/${pid}?depth=0&locale=${loc}&fallback-locale=none`).catch(() => null), stg(`/badges/${sid}?depth=0&locale=${loc}&fallback-locale=none`).catch(() => null)]);
    if (!pb || !sb) return;
    await walk(ctx, pb, sb, [], { collection: "badges", id: sid, locale: loc }, `Team Card "${pb.publicTitle ?? pb.title}"`);
  }
}

// staging url for a production url (pages whose slug was taken got -2026)
const STG_URL: Record<string, string> = { "unlock-singapore/vegas-grand-prize": "unlock-singapore/vegas-grand-prize-2026" };

export async function compareCampaign(root: string, opts: { from?: number; budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 45000);
  const where = encodeURIComponent(JSON.stringify({ url: { like: root } }));
  const prodPages: Json[] = ((await prod(`/pages?where=${where}&limit=100&depth=0&locale=en`)).docs ?? []).filter((d: Json) => d._status === "published" && (d.url === root || String(d.url).startsWith(root + "/"))).sort((a: Json, b: Json) => String(a.url).localeCompare(String(b.url)));
  const ctx: Ctx = { media: new Map(), stgMedia: new Map(), seenEng: new Set(), seenBadge: new Set(), issues: [], page: "", deadline };
  let i = opts.from ?? 0;
  for (; i < prodPages.length; i++) {
    if (Date.now() > deadline) break;
    const pp = prodPages[i];
    const surl = STG_URL[pp.url] ?? pp.url;
    ctx.page = "/" + surl;
    const found = await stg(`/pages?where[url][equals]=${encodeURIComponent(surl)}&limit=1&depth=0&draft=true`).catch(() => null);
    const sp = found?.docs?.[0];
    if (!sp) {
      ctx.issues.push({ page: ctx.page, where: "page", kind: "block-missing", detail: "page not on staging" });
      continue;
    }
    for (const loc of ["en", "de"] as Loc[]) {
      const [pl, sl] = await Promise.all([prod(`/pages/${pp.id}?depth=0&locale=${loc}&fallback-locale=none`), stg(`/pages/${sp.id}?depth=0&locale=${loc}&fallback-locale=none&draft=true`)]);
      const ps: Json[] = pl.sections ?? [], ss: Json[] = sl.sections ?? [];
      if (loc === "en" && ps.length !== ss.length) ctx.issues.push({ page: ctx.page, where: "sections", kind: "block-missing", detail: `production ${ps.length} modules, staging ${ss.length}` });
      for (let b = 0; b < Math.min(ps.length, ss.length); b++) {
        const label2 = `${String(b + 1).padStart(2, "0")} ${ps[b].blockType}${ps[b].blockName ? ` "${ps[b].blockName}"` : ""}`;
        if (ps[b].blockType !== ss[b].blockType) {
          if (loc === "en") ctx.issues.push({ page: ctx.page, where: label2, kind: "block-missing", detail: `staging has ${ss[b].blockType} here` });
          continue;
        }
        await walk(ctx, ps[b], ss[b], ["sections", b], { collection: "pages", id: sp.id, locale: loc }, label2);
      }
    }
  }
  // de-duplicate (same media fix found in EN and DE)
  const seen = new Set<string>();
  const issues = ctx.issues.filter((x) => {
    const k = `${x.page}|${x.where}|${x.kind}|${JSON.stringify(x.fix ?? {})}`.replace(/"locale":"(en|de)"/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { issues, next: i < prodPages.length ? i : null, pages: prodPages.length };
}

// ---- repair ---------------------------------------------------------------
function setPath(o: Json, p: (string | number)[], v: unknown) {
  let cur = o;
  for (let i = 0; i < p.length - 1; i++) {
    if (cur[p[i]] == null) cur[p[i]] = typeof p[i + 1] === "number" ? [] : {};
    cur = cur[p[i]];
  }
  cur[p[p.length - 1]] = v;
}

// the staging copy of a production image: an identical file (same name and
// size) is reused, otherwise the production file is uploaded again under a
// unique name with its focal point
const fresh = new Map<string, string>();
async function copyFresh(prodId: string): Promise<string> {
  if (fresh.has(prodId)) return fresh.get(prodId)!;
  const m = await prod(`/media/${prodId}?depth=0&locale=en`);
  const same = await stg(`/media?where[filename][equals]=${encodeURIComponent(m.filename)}&limit=5&depth=0`);
  const twin = (same.docs ?? []).find((d: Json) => d.width === m.width && d.height === m.height && Math.abs((d.filesize ?? 0) - (m.filesize ?? 0)) < 1024);
  if (twin) {
    if (Math.abs((twin.focalX ?? 50) - (m.focalX ?? 50)) > 0.5 || Math.abs((twin.focalY ?? 50) - (m.focalY ?? 50)) > 0.5) await stg(`/media/${twin.id}`, { method: "PATCH", body: JSON.stringify({ focalX: m.focalX ?? 50, focalY: m.focalY ?? 50 }) });
    fresh.set(prodId, twin.id);
    return twin.id;
  }
  const site = (process.env.PRODUCTION_CMS_API_URL ?? "https://www.audif1.com/cms/api").replace(/\/cms\/api\/?$/, "");
  const file = await fetch(`${site}${m.url}`, { cache: "no-store" });
  if (!file.ok) throw new Error(`download ${m.filename}: ${file.status}`);
  const blob = await file.blob();
  const dot = m.filename.lastIndexOf(".");
  const name = `${m.filename.slice(0, dot)}-sin${m.filename.slice(dot)}`;
  const there = await stg(`/media?where[filename][equals]=${encodeURIComponent(name)}&limit=1&depth=0`);
  if (there.docs?.[0]) return there.docs[0].id;
  const form = new FormData();
  form.append("file", blob, name);
  form.append("_payload", JSON.stringify({ alt: m.alt || m.filename, focalX: m.focalX ?? 50, focalY: m.focalY ?? 50 }));
  const res = await stagingRequest(`/media`, { method: "POST", body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload ${name}: ${res.status} ${text.slice(0, 200)}`);
  const id = JSON.parse(text).doc.id;
  fresh.set(prodId, id);
  return id;
}

async function remapFresh(v: Json, k = ""): Promise<Json> {
  if (Array.isArray(v)) return Promise.all(v.map((x) => remapFresh(x)));
  if (v && typeof v === "object") {
    if (MEDIA_KEYS.has(k) && isId(v.id) && v.filename) return copyFresh(v.id);
    const out: Json = {};
    for (const [kk, x] of Object.entries(v)) out[kk] = await remapFresh(x, kk);
    return out;
  }
  if (MEDIA_KEYS.has(k) && isId(v)) return copyFresh(v);
  return v;
}

// issues are kept between the compare and the repair run
const kIssues = (root: string) => `sitecompare:${root}`;
export async function saveIssues(root: string, issues: Issue[], append: boolean) {
  const prev = append ? await loadIssues(root) : [];
  await kvSet(kIssues(root), JSON.stringify([...prev, ...issues]));
}
export async function loadIssues(root: string): Promise<Issue[]> {
  const raw = await kvGet(kIssues(root));
  return raw ? (JSON.parse(raw) as Issue[]) : [];
}

export async function repairCampaign(issues: Issue[], budgetMs = 45000) {
  const deadline = Date.now() + budgetMs;
  const done: string[] = [];
  const failed: string[] = [];
  const left: Issue[] = [];
  const patches = new Map<string, { target: Omit<Target, "path">; sets: { path: (string | number)[]; value: unknown }[] }>();
  for (const it of issues) {
    if (!it.fix) continue;
    if (Date.now() > deadline) {
      left.push(it);
      continue;
    }
    try {
      const f = it.fix;
      if (f.type === "media-focal") {
        await stg(`/media/${f.stagingMedia}`, { method: "PATCH", body: JSON.stringify({ focalX: f.focalX, focalY: f.focalY }) });
        done.push(`${it.page} ${it.where}: focal point set`);
      } else if (f.type === "media-copy" || f.type === "badge-media") {
        const id = await copyFresh(f.prodMedia);
        const k = `${f.target.collection}/${f.target.id}/${f.target.locale}`;
        const e = patches.get(k) ?? { target: { collection: f.target.collection, id: f.target.id, locale: f.target.locale }, sets: [] };
        e.sets.push({ path: f.target.path, value: id });
        patches.set(k, e);
        done.push(`${it.page} ${it.where}: image copied again`);
      } else if (f.type === "link") {
        const k = `${f.target.collection}/${f.target.id}/${f.target.locale}`;
        const e = patches.get(k) ?? { target: { collection: f.target.collection, id: f.target.id, locale: f.target.locale }, sets: [] };
        e.sets.push({ path: f.target.path, value: f.value });
        patches.set(k, e);
        done.push(`${it.page} ${it.where}: link set like on production`);
      } else if (f.type === "text") {
        const k = `${f.target.collection}/${f.target.id}/${f.target.locale}`;
        const e = patches.get(k) ?? { target: { collection: f.target.collection, id: f.target.id, locale: f.target.locale }, sets: [] };
        e.sets.push({ path: f.target.path, value: f.value });
        patches.set(k, e);
        done.push(`${it.page} ${it.where}: ${it.kind === "placeholder" ? "placeholder replaced" : "text filled"}`);
      } else if (f.type === "engagement") {
        const all = await prod(`/engagements/${f.prodId}?depth=0&locale=all&fallback-locale=none`);
        const { loggedOutBadge: _l, ...rest } = all;
        void _l;
        const mapped = await remapFresh(rest);
        const en = project(mapped, "en");
        const saved = (await stg(`/engagements/${f.stagingId}?locale=en`, { method: "PATCH", body: JSON.stringify(en) })).doc;
        if (hasDe(mapped)) await stg(`/engagements/${f.stagingId}?locale=de`, { method: "PATCH", body: JSON.stringify(withIds(project(mapped, "de"), saved)) });
        done.push(`${it.page} ${it.where}: engagement copied again`);
      }
    } catch (e) {
      failed.push(`${it.page} ${it.where}: ${e instanceof Error ? e.message.slice(0, 200) : "failed"}`);
    }
  }
  // write collected reference / text changes per document
  for (const { target, sets } of patches.values()) {
    try {
      const draft = target.collection === "pages" ? "&draft=true" : "";
      const doc = await stg(`/${target.collection}/${target.id}?depth=0&locale=${target.locale}&fallback-locale=none${draft}`);
      const body: Json = target.collection === "pages" ? { sections: doc.sections } : {};
      for (const s of sets) {
        if (target.collection === "pages") setPath(body, s.path, s.value);
        else {
          const top = s.path[0] as string;
          if (!(top in body)) body[top] = JSON.parse(JSON.stringify(doc[top] ?? null));
          if (s.path.length === 1) body[top] = s.value;
          else setPath(body, s.path, s.value);
        }
      }
      if (target.collection === "pages") {
        await stg(`/pages/${target.id}?locale=${target.locale}&draft=true`, { method: "PATCH", body: JSON.stringify({ ...body, _status: "draft" }) });
        await stg(`/pages/${target.id}?locale=${target.locale}`, { method: "PATCH", body: JSON.stringify({ _status: "published" }) });
      } else await stg(`/${target.collection}/${target.id}?locale=${target.locale}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      failed.push(`${target.collection} ${target.id} (${target.locale}): ${e instanceof Error ? e.message.slice(0, 200) : "failed"}`);
    }
  }
  return { done, failed, left };
}
