import { kvDel, kvGet, kvSet } from "./kv";

// Reference photos per person, so Claude can compare a face, a helmet or a
// suit with a known picture before naming anyone. Added from a batch (the
// team "teaches" from a photo they just corrected) or by Claude itself from
// the production library during a learning session. Index + one image per
// key; at most 8 per person, oldest dropped.
export type RefMeta = { id: string; person: string; note?: string; source?: string; at: string; mime: string };
const INDEX = "assets:refs:index";
export const REFS_PER_PERSON = 8;

export async function listReferences(): Promise<RefMeta[]> {
  try {
    const raw = await kvGet(INDEX);
    return raw ? (JSON.parse(raw) as RefMeta[]) : [];
  } catch {
    return [];
  }
}

export async function readReferenceImage(id: string): Promise<{ mime: string; data: string } | null> {
  const raw = await kvGet(`assets:ref:${id}`);
  return raw ? (JSON.parse(raw) as { mime: string; data: string }) : null;
}

export async function addReference(input: { person: string; note?: string; source?: string; mime: string; data: string }): Promise<RefMeta[]> {
  const all = await listReferences();
  const person = input.person.trim();
  const id = Math.random().toString(36).slice(2, 10);
  const meta: RefMeta = { id, person, note: input.note?.trim() || undefined, source: input.source, at: new Date().toISOString(), mime: input.mime };
  await kvSet(`assets:ref:${id}`, JSON.stringify({ mime: input.mime, data: input.data }));
  const mine = all.filter((r) => r.person.toLowerCase() === person.toLowerCase());
  const drop = mine.length >= REFS_PER_PERSON ? mine.slice(0, mine.length - REFS_PER_PERSON + 1) : [];
  for (const d of drop) await kvDel(`assets:ref:${d.id}`);
  const next = [...all.filter((r) => !drop.some((d) => d.id === r.id)), meta];
  await kvSet(INDEX, JSON.stringify(next));
  return next;
}

export async function removeReference(id: string): Promise<RefMeta[]> {
  const next = (await listReferences()).filter((r) => r.id !== id);
  await kvDel(`assets:ref:${id}`);
  await kvSet(INDEX, JSON.stringify(next));
  return next;
}
