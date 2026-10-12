import type { KnowledgeEntry } from "./teamKnowledge";

// The alt-text rulebook as Claude sees it: internal rules + patterns from
// the seed, people and terms from the editable knowledge store.
export function rulebook(entries: KnowledgeEntry[]): string {
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

DESCRIPTOR: 2–6 lowercase words joined with hyphens, ASCII only (hulkenberg, no umlauts), what the picture shows, no team name in it. Examples: bortoleto-garage-close-up, r26-pit-lane-night, mechanics-grid-floodlights.`;
}

export function buildAssetPrompt(batchId: string, count: number, folderPath: string, appOrigin: string): string {
  return `Write the English alt text and a short file-name descriptor for ${count} photos of the Audi Revolut F1® Team, batch ${batchId} (CMS folder ${folderPath}), using the AF1 Tools connector.

APPROVALS: when claude.ai asks you to allow an AF1 Tools call, ask the user once to choose "Always allow" for the AF1 Tools connector, then continue without asking again.

HOW TO WORK
0. Check your tools. If you do NOT have a tool named asset_list_batch, stop and tell the user in 3 short lines: the AF1 Tools connector isn't active in their Claude yet; set it up once on ${appOrigin} (home page shows the steps, or ${appOrigin}/connector), then click "Generate alt text" again. Say you can't add it for them. Do nothing else.
1. Call asset_rulebook once and follow it exactly.
2. Call asset_list_batch with batchId "${batchId}". It lists every photo with its id and what is already known (round, session, date, original file name, people if any).
3. For each photo: call asset_get_image (batchId, rowId) to see it, then call asset_set_meta (batchId, rowId, descriptor, alt). Write from what is in the picture plus the batch facts (Grand Prix, session). Skip nothing; a photo you cannot read gets a short factual alt from the batch facts.
4. Do not ask the user to confirm each photo. When all are done, reply with one summary, one fact per line:
Done.
Alt texts written: <n> of ${count}
Then one line per photo: ✓ <descriptor> — <alt text>
If any failed: "Not written: <m>" and one line each with the reason.`;
}
