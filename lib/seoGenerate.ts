// Drafts brand-compliant SEO title/description pairs from a doc's own
// content, calling Claude server-side. Mirrors the audif1-seo-sync skill's
// brand-seo-pattern rules exactly (same rules lib/seoBrand.ts validates
// against) so a generated value should pass validateSeoField without
// hand-editing.
import { getAnthropicApiKey } from "./settings";
import { validateSeoField } from "./seoBrand";
import type { Collection, SeoGenerationSource } from "./payloadClient";

// Adjustable without a code change — set ANTHROPIC_MODEL in Vercel if a
// newer model id should be used.
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

const BRAND_RULES = `
You write SEO meta titles and descriptions for audif1.com, the Audi Revolut F1® Team site.
Follow these rules exactly — they are validated by code after you answer, so breaking them
means the write gets rejected:

- Title: 50-60 characters (45-49 is acceptable only for legal/utility pages). Ends with
  "| Audi Revolut F1® Team" (or a close variant like "| Audi Revolut F1® Team Insights").
- Description: 100-150 characters (up to 160 only if trimming would lose real meaning).
- Always "Audi Revolut F1® Team" and "F1®" / "Formula 1®" with the registered mark. Never
  "F1@", "Audi Revolut F1® Teamng", "Audi F1 Team", "Audi-F1", or "AF1 Team".
- NEVER use an em-dash (—) in any form, including "&mdash;". Use a comma, period, colon, or
  (German only) an en-dash with spaces ( – ) instead.
- No double spaces, no leading/trailing whitespace, no double punctuation.
- German: use "Hülkenberg", "Großer Preis von", "Vorschau", "Rückblick". Don't translate
  proper nouns (Suzuka, Montréal) or model names (R26). Don't leave English text in German.
- Base the content on the real facts given below — don't invent results, names, or places
  that aren't in the source text. If the source text is thin, write a shorter but still
  accurate line rather than padding with invented specifics.
- Avoid filler like "Stay tuned for" or "Don't miss".

Title patterns by article type (match the closest one; if none fit, write a plain
"{Subject} | Audi Revolut F1® Team" style title):
Race Preview: "{Year} {Race} Grand Prix Preview | Audi Revolut F1® Team"
Track Preview: "{Location} Circuit Guide | Audi Revolut F1® Team Insights"
Day 1: "{Location} Day 1 | Audi Revolut F1® Team starts the next chapter"
Qualifying: "{Location} Qualifying: Audi Revolut F1® Team at {Race} GP"
Recap: "{Race} Grand Prix {Year} Recap | Audi Revolut F1® Team"
Galleries: "{Location} {Year} Galleries | Audi Revolut F1® Team in {Country}"
Interview (All4One): "{Name} Interview | Audi Revolut F1® Team {Role}"
Off-track/Activation: "{City} {Year} Activations | Audi Revolut F1® Team"
Legal/utility: "{Document} | Audi Revolut F1® Team" (kept short, 45-49 chars is fine)
`.trim();

export type GeneratedLocaleMeta = { title: string; description: string };

async function callClaude(prompt: string, apiKey: string, model: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system: BRAND_RULES,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API call failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const block = json.content?.find((c: { type: string }) => c.type === "text");
  if (!block?.text) throw new Error("Anthropic response had no text content");
  return block.text as string;
}

function parseJsonLoosely(text: string): { title: string; description: string } {
  // Claude is asked for bare JSON but may still wrap it in a code fence.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Couldn't find JSON in generation response: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  if (typeof parsed.title !== "string" || typeof parsed.description !== "string") {
    throw new Error("Generation response JSON missing title/description");
  }
  return { title: parsed.title.trim(), description: parsed.description.trim() };
}

async function generateOneLocale(
  locale: "en" | "de",
  collection: Collection,
  internalTitle: string,
  contentText: string,
  apiKey: string,
  model: string
): Promise<GeneratedLocaleMeta> {
  const langName = locale === "en" ? "English" : "German";
  const basePrompt = `
Collection: ${collection}
Internal CMS title (editor label, not public-facing): ${internalTitle}
Write the SEO title and description in ${langName}.

Source content (the real facts to draw from — do not invent anything beyond this):
${contentText || "(no body content available — base this only on the internal title above)"}

Reply with ONLY a JSON object, no other text: {"title": "...", "description": "..."}
`.trim();

  let lastIssues: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nYour previous attempt failed these checks, fix them:\n${lastIssues.join("\n")}`;
    const raw = await callClaude(prompt, apiKey, model);
    const { title, description } = parseJsonLoosely(raw);
    const titleCheck = validateSeoField("title", title);
    const descCheck = validateSeoField("description", description);
    const issues = [...titleCheck.errors, ...descCheck.errors];
    if (issues.length === 0) {
      return { title, description };
    }
    lastIssues = issues;
  }
  throw new Error(`Generation kept failing brand validation after 3 attempts: ${lastIssues.join("; ")}`);
}

export async function generateSeoMeta(
  collection: Collection,
  source: SeoGenerationSource
): Promise<{ en: GeneratedLocaleMeta; de: GeneratedLocaleMeta }> {
  const setting = await getAnthropicApiKey();
  if (!setting) {
    throw new Error("No Anthropic API key saved yet — set one at /admin/credentials first.");
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const [en, de] = await Promise.all([
    generateOneLocale("en", collection, source.internalTitle, source.contentText.en, setting.key, model),
    generateOneLocale("de", collection, source.internalTitle, source.contentText.de, setting.key, model),
  ]);
  return { en, de };
}
