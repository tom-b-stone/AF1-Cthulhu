// Builds the prompt that SEO Studio hands to claude.ai when someone clicks
// "Generate" on a row. No LLM is called from this app: the button opens
// claude.ai with this prompt pre-filled (https://claude.ai/new?q=...), the
// user presses send in their own Claude account, and Claude answers with a
// link back to /seo/apply that carries the finished EN/DE copy. That page
// publishes it through the stored staging CMS login (publishedAt preserved).
//
// Brand rules are the same ones lib/seoBrand.ts validates on the way back
// in, and the same ones the audif1-seo-sync skill works from.
import type { Collection } from "./payloadClient";

export type HandoffItem = {
  collection: Collection;
  id: string;
  internalTitle: string;
  cmsUrl: string;
  contentText: { en: string; de: string };
};

const RULES = `RULES (checked by code when you answer, so follow them exactly):
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
  const maxChars = items.length > 1 ? 900 : 1600;
  const pages = items.map((it, i) => section(it, i, items.length, maxChars)).join("\n\n");

  return `Write SEO meta titles and descriptions (English and German) for audif1.com, the Audi Revolut F1® Team website.

${RULES}

${pages}

HOW TO ANSWER
First check your tools. If you have a tool named "seo_publish" (the AF1 Tools connector): call it once per page with collection, id and the four texts, then reply with one short line per page: EN title, DE title, "Published". If it answers "NOT published" with validation issues, fix the text and call it again; never pass force unless the user tells you to.

If you do NOT have that tool, reply with ONLY one markdown link per page, one per line, nothing else. Clicking it publishes the text in SEO Studio. Template:
[Publish: <internal title>](${appOrigin}/seo/apply?c=<collection>&id=<id>&et=<EN title>&ed=<EN description>&dt=<DE title>&dd=<DE description>)
Percent-encode every value exactly like JavaScript encodeURIComponent: space=%20 &=%26 |=%7C #=%23 ?=%3F +=%2B ®=%C2%AE ü=%C3%BC ä=%C3%A4 ö=%C3%B6 ß=%C3%9F Ü=%C3%9C Ä=%C3%84 Ö=%C3%96 é=%C3%A9. Never leave a raw space in the link.`;
}

export function claudeUrlFor(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}
