// Server-only: the GP Mini-Zine how-to illustrations and the teaser
// animation live in /public/zine/media. They are uploaded to the staging
// media library once (folder "GP Mini-Zine") and the ids cached in KV, so
// every GP page reuses the same media.
import { kvGet, kvSet } from "./kv";
import { createMediaFolder, listMediaFolders, uploadToCollection } from "./payloadClient";
import { ZINE_STEPS, type ZineAssets } from "./zinePage";

const KEY = "zine:assets:v1";
const FOLDER = "GP Mini-Zine";

export async function zineFolder(): Promise<string | null> {
  try {
    const all = await listMediaFolders();
    const hit = all.find((f) => f.name === FOLDER && !f.parent);
    if (hit) return hit.id;
    return (await createMediaFolder(FOLDER, null)).id;
  } catch {
    return null;
  }
}

export async function ensureZineAssets(origin: string, force = false): Promise<ZineAssets> {
  if (!force) {
    const raw = await kvGet(KEY).catch(() => null);
    if (raw) return JSON.parse(raw) as ZineAssets;
  }
  const folder = await zineFolder();
  const up = async (file: string, alt: string) => {
    const res = await fetch(`${origin}/zine/media/${file}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`asset ${file}: ${res.status}`);
    const blob = await res.blob();
    return (await uploadToCollection("media", blob, file, { alt, ...(folder ? { folder } : {}) })).id;
  };
  const teaser = await up("audif1_gp-mini-zine_teaser.mp4", "Animation: an A4 sheet of Grand Prix photos is cut and folded into the Audi Revolut F1® Team GP Mini-Zine");
  const steps: string[] = [];
  for (let i = 0; i < ZINE_STEPS.length; i++) {
    const n = String(i + 1).padStart(2, "0");
    steps.push(await up(`audif1_gp-mini-zine_step-${n}.png`, `GP Mini-Zine how-to, step ${i + 1}: ${ZINE_STEPS[i].headline}. Line illustration.`));
  }
  const assets = { teaser, steps };
  await kvSet(KEY, JSON.stringify(assets));
  return assets;
}
