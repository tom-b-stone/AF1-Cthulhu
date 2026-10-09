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

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

type JsonSchema = Record<string, unknown>;

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  run: (args: Record<string, unknown>, actor: string) => Promise<ToolResult>;
};

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], isError });

function isCollection(v: unknown): v is Collection {
  return v === "news" || v === "pages";
}

const collectionProp = { type: "string", enum: ["news", "pages"], description: "news or pages" };

export const TOOLS: ToolDef[] = [
  {
    name: "seo_list_missing",
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
    description:
      "Publish SEO meta title + description (EN and DE) for one audif1.com news article or page. Validates the brand rules first (title 50-60 chars ending '| Audi Revolut F1® Team', description 100-150, no em-dash, ® marks). Publishes immediately; the publication date is preserved. If validation fails, fix the text and call again — only pass force=true when the user explicitly says to publish anyway.",
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

      await publishSeo(args.collection, args.id, { en, de });
      console.log(`[connector] ${actor} published SEO for ${args.collection}/${args.id}`);
      const warn = warnings.length ? `\nWarnings (published anyway): ${warnings.join("; ")}` : "";
      return text(
        `Published ${args.collection}/${args.id}. Publication date unchanged.\nEN: ${en.title} (${en.title.length}) / ${en.description.length} chars\nDE: ${de.title} (${de.title.length}) / ${de.description.length} chars${warn}`
      );
    },
  },
];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
