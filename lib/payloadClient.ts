// Server-only client for the audif1.com Payload CMS REST API.
//
// Auth: logs in as a dedicated service-account user (the staging login saved
// via /admin/credentials, see lib/settings.ts — Tom already created this user
// in the staging CMS; we never create one ourselves) using Payload's
// local-jwt strategy (`POST /users/login`), then sends the returned JWT as
// `Authorization: JWT <token>` on every request. The token is cached
// in-memory per serverless instance and refreshed on expiry or a 401.
//
// API shape (locales, draft mode, lock override, the two-step publish trick)
// follows the audif1-seo-sync skill's reference notes — same CMS, same rules.
import { getStagingCredentials } from "./settings";

const DEFAULT_BASE_URL = "https://staging.audif1team.com/cms/api";

function baseUrl(): string {
  return (process.env.PAYLOAD_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

type TokenCache = { token: string; exp: number } | null;
let tokenCache: TokenCache = null;

async function login(): Promise<string> {
  const creds = await getStagingCredentials();
  if (!creds) {
    throw new Error("No staging CMS login saved yet — set one at /admin/credentials first.");
  }
  const res = await fetch(`${baseUrl()}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Payload login failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { token: string; exp: number };
  tokenCache = { token: json.token, exp: json.exp };
  return json.token;
}

async function getToken(forceRefresh = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && tokenCache && tokenCache.exp - 60 > now) {
    return tokenCache.token;
  }
  return login();
}

async function payloadFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `JWT ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (res.status === 401 && retry) {
    await getToken(true);
    return payloadFetch(path, init, false);
  }
  return res;
}

export type Collection = "news" | "pages";

export type SeoLocaleMeta = { title: string; description: string };

export type SeoListItem = {
  id: string;
  collection: Collection;
  internalTitle: string;
  slug: string;
  status: "published" | "draft";
  publishedDate: string | null;
  publicUrl: string;
  en: SeoLocaleMeta;
  de: SeoLocaleMeta;
};

function publicUrlFor(collection: Collection, slug: string): string {
  if (collection === "news") return `https://www.audif1.com/news/${slug}`;
  if (!slug || slug === "home") return "https://www.audif1.com/";
  return `https://www.audif1.com/${slug}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllDocs(collection: Collection, locale: "en" | "de"): Promise<any[]> {
  const out: any[] = [];
  let page = 1;
  const sort = collection === "news" ? "-publishedAt" : "slug";
  // Hard cap so a misbehaving collection can't hang the request forever.
  while (page <= 20) {
    const res = await payloadFetch(
      `/${collection}?limit=200&depth=0&draft=true&locale=${locale}&page=${page}&sort=${sort}`
    );
    if (!res.ok) {
      throw new Error(`Payload list fetch failed for ${collection}/${locale} (${res.status})`);
    }
    const json = await res.json();
    out.push(...(json.docs ?? []));
    if (!json.totalPages || json.totalPages <= page) break;
    page++;
  }
  return out;
}

export async function listSeoItems(): Promise<SeoListItem[]> {
  const [newsEn, newsDe, pagesEn, pagesDe] = await Promise.all([
    fetchAllDocs("news", "en"),
    fetchAllDocs("news", "de"),
    fetchAllDocs("pages", "en"),
    fetchAllDocs("pages", "de"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function zip(collection: Collection, en: any[], de: any[]): SeoListItem[] {
    const deById = new Map(de.map((d) => [d.id, d]));
    return en.map((doc) => {
      const deDoc = deById.get(doc.id);
      const status: "published" | "draft" = doc._status === "published" ? "published" : "draft";
      return {
        id: doc.id,
        collection,
        internalTitle: doc.title ?? "(untitled)",
        slug: doc.slug ?? "",
        status,
        publishedDate: (status === "published" ? doc.publishedAt : doc.createdAt) ?? null,
        publicUrl: publicUrlFor(collection, doc.slug ?? ""),
        en: { title: doc.meta?.title ?? "", description: doc.meta?.description ?? "" },
        de: { title: deDoc?.meta?.title ?? "", description: deDoc?.meta?.description ?? "" },
      };
    });
  }

  return [...zip("news", newsEn, newsDe), ...zip("pages", pagesEn, pagesDe)];
}

export async function getSeoDoc(collection: Collection, id: string) {
  const [en, de] = await Promise.all([
    payloadFetch(`/${collection}/${id}?locale=en&depth=0&draft=true`).then((r) => r.json()),
    payloadFetch(`/${collection}/${id}?locale=de&depth=0&draft=true`).then((r) => r.json()),
  ]);
  return { en, de };
}

const LOCALE_WRITE_GAP_MS = 3000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function saveSeoDraft(
  collection: Collection,
  id: string,
  locales: { en?: SeoLocaleMeta; de?: SeoLocaleMeta }
): Promise<void> {
  if (locales.de) {
    const res = await payloadFetch(`/${collection}/${id}?locale=de&draft=true&overrideLock=true`, {
      method: "PATCH",
      body: JSON.stringify({ meta: locales.de }),
    });
    if (!res.ok) throw new Error(`DE draft save failed (${res.status}): ${await res.text()}`);
    if (locales.en) await sleep(LOCALE_WRITE_GAP_MS);
  }
  if (locales.en) {
    const res = await payloadFetch(`/${collection}/${id}?locale=en&draft=true&overrideLock=true`, {
      method: "PATCH",
      body: JSON.stringify({ meta: locales.en }),
    });
    if (!res.ok) throw new Error(`EN draft save failed (${res.status}): ${await res.text()}`);
  }
}

// The two-step publish trick: PATCH DE as a draft first (so unrelated DE
// validation errors never block publishing), wait for Payload's versions
// collection to settle, then PATCH EN with _status: 'published'. publishedAt
// is read back and re-sent so promoting the draft doesn't reset it to "now"
// (which would reorder the news feed).
export async function publishSeo(
  collection: Collection,
  id: string,
  locales: { en: SeoLocaleMeta; de?: SeoLocaleMeta }
): Promise<void> {
  const current = await payloadFetch(`/${collection}/${id}?locale=en&depth=0&draft=true`).then((r) => r.json());
  const publishedAt = current?.publishedAt;

  if (locales.de) {
    const res = await payloadFetch(`/${collection}/${id}?locale=de&draft=true&overrideLock=true`, {
      method: "PATCH",
      body: JSON.stringify({ meta: locales.de }),
    });
    if (!res.ok) throw new Error(`DE draft save failed (${res.status}): ${await res.text()}`);
    await sleep(LOCALE_WRITE_GAP_MS);
  }

  const res = await payloadFetch(`/${collection}/${id}?locale=en&overrideLock=true`, {
    method: "PATCH",
    body: JSON.stringify({
      _status: "published",
      meta: locales.en,
      ...(publishedAt ? { publishedAt } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Publish failed (${res.status}): ${await res.text()}`);
}
