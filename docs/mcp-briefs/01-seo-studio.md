# Brief for the AF1 Payload MCP — SEO Studio (AF1-Ktulu)

Paste this into Claude in the repo of `af1-staging-mcp` / `af1-production-mcp`.

---

You maintain the AF1 Payload MCP servers (staging: af1-staging-mcp.vercel.app/mcp, production: read-only). AF1-Ktulu's SEO Studio now uses them for every CMS read and write that Claude does. Add the following so the SEO rules live in one place and nobody can move a publication date by accident.

## 1. Keep `publishedAt` on publish (bug, highest priority)
Today `update_document(…, publish: true)` and `publish_document` set `publishedAt` to the current time. On a published article that changes the date shown on audif1.com.
Tested on staging (news `test-news`, 2026-10-14): a draft update already moves `publishedAt` to now, `publish_document` publishes that. Passing the original `publishedAt` in the same `update_document` call with `publish: true` keeps it.
Do: inside `update_document` and `publish_document`, read the doc's current `publishedAt` first; if the caller didn't pass one, send the original back with the write. Return `publishedAtBefore` and `publishedAtAfter` in the result.

## 2. Locale-aware SEO overview
`seo_overview` has no `locale` and reports with fallback. Add `locale: "en" | "de" | "both"` (default both) and return per doc: `en.title`, `en.description`, `de.title`, `de.description` with fallback switched off (`fallbackLocale: none`), plus `issues` per locale. Add `includeDrafts` and an `exclude` pattern (QA docs: titles starting "[MCP-TEST]", slugs containing "copy" or "test").

## 3. `update_seo_meta` tool (one call, both locales, all rules)
Input: `collection`, `id`, `en {title, description}`, `de {title, description}`, `force?`.
- Validate first (rules below); on errors return "NOT written" + the list, unless `force: true`.
- Keep the doc's existing `meta.image` and `meta.schemaMarkupList` per locale; if a locale has no image, use the home page's meta image (pages slug `home`; DE falls back to the EN home image).
- Write EN then DE with the original `publishedAt`; publish only if the doc was published, else save drafts.
- Return: internal title, CMS admin link, `publishedAt` before/after, EN + DE title.

Validation rules (same as Ktulu `lib/seoBrand.ts`):
- Title 50–60 chars (45–49 allowed for legal/utility), ends with "| Audi Revolut F1® Team" (variants like "| Audi Revolut F1® Team Insights" fine).
- Description 100–150 chars.
- "Audi Revolut F1® Team", "F1®", "Formula 1®" with ®; never "Audi F1 Team", "AF1 Team", "Audi-F1", "F1@", "Teamng".
- No em dash (—); German may use " – ".
- No double spaces, no leading/trailing spaces, no double punctuation.
- German: "Hülkenberg", "Großer Preis von"; no English text in German fields.

## 4. Production writes for SEO only (later)
Production is read-only today. When the team agrees, allow only `update_seo_meta` on production, never body content, and always require an explicit user OK.

When 1–3 are live, Ktulu's prompts switch from `update_document` + our `seo_check` to `update_seo_meta`, and the AF1 Tools `seo_rules`/`seo_check` tools are removed.
