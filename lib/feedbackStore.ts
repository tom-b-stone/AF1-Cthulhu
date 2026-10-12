import { kvGet, kvSet } from "./kv";

// Corrections the team made to what Claude wrote: people, scene, tags. Logged
// automatically at upload when the final values differ from Claude's, and
// shown to Claude in the rulebook so the next batch starts from them.
export type Correction = {
  id: string;
  at: string;
  batchId: string;
  rowId: string;
  originalName: string;
  alt: string;
  ai: { people: string[]; scene?: string };
  final: { people: string[]; scene?: string; tags: string[] };
  by?: string;
};
const KEY = "assets:feedback:v1";
const CAP = 100;

export async function readCorrections(): Promise<Correction[]> {
  try {
    const raw = await kvGet(KEY);
    return raw ? (JSON.parse(raw) as Correction[]) : [];
  } catch {
    return [];
  }
}

export async function addCorrections(items: Omit<Correction, "id" | "at">[]): Promise<Correction[]> {
  const all = await readCorrections();
  const fresh = items.map((c) => ({ ...c, id: Math.random().toString(36).slice(2, 10), at: new Date().toISOString() }));
  const next = [...fresh, ...all.filter((a) => !fresh.some((f) => f.batchId === a.batchId && f.rowId === a.rowId))].slice(0, CAP);
  await kvSet(KEY, JSON.stringify(next));
  return next;
}

export function correctionLine(c: Correction): string {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const parts: string[] = [];
  if (!same(c.ai.people, c.final.people)) parts.push(`people: Claude said [${c.ai.people.join(", ") || "none"}], correct is [${c.final.people.join(", ") || "none"}]`);
  if (c.ai.scene !== c.final.scene) parts.push(`scene: Claude said ${c.ai.scene ?? "none"}, correct is ${c.final.scene ?? "none"}`);
  return `- "${c.alt.slice(0, 90)}" → ${parts.join("; ") || "tags adjusted to " + c.final.tags.join(", ")}`;
}
