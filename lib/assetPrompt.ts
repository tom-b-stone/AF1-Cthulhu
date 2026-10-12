import type { KnowledgeEntry } from "./teamKnowledge";
import type { AltExample } from "./examplesStore";

// The alt-text rulebook as Claude sees it: internal rules + patterns from
// the seed, people and terms from the editable knowledge store.
export function rulebook(entries: KnowledgeEntry[], examples: AltExample[] = []): string {
  const active = entries.filter((e) => e.active);
  const people = active.filter((e) => e.kind === "person").map((e) => `- ${e.name}${e.de && e.de !== e.name ? ` (DE: ${e.de})` : ""}${e.role ? `, ${e.role}` : ""}${e.aliases?.length ? `; also written: ${e.aliases.join(", ")} → always use "${e.name}"` : ""}${e.cue ? `; cue: ${e.cue}` : ""}`);
  const terms = active.filter((e) => e.kind === "term").map((e) => `- ${e.name}${e.aliases?.length ? ` (never: ${e.aliases.join(", ")})` : ""}${e.note ? ` — ${e.note}` : ""}`);
  const rules = active.filter((e) => e.kind === "rule").map((e) => `- ${e.name}${e.note ? `: ${e.note}` : ""}`);
  const patterns = active.filter((e) => e.kind === "pattern").map((e) => `- ${e.name}${e.note ? ` (${e.note})` : ""}`);
  return `PEOPLE (name them only when you are sure from the picture)
${people.join("\n")}

NAMES & TERMS (exact spellings)
${terms.join("\n")}

ALT TEXT RULES
${rules.join("\n")}

PATTERNS
${patterns.join("\n")}
${examples.length ? `
GOOD EXAMPLES (from the live library, match this voice)
${examples.slice(0, 30).map((e) => `- [${e.subject}] ${e.alt}`).join("\n")}
` : ""}
DESCRIPTOR: 2–6 lowercase words joined with hyphens, ASCII only (hulkenberg, no umlauts), what the picture shows, no team name in it. Examples: bortoleto-garage-close-up, r26-pit-lane-night, mechanics-grid-floodlights.`;
}

export function buildAssetPrompt(batchId: string, count: number, folderPath: string, appOrigin: string): string {
  return `Write the English alt text and a short file-name descriptor for ${count} photos of the Audi Revolut F1® Team, batch ${batchId} (CMS folder ${folderPath}), using the AF1 Tools connector.

APPROVALS: when claude.ai asks you to allow an AF1 Tools call, ask the user once to choose "Always allow" for the AF1 Tools connector, then continue without asking again.

HOW TO WORK
0. Check your tools. If you do NOT have a tool named asset_list_batch:
   - If you DO have seo_publish: the AF1 Tools connector is connected but claude.ai still holds an old tool list. Tell the user in 2 lines: in claude.ai go to Settings → Connectors → AF1 Tools, remove it and add it again with the same URL (from ${appOrigin}/connector), then start a new chat and click "Generate alt text" again. Do nothing else.
   - If you have no AF1 tools at all: tell the user in 3 short lines that the AF1 Tools connector isn't active in their Claude yet; set it up once on ${appOrigin} (the home page shows the steps), then click "Generate alt text" again. Say you can't add it for them. Do nothing else.
1. Call asset_rulebook once and follow it exactly.
2. Call asset_list_batch with batchId "${batchId}". It lists every photo with its id and what is already known (round, session, date, original file name, people if any).
3. For each photo: call asset_get_image (batchId, rowId) to see it, then call asset_set_meta (batchId, rowId, descriptor, alt). Write from what is in the picture plus the batch facts (Grand Prix, session). Skip nothing; a photo you cannot read gets a short factual alt from the batch facts.
4. Do not ask the user to confirm each photo. When all are done, reply with one summary, one fact per line:
Done.
Alt texts written: <n> of ${count}
Then one line per photo: ✓ <descriptor> — <alt text>
If any failed: "Not written: <m>" and one line each with the reason.`;
}

// Learning session: Claude reads photos from the production library that
// already have an alt text, and writes back what it learns: visual cues
// per person and good alt-text examples per subject.
export function buildLearnPrompt(appOrigin: string): string {
  return `Learning session for the Audi Revolut F1® Team Asset Uploader: look at photos in the live media library that already have good alt texts, and teach the tool what it needs to recognise people and match the house style. Use the AF1 Tools connector.

APPROVALS: when claude.ai asks you to allow an AF1 Tools call, ask the user once to choose "Always allow" for the AF1 Tools connector, then continue without asking again.

HOW TO WORK
0. Check your tools. If you do NOT have library_search: if you have seo_publish, tell the user to remove and re-add the AF1 Tools connector in claude.ai (Settings → Connectors) with the same URL from ${appOrigin}/connector, then start a new chat; otherwise tell them to set the connector up once on ${appOrigin}. Do nothing else.
1. Call asset_rulebook to see what is known already.
2. For each of these subjects, call library_search with the query and look at 6 to 8 photos with library_get_image: "Nico Hulkenberg", "Gabriel Bortoleto", "Mattia Binotto", "Allan McNish", "James Key", "Paul Aron", "R26", "garage", "pit wall", "fans".
3. From what you SEE (not from the alt text alone), write cues with knowledge_update for each person: car number and where it is visible, helmet colours and markings, race suit details, face and build, typical places. Keep each cue under 400 characters, concrete, in English. Only write what you saw in at least two photos.
4. Pick the alt texts that follow the rules best (under 125 characters, full team name with ®, one sentence, only what is visible) and save 2 or 3 per subject with knowledge_add_example (subject = driver name, car, garage, pit wall, fans, portrait, partner).
5. Do not ask the user to confirm each step. When done, reply with one summary, one fact per line:
Done.
Cues updated: <names>
Examples saved: <n>
Then one line per cue you wrote.`;
}
