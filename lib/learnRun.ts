// In-tool learning for one person: pull library photos whose alt text names
// them, let Claude (API) judge which ones show the person unmistakably and
// what identifies them, save the best as reference photos, and write a
// recognition cue into Team knowledge. One person per call so it fits a
// 60 s function; the learn page and the connector tool loop over people.
import { fetchLibraryImage, searchLibrary } from "./library";
import { addReference, listReferences, readReferenceImage, REFS_PER_PERSON } from "./referenceStore";
import { readKnowledge, KNOWLEDGE_KEY } from "./knowledgeStore";
import { kvSet } from "./kv";
import { getAnthropicSettings } from "./settings";

export type LearnResult = { person: string; looked: number; saved: number; cue?: string; skipped?: string };

type Judgement = { identifiable: boolean; confidence: number; note: string; cues: string };

const SYSTEM = `You help a Formula 1 team tool learn to recognise its people in photos. You answer with one JSON object only, no prose, no code fence.`;

async function judge(apiKey: string, model: string, person: string, role: string, img: { mime: string; data: string }, alt: string): Promise<Judgement | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.mime, data: img.data } },
            {
              type: "text",
              text: `The caption says: "${alt}". The person of interest is ${person} (${role}). Is ${person} shown clearly and unmistakably in this photo (face visible, or helmet/suit/car number that identifies them), such that this photo would help someone recognise them later? Answer: {"identifiable": true|false, "confidence": 0-1, "note": "<what identifies them here, under 120 chars>", "cues": "<lasting visual cues of this person seen here: helmet colours and markings, hair, build, glasses, usual kit; under 200 chars>"}`,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as { content: { text?: string }[] };
  const m = json.content.map((c) => c.text ?? "").join("").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]) as Partial<Judgement>;
    return { identifiable: Boolean(p.identifiable), confidence: Number(p.confidence ?? 0), note: String(p.note ?? "").slice(0, 160), cues: String(p.cues ?? "").slice(0, 240) };
  } catch {
    return null;
  }
}

async function summariseCue(apiKey: string, model: string, person: string, role: string, cues: string[], existing?: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 250,
      system: "You write short, concrete recognition cues. Plain text, one paragraph, under 380 characters, English.",
      messages: [{ role: "user", content: `Person: ${person} (${role}).${existing ? `\nCurrent cue: ${existing}` : ""}\nObservations from ${cues.length} photos:\n${cues.map((c) => `- ${c}`).join("\n")}\n\nWrite the cue: how to recognise ${person} in a photo (car number if a driver, helmet colours and markings, hair, build, glasses, usual kit, where they usually stand). Only what the observations support.` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const json = (await res.json()) as { content: { text?: string }[] };
  return json.content.map((c) => c.text ?? "").join("").trim().slice(0, 400);
}

export async function learnPerson(personName: string, opts: { maxLook?: number; wantRefs?: number } = {}): Promise<LearnResult> {
  const s = await getAnthropicSettings();
  if (!s) throw new Error("No Anthropic API key set (Admin → Claude API)");
  const entries = await readKnowledge();
  const e = entries.find((x) => x.kind === "person" && x.name.toLowerCase() === personName.toLowerCase());
  if (!e) throw new Error(`Unknown person "${personName}"`);
  const have = (await listReferences()).filter((r) => r.person === e.name);
  const want = Math.max(0, (opts.wantRefs ?? 6) - have.length);
  const maxLook = opts.maxLook ?? 10;

  // photos whose alt text names them; the surname alone catches "Hulkenberg" too
  const surname = e.name.split(" ").pop()!;
  const found = await searchLibrary(surname, 40);
  const seen = new Set(have.map((r) => r.source ?? ""));
  const candidates = found.items.filter((i) => !seen.has(`library:${i.id}`)).slice(0, maxLook);
  if (!candidates.length) return { person: e.name, looked: 0, saved: 0, skipped: "no library photos name them" };

  let saved = 0;
  const cues: string[] = [];
  const judged: { id: string; conf: number; note: string }[] = [];
  for (const c of candidates) {
    const img = await fetchLibraryImage(c.id);
    if (!img) continue;
    const j = await judge(s.key, s.model, e.name, e.role ?? "", img, c.alt);
    if (!j) continue;
    if (j.cues) cues.push(j.cues);
    if (j.identifiable && j.confidence >= 0.7) judged.push({ id: c.id, conf: j.confidence, note: j.note });
  }
  judged.sort((a, b) => b.conf - a.conf);
  for (const j of judged.slice(0, want)) {
    const img = await fetchLibraryImage(j.id);
    if (!img) continue;
    await addReference({ person: e.name, note: j.note, source: `library:${j.id}`, mime: img.mime, data: img.data });
    saved++;
  }
  let cue: string | undefined;
  if (cues.length >= 2) {
    cue = await summariseCue(s.key, s.model, e.name, e.role ?? "", cues, e.cue);
    if (cue) {
      e.cue = cue;
      await kvSet(KNOWLEDGE_KEY, JSON.stringify(entries));
    }
  }
  return { person: e.name, looked: candidates.length, saved, cue };
}

export async function referenceCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const r of await listReferences()) out[r.person] = (out[r.person] ?? 0) + 1;
  return out;
}

export { readReferenceImage, REFS_PER_PERSON };
