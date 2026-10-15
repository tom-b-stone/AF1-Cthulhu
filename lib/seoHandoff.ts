// Prompts SEO Studio hands to claude.ai (https://claude.ai/new?q=...).
// Since 2026-10-14 Claude reads and writes the CMS through the team's
// "AF1 Payload Staging MCP" (each user's own CMS login); the AF1 Tools
// connector only supplies the rules (seo_rules) and the check (seo_check).
// Without the Payload MCP, Claude answers with /seo/apply links instead,
// which publish through Ktulu's server (publishedAt preserved there).
import type { Collection } from "./payloadClient";

export type HandoffItem = {
  collection: Collection;
  id: string;
  internalTitle: string;
  cmsUrl: string;
  contentText: { en: string; de: string };
};

export const SEO_RULES = `RULES (checked by code when you answer, so follow them exactly):
- Title: 50-60 characters (45-49 is fine only for legal/utility pages). Must end with "| Audi Revolut F1® Team" (close variants like "| Audi Revolut F1® Team Insights" are fine).
- Description: 100-150 characters.
- Always "Audi Revolut F1® Team" and "F1®" / "Formula 1®" with the ® mark. Never "Audi F1 Team", "AF1 Team", "Audi-F1", "F1@", "Teamng".
- NEVER use an em-dash (—). Use a comma, period, colon, or in German " – ".
- No double spaces, no leading/trailing spaces, no double punctuation.
- German: "Hülkenberg", "Großer Preis von", "Vorschau", "Rückblick". Don't translate proper nouns (Suzuka, Montréal) or "R26". No English text in the German fields.
- Use only facts from the content below. Don't invent results, names or places. If the content is thin, write a shorter accurate line instead of padding.
- Avoid filler like "Stay tuned" or "Don't miss".

TITLE PATTERNS by type (use the closest; otherwise "{Subject} | Audi Revolut F1® Team"):
Race Preview: "{Year} {Race} Grand Prix Preview | Audi Revolut F1® Team"
Track Preview: "{Location} Circuit Guide | Audi Revolut F1® Team Insights"
Day 1: "{Location} Day 1 | Audi Revolut F1® Team starts the next chapter"
Qualifying: "{Location} Qualifying: Audi Revolut F1® Team at {Race} GP"
Recap: "{Race} Grand Prix {Year} Recap | Audi Revolut F1® Team"
Galleries: "{Location} {Year} Galleries | Audi Revolut F1® Team in {Country}"
Interview: "{Name} Interview | Audi Revolut F1® Team {Role}"
Activation: "{City} {Year} Activations | Audi Revolut F1® Team"
Legal/utility: "{Document} | Audi Revolut F1® Team"`;

// How to write meta with the Payload MCP without moving the publication
// date: its publish sets publishedAt to "now" unless the original is passed
// in the same update (tested on staging 2026-10-14).
export const SEO_WRITE_RECIPE = `WRITE RECIPE (AF1 Payload Staging MCP, per doc)
1. Read: get_document(collection, id, locale "en", fields ["title","slug","teaserTitle","shortSummary","longSummary","sections","meta","publishedAt","_status"]) and the same with locale "de". Note publishedAt and _status. German values may come back filled with the English fallback: if DE equals EN word for word, treat DE as missing.
2. Write the four texts from that content only, then call seo_check (AF1 Tools). Fix until it says OK.
3. Write EN: update_document(collection, id, locale "en", data {"publishedAt": <the publishedAt from step 1>, "meta": {"title": ..., "description": ..., "image": <the doc's own EN meta.image id, or the EN home meta image from seo_rules if it has none>, "schemaMarkupList": <exactly as read in step 1>}}, publish: <true only if _status was "published", else false>).
4. Write DE the same way with locale "de" (DE image: own DE image, else the DE home image).
5. Read publishedAt again. If it differs from step 1, call update_document once more with only {"publishedAt": <original>} and the same publish flag, and report it.
Never publish a doc that was a draft. Never touch fields other than meta and publishedAt.`;

const TOOLS_CHECK = (appOrigin: string, again: string) => `0. Check your tools.
   - You need "AF1 Payload Staging MCP" (tools get_document, find_documents, update_document) to read and write, and "AF1 Tools" (tools seo_rules, seo_check) for the rules.
   - If the Payload MCP is missing: tell the user in 2 lines that "AF1 Payload Staging MCP" isn't connected in their Claude (claude.ai → Customize → Connectors → AF1 Payload Staging MCP → Connect, with their CMS login), then click "${again}" again. Do nothing else.
   - If AF1 Tools is missing or has no seo_rules: say the AF1 Tools connector needs adding or refreshing (${appOrigin}/connector; in claude.ai remove and re-add it), then click "${again}" again. Do nothing else.
APPROVALS: when claude.ai asks to allow a tool call, ask the user once to choose "Always allow" for both connectors, then continue without asking again.
1. Call seo_rules once and follow it, including its WRITE RECIPE.`;

function section(item: HandoffItem, index: number, total: number, maxChars: number): string {
  const en = item.contentText.en.slice(0, maxChars) || "(no body content, use the internal title only)";
  const de = item.contentText.de.slice(0, maxChars) || "(no German content, translate from the English facts)";
  return `PAGE ${index + 1} of ${total}
collection: ${item.collection}
id: ${item.id}
Internal title (editor label, not public): ${item.internalTitle}
CMS: ${item.cmsUrl}
Content EN:
${en}
Content DE:
${de}`;
}

export function buildHandoffPrompt(items: HandoffItem[], appOrigin: string): string {
  // Keep the whole thing comfortably inside a URL: fewer chars per page
  // when several pages ride in one prompt.
  const maxChars = items.length > 1 ? 700 : 1600;
  const pages = items.map((it, i) => section(it, i, items.length, maxChars)).join("\n\n");

  return `Write SEO meta titles and descriptions (English and German) for audif1.com, the Audi Revolut F1® Team website.

${SEO_RULES}

${pages}

HOW TO ANSWER
First check your tools. If you have "AF1 Payload Staging MCP" (update_document) and "AF1 Tools" (seo_rules, seo_check): call seo_rules once, then for each page follow its WRITE RECIPE (the content above is enough, you don't need to re-read the body; still read meta, publishedAt and _status). Then reply one fact per line, nothing else:
Done.
SEO written to: <internal title>
CMS: <CMS link>
Publication date: untouched, <date>, still <published|draft>
EN title: <title>
DE title: <title>
Last line, exactly: Back to SEO Studio: ${appOrigin}/seo

If you do NOT have those tools, do two things. First, tell the user in 2 short lines that with the "AF1 Payload Staging MCP" connector (claude.ai → Customize → Connectors, their CMS login) you could write it directly. Then, below that, reply with ONLY one markdown link per page, one per line. Clicking it publishes the text in SEO Studio. Template:
[Publish: <internal title>](${appOrigin}/seo/apply?c=<collection>&id=<id>&et=<EN title>&ed=<EN description>&dt=<DE title>&dd=<DE description>)
Percent-encode every value exactly like JavaScript encodeURIComponent: space=%20 &=%26 |=%7C #=%23 ?=%3F +=%2B ®=%C2%AE ü=%C3%BC ä=%C3%A4 ö=%C3%B6 ß=%C3%9F Ü=%C3%9C Ä=%C3%84 Ö=%C3%96 é=%C3%A9. Never leave a raw space in the link.`;
}

// Bulk prompt for users who have the AF1 Tools connector: no page content
// in the URL at all — Claude pulls each page itself via the tools, so there
// is no batch limit. Runs until nothing is missing.
export function buildConnectorBulkPrompt(missingCount: number, appOrigin: string): string {
  return `Write SEO meta titles and descriptions (English and German) for every audif1.com staging news article and page that is still missing one. About ${missingCount} docs are missing EN or DE SEO right now.

${SEO_RULES}

HOW TO WORK
${TOOLS_CHECK(appOrigin, "Generate missing")}
2. Find what's missing, per collection (news, then pages) and per locale (en, then de): find_documents(collection, locale, where {"or":[{"meta.title":{"exists":false}},{"meta.title":{"equals":""}},{"meta.description":{"exists":false}},{"meta.description":{"equals":""}}]}, fields ["title","slug"], limit 50, page 1, 2, …). The filter checks the real locale even when the returned fields show English fallback. Skip docs whose title starts with "[MCP-TEST]" or contains "copy" or "test" (QA clutter) and list them as skipped.
3. For each remaining doc: read it (get_document, both locales; content is in teaserTitle, shortSummary, longSummary and sections), write EN + DE from that content only, seo_check until OK, then write with the WRITE RECIPE.
4. Don't ask me to confirm each page. If a write fails for a reason you can't fix (e.g. "One or more children are invalid"), skip it and continue.
5. When everything is done, reply with ONE summary, one fact per line, no prose and no table:
Done.
SEO written: <n> docs
Publication dates: untouched
Then one line per doc: ✓ <title> — https://staging.audif1team.com/cms/admin/collections/<collection>/<id>
Then "Skipped (test/QA): <k>" and, only if any failed, "Not written: <m>" with one line per doc: ✗ <title> — <reason> — <CMS link>
If a publication date moved and you had to restore it, say so as the first line.
Last line, exactly: Back to SEO Studio: ${appOrigin}/seo`;
}

// Bulk prompt for a hand-picked set of docs (the table's "Generate
// selected"), connector users only: Claude reads and publishes each via
// the tools, no content in the URL.
export function buildConnectorSelectedPrompt(pairs: [Collection, string][], appOrigin: string): string {
  const list = pairs.map(([c, id], i) => `${i + 1}. collection: ${c}, id: ${id}`).join("\n");
  return `Write SEO meta titles and descriptions (English and German) for these ${pairs.length} audif1.com staging docs.

${SEO_RULES}

DOCS
${list}

HOW TO WORK
${TOOLS_CHECK(appOrigin, "Generate selected")}
2. For each doc: read it (get_document, both locales; content is in teaserTitle, shortSummary, longSummary and sections), write EN + DE from that content only, seo_check until OK, then write with the WRITE RECIPE.
3. Don't ask me to confirm each page. If a write fails for a reason you can't fix, skip it and continue.
4. When done, reply with ONE summary, one fact per line, no prose and no table:
Done.
SEO written: <n> of <total> docs
Publication dates: untouched
Then one line per doc: ✓ <title> — https://staging.audif1team.com/cms/admin/collections/<collection>/<id>
Then, only if any failed: "Not written: <m>" and one line per doc: ✗ <title> — <reason> — <CMS link>
If a publication date moved and you had to restore it, say so as the first line.
Last line, exactly: Back to SEO Studio: ${appOrigin}/seo`;
}

// claude.ai has no URL parameter for the model, so the hint sits on top of
// the prefilled prompt where the user sees it before pressing send. SEO
// texts are short and rule-bound: the smallest model does them well and fast.
export const LIGHT_MODEL_HINT =
  "BEFORE YOU SEND: switch the model to Haiku (model menu next to the send button). Short texts with fixed rules, Haiku is enough and fastest.\n\n---\n\n";

export function claudeUrlFor(prompt: string, opts: { light?: boolean } = {}): string {
  return `https://claude.ai/new?q=${encodeURIComponent((opts.light ? LIGHT_MODEL_HINT : "") + prompt)}`;
}
