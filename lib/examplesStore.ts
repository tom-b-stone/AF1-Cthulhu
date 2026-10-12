import { kvGet, kvSet } from "./kv";

// Good alt-text examples learned from the production library (or added by
// hand). Shown to Claude in the rulebook. Capped at 60, newest first.
export type AltExample = { id: string; subject: string; alt: string; source?: string; addedAt: string };
const KEY = "assets:examples:v1";

export async function readExamples(): Promise<AltExample[]> {
  try {
    const raw = await kvGet(KEY);
    return raw ? (JSON.parse(raw) as AltExample[]) : [];
  } catch {
    return [];
  }
}

export async function addExample(e: Omit<AltExample, "id" | "addedAt">): Promise<AltExample[]> {
  const all = await readExamples();
  if (all.some((x) => x.alt === e.alt)) return all;
  const next = [{ ...e, id: Math.random().toString(36).slice(2, 10), addedAt: new Date().toISOString() }, ...all].slice(0, 60);
  await kvSet(KEY, JSON.stringify(next));
  return next;
}

export async function removeExample(id: string): Promise<AltExample[]> {
  const next = (await readExamples()).filter((x) => x.id !== id);
  await kvSet(KEY, JSON.stringify(next));
  return next;
}
