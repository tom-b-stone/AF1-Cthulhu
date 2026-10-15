import { kvGet, kvSet } from "./kv";
import type { SharePage } from "./photobook";

// Public share pages (QR target), one per Grand Prix slug.
const key = (slug: string) => `photobook:share:${slug}`;

export async function readSharePage(slug: string): Promise<SharePage | null> {
  try {
    const raw = await kvGet(key(slug));
    return raw ? (JSON.parse(raw) as SharePage) : null;
  } catch {
    return null;
  }
}

export async function writeSharePage(p: SharePage): Promise<void> {
  await kvSet(key(p.slug), JSON.stringify(p));
}
