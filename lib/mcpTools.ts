// Tools the AF1 Tools connector exposes to Claude. Keep each one small and
// safe: every write goes through the same validation and publish path the
// SEO Studio UI uses, so nothing the connector can do is a new capability —
// it just removes a click. New tools for other apps (asset uploader, CRM
// images) belong in this file too, prefixed by tool name.
import { getHomeMetaImageId } from "./payloadClient";
import { validateSeoField } from "./seoBrand";
import { SEO_RULES, SEO_WRITE_RECIPE } from "./seoHandoff";
import { SCENE_TAGS, peopleInText, uniqueTags, type Scene } from "./contentTags";
import { readBatch, readPreview, writeBatch } from "./assetBatchStore";
import { readKnowledge, KNOWLEDGE_KEY } from "./knowledgeStore";
import { kvSet } from "./kv";
import { searchLibrary, fetchLibraryImage } from "./library";
import { addExample, readExamples } from "./examplesStore";
import { addReference, listReferences, readReferenceImage } from "./referenceStore";
import { readCorrections } from "./feedbackStore";
import { learnPerson } from "./learnRun";
import { rulebook } from "./assetPrompt";
import { cleanDescriptor, validateAlt, knowledgeIssues, ALT_MAX } from "./assetNaming";

export type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };

type JsonSchema = Record<string, unknown>;

// MCP tool annotations (2025-03-26 spec). Clients use them to decide how
// much to ask: a read-only tool can run without a per-call approval, a
// non-destructive, idempotent write is a lower bar than a destructive one.
// claude.ai still shows its own "Allow once / Always allow" prompt for the
// first call; "Always allow" is what removes the clicks for the user.
export type ToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: ToolAnnotations;
  run: (args: Record<string, unknown>, actor: string) => Promise<ToolResult>;
};

// "Publication date untouched: 12 Sep 2026, still published" — or a loud
// warning if Payload moved it, which is the one thing this flow must never do.
export function describeDate(r: { publishedAtBefore: string | null; publishedAtAfter: string | null; status: string }): string {
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "none";
  const same = (r.publishedAtBefore ?? "") === (r.publishedAtAfter ?? "");
  if (same) return `Publication date: untouched, ${fmt(r.publishedAtAfter)}, still ${r.status}`;
  return `WARNING: publication date changed from ${fmt(r.publishedAtBefore)} to ${fmt(r.publishedAtAfter)} (status ${r.status}). Tell the user.`;
}

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], isError });


export const TOOLS: ToolDef[] = [
  // ---- SEO Studio -----------------------------------------------------
  // Reads and writes now go through the team's "AF1 Payload Staging MCP"
  // (per-user CMS login). This connector keeps what that one doesn't have:
  // the brand rules, the check, and the home meta-image fallback.
  {
    name: "seo_rules",
    annotations: { title: "SEO rules + write recipe", readOnlyHint: true, openWorldHint: false },
    description:
      "The audif1.com SEO meta rules (lengths, title patterns, brand spellings), the home page meta image ids to use when a doc has none, and the exact recipe for writing meta with the AF1 Payload Staging MCP without changing the publication date. Call once before writing SEO.",
    inputSchema: { type: "object", properties: {} },
    async run() {
      const [en, de] = await Promise.all([getHomeMetaImageId("en").catch(() => null), getHomeMetaImageId("de").catch(() => null)]);
      return text(`${SEO_RULES}

HOME META IMAGE (use when the doc's meta.image is empty in that locale)
en: ${en ?? "(none found)"}
de: ${de ?? en ?? "(none found)"}

${SEO_WRITE_RECIPE}`);
    },
  },
  {
    name: "seo_check",
    annotations: { title: "Check SEO texts", readOnlyHint: true, openWorldHint: false },
    description:
      "Check EN and DE SEO title + description against the audif1.com brand rules before writing them with the Payload MCP. Returns OK or the issues to fix. Does not write anything.",
    inputSchema: {
      type: "object",
      required: ["en_title", "en_description"],
      properties: {
        en_title: { type: "string" },
        en_description: { type: "string" },
        de_title: { type: "string" },
        de_description: { type: "string" },
      },
    },
    async run(args) {
      const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string).trim() : "");
      const errors: string[] = [];
      const warnings: string[] = [];
      for (const [label, kind, key] of [
        ["EN title", "title", "en_title"],
        ["EN description", "description", "en_description"],
        ["DE title", "title", "de_title"],
        ["DE description", "description", "de_description"],
      ] as const) {
        const v = str(key);
        if (!v) {
          if (key.startsWith("en")) errors.push(`${label}: empty`);
          continue;
        }
        const r = validateSeoField(kind, v);
        errors.push(...r.errors.map((e) => `${label}: ${e}`));
        warnings.push(...r.warnings.map((w) => `${label}: ${w}`));
      }
      if (errors.length) return text(`NOT OK — fix and check again:\n${errors.join("\n")}`, true);
      return text(`OK${warnings.length ? ` (warnings: ${warnings.join("; ")})` : ""}`);
    },
  },
  // ---- Asset Uploader -------------------------------------------------
  {
    name: "asset_rulebook",
    annotations: { title: "Alt text rulebook", readOnlyHint: true, openWorldHint: false },
    description: "The rules for audif1.com image alt texts and file-name descriptors: people (official spellings), terms, rules, patterns. Call once before writing alt texts.",
    inputSchema: { type: "object", properties: {} },
    async run() {
      return text(rulebook(await readKnowledge(), await readExamples(), await listReferences(), await readCorrections()));
    },
  },
  {
    name: "asset_list_batch",
    annotations: { title: "List a photo batch", readOnlyHint: true, openWorldHint: false },
    description: "List the photos of an Asset Uploader batch: row ids, original file names, what is known (Grand Prix, session, date, people), and the current descriptor / alt text.",
    inputSchema: { type: "object", required: ["batchId"], properties: { batchId: { type: "string" } } },
    async run(args) {
      const b = await readBatch(String(args.batchId ?? ""));
      if (!b) return text("Batch not found on the server (previews expire after 7 days; open the batch and click Generate alt text again).", true);
      const head = `Batch ${b.id} · ${b.rows.length} photos · folder ${b.folderPath} · ${b.race ?? ""} ${b.year} ${b.loc}${b.session ? ` · session ${b.session}` : ""}`;
      const rows = b.rows.map((r) => `${r.id} · ${r.originalName}${r.date ? ` · ${r.date}` : ""}${r.context ? ` · slot ${r.context}` : ""}${r.people?.length ? ` · people: ${r.people.join(", ")}` : ""} · descriptor: ${r.descriptor || "(none)"} · alt: ${r.alt || "(none)"}`);
      return text(`${head}\n${rows.join("\n")}`);
    },
  },
  {
    name: "asset_get_image",
    annotations: { title: "See a photo", readOnlyHint: true, openWorldHint: false },
    description: "Returns a preview of one photo in a batch so you can describe it.",
    inputSchema: { type: "object", required: ["batchId", "rowId"], properties: { batchId: { type: "string" }, rowId: { type: "string" } } },
    async run(args) {
      const p = await readPreview(String(args.batchId ?? ""), String(args.rowId ?? ""));
      if (!p) return text("No preview for this photo on the server.", true);
      return { content: [{ type: "image", data: p.data, mimeType: p.mime }, { type: "text", text: `Photo ${args.rowId} of batch ${args.batchId}.` }] };
    },
  },
  {
    name: "asset_set_meta",
    annotations: { title: "Write descriptor + alt text", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: `Write the file-name descriptor and the English alt text for one photo, plus what is in it for the content tags: "people" (official names of team people you can identify with evidence, empty if none) and "scene" (one of "on-track & garage" = car, track, pit lane, garage; "team" = team members, staff, management in frame; "off-track" = paddock, fans, city, events). Validates: alt under ${ALT_MAX} chars, team name only "Audi Revolut F1® Team", no em-dash, official spellings. Returns the issues if any; fix and call again.`,
    inputSchema: {
      type: "object",
      required: ["batchId", "rowId", "descriptor", "alt", "scene"],
      properties: {
        batchId: { type: "string" },
        rowId: { type: "string" },
        descriptor: { type: "string" },
        alt: { type: "string" },
        people: { type: "array", items: { type: "string" }, description: "Official names, e.g. [\"Nico Hulkenberg\"]. Only with evidence (car number, helmet, suit name, clear face)." },
        scene: { type: "string", enum: ["on-track & garage", "team", "off-track"] },
      },
    },
    async run(args, actor) {
      const b = await readBatch(String(args.batchId ?? ""));
      if (!b) return text("Batch not found on the server.", true);
      const row = b.rows.find((r) => r.id === String(args.rowId));
      if (!row) return text("Row not found in this batch.", true);
      const alt = String(args.alt ?? "").trim().replace(/\s+/g, " ");
      const descriptor = cleanDescriptor(String(args.descriptor ?? ""));
      const issues = [...validateAlt(alt), ...knowledgeIssues(alt, await readKnowledge())];
      if (issues.length) return text(`NOT written — fix and call again:\n${issues.join("\n")}`, true);
      if (!descriptor) return text("NOT written — descriptor is empty after cleaning (2–6 lowercase words, hyphens).", true);
      row.alt = alt;
      row.descriptor = descriptor;
      if (Array.isArray(args.people)) row.people = (args.people as unknown[]).map(String).filter(Boolean);
      // a driver named in the alt text (or by car number) counts too
      row.people = uniqueTags(row.people, peopleInText(`${alt} ${descriptor}`, await readKnowledge()));
      if (typeof args.scene === "string" && SCENE_TAGS.includes(args.scene as Scene)) row.scene = args.scene;
      b.updatedAt = new Date().toISOString();
      await writeBatch(b);
      console.log(`[connector] ${actor} wrote alt for ${b.id}/${row.id}`);
      return text(`Written. ${row.originalName} → ${descriptor} · "${alt}" (${alt.length} chars)${row.scene ? ` · ${row.scene}` : ""}${row.people?.length ? ` · ${row.people.join(", ")}` : ""}`);
    },
  },
  // ---- Learning session (production library, read-only) ---------------
  {
    name: "library_search",
    annotations: { title: "Search the live media library", readOnlyHint: true, openWorldHint: false },
    description: "Search the production audif1.com media library by alt text (e.g. 'Nico Hulkenberg', 'R26', 'garage'). Returns id, file name, alt text and date, newest first. Read-only.",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 }, page: { type: "integer", minimum: 1 } } },
    async run(args) {
      const r = await searchLibrary(String(args.query ?? ""), Number(args.limit ?? 12), Number(args.page ?? 1));
      return text(`${r.total} photos match.\n${r.items.map((i) => `${i.id} · ${i.filename} · ${i.createdAt.slice(0, 10)} · "${i.alt}"`).join("\n")}`);
    },
  },
  {
    name: "library_get_image",
    annotations: { title: "See a library photo", readOnlyHint: true, openWorldHint: false },
    description: "Returns a preview of one production library photo plus its alt text, so you can compare what is in the picture with how it was described.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async run(args) {
      const p = await fetchLibraryImage(String(args.id ?? ""));
      if (!p) return text("Photo not available.", true);
      return { content: [{ type: "image", data: p.data, mimeType: p.mime }, { type: "text", text: `${p.filename}\nalt: "${p.alt}"` }] };
    },
  },
  {
    name: "knowledge_update",
    annotations: { title: "Update a person's cue", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: "Write or replace the visual cue (and optionally a note or extra alias) of a person or term in Team knowledge. Match by exact name as listed in asset_rulebook.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, cue: { type: "string", description: "How to recognise them in a photo, under 400 chars" }, note: { type: "string" }, add_alias: { type: "string" } },
    },
    async run(args, actor) {
      const entries = await readKnowledge();
      const e = entries.find((x) => x.name.toLowerCase() === String(args.name ?? "").toLowerCase());
      if (!e) return text(`No entry named "${args.name}". Names in the rulebook: ${entries.filter((x) => x.kind === "person").map((x) => x.name).join(", ")}`, true);
      if (typeof args.cue === "string" && args.cue.trim()) e.cue = args.cue.trim().slice(0, 400);
      if (typeof args.note === "string" && args.note.trim()) e.note = args.note.trim().slice(0, 800);
      if (typeof args.add_alias === "string" && args.add_alias.trim()) e.aliases = Array.from(new Set([...(e.aliases ?? []), args.add_alias.trim()])).slice(0, 12);
      await kvSet(KNOWLEDGE_KEY, JSON.stringify(entries));
      console.log(`[connector] ${actor} updated knowledge for ${e.name}`);
      return text(`Updated ${e.name}.${e.cue ? ` Cue: ${e.cue}` : ""}`);
    },
  },
  {
    name: "knowledge_add_example",
    annotations: { title: "Save a good alt text example", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: "Save an alt text from the library as a style example (subject: driver name, car, garage, pit wall, fans, portrait, partner). Validated against the rules first.",
    inputSchema: { type: "object", required: ["subject", "alt"], properties: { subject: { type: "string" }, alt: { type: "string" }, source: { type: "string", description: "library photo id or file name" } } },
    async run(args, actor) {
      const alt = String(args.alt ?? "").trim();
      const issues = [...validateAlt(alt), ...knowledgeIssues(alt, await readKnowledge())];
      if (issues.length) return text(`Not saved, it breaks the rules: ${issues.join("; ")}`, true);
      const all = await addExample({ subject: String(args.subject ?? "general").slice(0, 40), alt, source: typeof args.source === "string" ? args.source : undefined });
      console.log(`[connector] ${actor} saved example (${all.length} total)`);
      return text(`Saved. ${all.length} examples in the rulebook.`);
    },
  },
  {
    name: "knowledge_references",
    annotations: { title: "List reference photos", readOnlyHint: true, openWorldHint: false },
    description: "List the saved reference photos per person (id, person, note). Look at them with knowledge_reference_image to learn faces, helmets and suits before naming people.",
    inputSchema: { type: "object", properties: { person: { type: "string", description: "optional filter" } } },
    async run(args) {
      const refs = await listReferences();
      const f = typeof args.person === "string" ? args.person.toLowerCase() : "";
      const list = f ? refs.filter((r) => r.person.toLowerCase().includes(f)) : refs;
      if (!list.length) return text("No reference photos saved yet.");
      return text(list.map((r) => `${r.id} · ${r.person}${r.note ? ` · ${r.note}` : ""}`).join("\n"));
    },
  },
  {
    name: "knowledge_reference_image",
    annotations: { title: "Show a reference photo", readOnlyHint: true, openWorldHint: false },
    description: "Returns one saved reference photo of a person (id from knowledge_references or asset_rulebook).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async run(args) {
      const refs = await listReferences();
      const meta = refs.find((r) => r.id === String(args.id));
      const img = meta ? await readReferenceImage(meta.id) : null;
      if (!meta || !img) return text("No reference photo with that id.", true);
      return { content: [{ type: "image", data: img.data, mimeType: img.mime }, { type: "text", text: `${meta.person}${meta.note ? ` — ${meta.note}` : ""}` }] };
    },
  },
  {
    name: "knowledge_add_reference",
    annotations: { title: "Save a reference photo", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: "Save a production library photo (id from library_search) as a reference photo of a person, with a short note on what identifies them in it (helmet colours, suit, face). Max 8 per person; oldest is dropped.",
    inputSchema: { type: "object", required: ["libraryId", "person"], properties: { libraryId: { type: "string" }, person: { type: "string", description: "official name as in asset_rulebook" }, note: { type: "string" } } },
    async run(args, actor) {
      const img = await fetchLibraryImage(String(args.libraryId ?? ""));
      if (!img) return text("Library photo not found.", true);
      const known = (await readKnowledge()).filter((e) => e.kind === "person" && e.active).map((e) => e.name);
      const person = String(args.person ?? "").trim();
      const match = known.find((n) => n.toLowerCase() === person.toLowerCase());
      if (!match) return text(`Unknown person "${person}". Known: ${known.join(", ")}`, true);
      const refs = await addReference({ person: match, note: typeof args.note === "string" ? args.note.slice(0, 200) : undefined, source: `library:${args.libraryId}`, mime: img.mime, data: img.data });
      console.log(`[connector] ${actor} saved a reference for ${match}`);
      return text(`Saved. ${refs.filter((r) => r.person === match).length} reference photos for ${match}.`);
    },
  },
  {
    name: "learn_person",
    annotations: { title: "Learn a person from the library", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: "Runs the tool's own learning for one person (needs the Anthropic API key set in the app): looks at up to 8 production library photos that name them, saves the unmistakable ones as reference photos (up to 6 per person) and writes a recognition cue into Team knowledge. Call once per person from asset_rulebook's PEOPLE list.",
    inputSchema: { type: "object", required: ["person"], properties: { person: { type: "string", description: "official name" } } },
    async run(args, actor) {
      try {
        const r = await learnPerson(String(args.person ?? ""), { maxLook: 8, wantRefs: 6 });
        console.log(`[connector] ${actor} learned ${r.person}: ${r.saved} refs`);
        return text(`${r.person}: looked at ${r.looked} photos, saved ${r.saved} reference photos${r.cue ? `, cue: ${r.cue}` : ""}${r.skipped ? ` (${r.skipped})` : ""}`);
      } catch (e) {
        return text(e instanceof Error ? e.message : "failed", true);
      }
    },
  },
];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
