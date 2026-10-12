// Tools the AF1 Tools connector exposes to Claude. Keep each one small and
// safe: every write goes through the same validation and publish path the
// SEO Studio UI uses, so nothing the connector can do is a new capability —
// it just removes a click. New tools for other apps (asset uploader, CRM
// images) belong in this file too, prefixed by tool name.
import {
  cmsAdminUrlFor,
  getSeoGenerationSource,
  listSeoItems,
  publishSeo,
  type Collection,
} from "./payloadClient";
import { validateSeoField } from "./seoBrand";
import { SCENE_TAGS, type Scene } from "./contentTags";
import { readBatch, readPreview, writeBatch } from "./assetBatchStore";
import { readKnowledge, KNOWLEDGE_KEY } from "./knowledgeStore";
import { kvSet } from "./kv";
import { searchLibrary, fetchLibraryImage } from "./library";
import { addExample, readExamples } from "./examplesStore";
import { addReference, listReferences, readReferenceImage } from "./referenceStore";
import { readCorrections } from "./feedbackStore";
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

function isCollection(v: unknown): v is Collection {
  return v === "news" || v === "pages";
}

const collectionProp = { type: "string", enum: ["news", "pages"], description: "news or pages" };

export const TOOLS: ToolDef[] = [
  {
    name: "seo_list_missing",
    annotations: { title: "List docs missing SEO", readOnlyHint: true, openWorldHint: false },
    description:
      "List audif1.com news/pages that are missing an EN or DE SEO title/description. Returns collection, id and internal title for each, oldest first. Use before generating in bulk.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 20, description: "How many to return (default 5)" } },
    },
    async run(args) {
      const limit = Math.min(20, Math.max(1, Number(args.limit ?? 5)));
      const all = await listSeoItems();
      const missing = all.filter((i) => !i.en.title || !i.en.description || !i.de.title || !i.de.description);
      const rows = missing.slice(0, limit).map((i) => `${i.collection} ${i.id} — ${i.internalTitle} (${i.status})`);
      return text(`${missing.length} of ${all.length} docs are missing EN or DE SEO.\n${rows.join("\n")}`);
    },
  },
  {
    name: "seo_get_page",
    annotations: { title: "Read page content", readOnlyHint: true, openWorldHint: false },
    description:
      "Get the real content of one audif1.com news article or page (EN and DE) to write SEO meta from. Returns internal title, CMS admin link, and the page text in both languages. Never invent facts beyond this.",
    inputSchema: {
      type: "object",
      required: ["collection", "id"],
      properties: { collection: collectionProp, id: { type: "string", description: "Payload document id" } },
    },
    async run(args) {
      if (!isCollection(args.collection) || typeof args.id !== "string") {
        return text("collection must be news|pages and id is required", true);
      }
      const s = await getSeoGenerationSource(args.collection, args.id);
      return text(
        `Internal title: ${s.internalTitle}\nCMS: ${cmsAdminUrlFor(args.collection, args.id, "en")}\n\nContent EN:\n${s.contentText.en.slice(0, 4000) || "(none)"}\n\nContent DE:\n${s.contentText.de.slice(0, 4000) || "(none)"}`
      );
    },
  },
  {
    name: "seo_publish",
    annotations: { title: "Publish SEO meta", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Publish SEO meta title + description (EN and DE) for one audif1.com news article or page. Validates the brand rules first (title 50-60 chars ending '| Audi Revolut F1® Team', description 100-150, no em-dash, ® marks). Publishes immediately; the publication date is preserved, and a doc without a meta image gets the home page's meta image. If validation fails, fix the text and call again — only pass force=true when the user explicitly says to publish anyway.",
    inputSchema: {
      type: "object",
      required: ["collection", "id", "en_title", "en_description", "de_title", "de_description"],
      properties: {
        collection: collectionProp,
        id: { type: "string" },
        en_title: { type: "string" },
        en_description: { type: "string" },
        de_title: { type: "string" },
        de_description: { type: "string" },
        force: { type: "boolean", description: "Publish even if a hard brand rule fails. Default false." },
      },
    },
    async run(args, actor) {
      if (!isCollection(args.collection) || typeof args.id !== "string") {
        return text("collection must be news|pages and id is required", true);
      }
      const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string).trim() : "");
      const en = { title: str("en_title"), description: str("en_description") };
      const de = { title: str("de_title"), description: str("de_description") };
      if (!en.title || !en.description) return text("en_title and en_description are required", true);

      const errors: string[] = [];
      const warnings: string[] = [];
      for (const [label, kind, value] of [
        ["EN title", "title", en.title],
        ["EN description", "description", en.description],
        ["DE title", "title", de.title],
        ["DE description", "description", de.description],
      ] as const) {
        if (!value) continue;
        const r = validateSeoField(kind, value);
        errors.push(...r.errors.map((e) => `${label}: ${e}`));
        warnings.push(...r.warnings.map((w) => `${label}: ${w}`));
      }
      if (errors.length && args.force !== true) {
        return text(`NOT published — fix these and call again:\n${errors.join("\n")}`, true);
      }

      const r = await publishSeo(args.collection, args.id, { en, de });
      console.log(`[connector] ${actor} published SEO for ${args.collection}/${args.id}`);
      const warn = warnings.length ? `\nWarnings (published anyway): ${warnings.join("; ")}` : "";
      const dateLine = describeDate(r);
      return text(
        `Done.\nSEO written to: ${r.internalTitle}\nCMS: ${r.cmsUrl}\n${dateLine}\nEN title: ${en.title} (${en.title.length} chars, description ${en.description.length})\nDE title: ${de.title || "(none)"} (${de.title.length} chars, description ${de.description.length})${warn}`
      );
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
];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
