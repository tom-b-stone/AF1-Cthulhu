# AF1 Ktulu

Internal tool shell for audif1.com, built alongside UTM Studio. One Next.js app, several tools
in the sidebar, deployed at https://af1-ktulu.vercel.app (repo tom-b-stone/AF1-Ktulu; was "AF1-Cthulhu" until 2026-10-12), tested against `staging.audif1team.com` (the staging CMS
domain — note it's `audif1team.com`, not `audif1.com`) before anything touches production.

## Shell (Neuron-style)
Dark surfaces and type after alithemes' Neuron template (#0C0D0E / #171819 / #1E2022 / #393939,
DM Sans body, Fahkwang headings, loaded as a Google Fonts stylesheet so builds never fetch fonts),
AF1 lava red as the accent. `app/components/ToolHeader.tsx` is the sticky header: wordmark on the
ASCII strip, a **Tools** menu that switches tools (Neuron's blurred rounded sub-menu), environment +
account on the right. `app/components/Sidebar.tsx` is in-tool navigation only: a page pushes its
live functions into it through `SidebarSlot.tsx` (`useSidebarContent`, `SideSection`, `SideButton`),
static links per tool stay in `SIDEBARS`. Filters live above the table as pill tabs (`.tabs/.tab`),
page heads and stat modules (`.page-head`, `.stat`) and reveal-on-scroll sections are the shared
page pattern (SEO Studio, Asset Uploader). The Claude connector is not a tool: it is a first-run
onboarding overlay on the home page (`ConnectorOnboarding.tsx`, per-user state via
`/api/onboarding`), replayable from `/connector` (header link). `app/components/MorphIcon.tsx`: the tool icons are
small three.js canvases — a sphere displaced by animated simplex noise with an iridescent
thin-film shader (after the "Rainbow Blend Glass" look of Tom's reference .blend), one preset per
tool (seed, frequency, amplitude, palette offset; `MORPH_PRESETS`). The header shows them as a row
of rotating icons; hover (or the active tool) extends the pill with the name. Paused off-screen,
static under prefers-reduced-motion. `ToolIcons.tsx` (flat gradient SVGs) is kept as a fallback set.

**Suggestion box → admin message board.** `/suggest` (any signed-in user) posts to
`app/api/suggestions/route.ts` (one JSON list in KV, `suggestions:v1`); `/admin/messages`
(admins) lists them with new / seen / done. Non-admins see only their own on `/suggest`.

## Navigation structure

```
/            dashboard — links out to each tool
/utm         UTM Studio          (existing — to be migrated into this app)
/seo         SEO Studio          (new)
/assets      Asset Uploader      (new)
/images      CRM Images          (new — image variant generator)
```

Each tool is its own route under `app/`, sharing one sidebar/layout (`app/components/Sidebar.tsx`,
`app/layout.tsx`). Adding a tool later means adding a route + a sidebar entry, not a new app.

## Tools

### UTM Studio (existing)
Link/campaign-tagging tool. Not yet migrated into this repo — placeholder route only.

### SEO Studio
Built, staging-only (`lib/payloadClient.ts`, `app/api/seo/*`, `app/seo/*`). Searchable table of
`news` + `pages` (Status, Published Date, Title, URL, SEO Title, Count, SEO Description, Count,
Language — same column shape as the AF1-SEO Google Sheet, for familiarity) with an EN/DE toggle,
read live from Payload. **This trial never reads from or writes to the Google Sheet** — Payload
stays the only source, since the sheet is also relied on by other tools and Tom asked not to
touch it while testing. Clicking a row opens an edit drawer with EN + DE title/description,
live validation against the same brand rules the `audif1-seo-sync` skill encodes (50–60 char
titles ending `| Audi Revolut F1® Team`, 100–150 char descriptions, no em-dash, brand-mark typo
checks — `lib/seoBrand.ts`), a Save as draft button, and a Publish button implementing the
two-step publish trick (DE draft PATCH, 3s settle, then EN PATCH with `_status: 'published'`,
preserving `publishedAt`).

Every link shown (table URL column, edit drawer) opens the CMS admin edit page for that doc —
`{site-root}/cms/admin/collections/{collection}/{id}?locale={en|de}` — the same link shape the
AF1-SEO Google Sheet's own HYPERLINK formulas use, so clicking takes Tom straight to where the
meta title/description can be seen and edited in Payload, not the public page. Built from
`PAYLOAD_API_URL` itself (never hardcoded) so it always matches whatever environment this
deployment points at.

**Meta image rule:** every save/publish sends `meta.image` too — the doc's own image if it has
one, otherwise the home page's meta image (`pages` doc with slug `HOME_PAGE_SLUG`, default `home`;
DE falls back to the EN home image). Always sending the key also stops a partial `meta` PATCH from
nulling an image that was there (`metaBodyFor` in `lib/payloadClient.ts`).

Auth: the CMS's `users` collection doesn't have Payload's API-key auth enabled (no code change
was made to add it), so writes go through a server-side login instead — `lib/payloadClient.ts`
logs in as the dedicated staging CMS user already saved via `/admin/credentials`
(`tma+cthulhu@slash.digital`, same one used elsewhere in this app) against
`/cms/api/users/login`, caches the returned JWT, and sends it as `Authorization: JWT <token>`.
Nothing is exposed to the client. Because that login is shared, per-user activity is tracked at
the app layer (the signed-in app user), not against the CMS account.

**Table** (`components/ui/table-editable.tsx` + `table-editable-utils/`, from beui.dev's
editable table, pulled via its shadcn registry): virtualised, sortable, resizable, reorderable
columns, row selection, inline-editable cells. The project got Tailwind + a shadcn layout for
it (`tailwind.config.ts` maps shadcn token names onto the app's existing dark palette in
`app/globals.css`; preflight is off so the inline-styled pages don't change; `components.json`,
`lib/utils.ts`). SEO Title / Description are editable inline per locale; edits stay local until
"Save N drafts" writes them (draft only, hard brand-rule violations are reported, not forced).
Selecting rows enables "Generate selected" (`/api/seo/handoff?items=collection:id,…`).
"Publish edited (N)" publishes every inline-edited row after a confirm box (same two-step publish,
dates untouched); "Search & replace" rewrites title/description across the visible rows for the
current locale as local edits, so a typo fix across 40 pages is one replace + one publish. Claude
is only involved in writing new text; publishing is always the tool with the stored CMS login.
"Columns" shows/hides columns per browser (the two length columns start hidden).

**Generate / Regenerate SEO title** (`lib/seoHandoff.ts`, `app/api/seo/handoff/route.ts`,
`app/seo/apply/page.tsx`). This app calls no LLM API and holds no AI key — the writing is
done by the user's own Claude account, hand-off in both directions by link:

1. Each row has a link ("Generate SEO title" while EN or DE is empty, "Regenerate" after).
   It opens `/api/seo/handoff?collection=…&id=…`, which reads the doc's real content
   (`getSeoGenerationSource` — teaser/summary fields, the hero image's alt text, and a generic
   walk over `sections` block text, never the existing `meta`), builds a prompt with the brand
   rules (same ones `lib/seoBrand.ts` validates) and 307-redirects to
   `https://claude.ai/new?q=<prompt>`, so claude.ai opens with everything pre-filled. The user
   presses send in their own account.
2. The prompt asks Claude to answer with one markdown link per page back to
   `/seo/apply?c=…&id=…&et=…&ed=…&dt=…&dd=…` (percent-encoded EN/DE title/description).
3. Clicking that link lands on `/seo/apply`, which **publishes immediately** through the normal
   `/api/seo/doc` publish path (DE draft, 3s settle, EN publish, `publishedAt` preserved) using
   the stored staging CMS login. Hard brand-rule violations (em-dash, brand-mark typos, over the
   length caps) stop the auto-publish and show a "Publish anyway" button instead. If the user
   isn't signed in yet, `/login` bounces them back to the same apply link afterwards
   (`callbackUrl`).

**What comes back.** Every publish path (connector `seo_publish`, `/seo/apply`, the edit panel)
reads the doc back after publishing and answers in one shape: `Done. SEO written to: <internal
title>` + CMS link + `Publication date untouched: <date>, still published.` (`describeDate` in
`lib/mcpTools.ts`). If Payload ever moved `publishedAt`, that line becomes a red WARNING with
before/after instead, and the prompts tell Claude to quote it verbatim. Bulk prompts ask Claude for
one summary at the end ("Done. SEO written for n docs, publication dates untouched") plus a list of
failures with title, link and reason, not a page-by-page log.

"Generate missing" above the table: with a connector token (see below) it opens one claude.ai
prompt with no page content at all — Claude lists the missing docs itself (`seo_list_missing`),
reads each (`seo_get_page`), publishes (`seo_publish`) and loops until nothing is missing, no
limit. Without the connector the content has to travel in the URL, so it goes 5 docs per round
and Claude answers with 5 links.

This replaced an earlier in-app Anthropic API call (removed): the key saved for it had no
credits, and Tom wanted no API billing — the user's own Claude account does the work instead.

### Claude connector ("AF1 Tools", `/connector`, `app/api/mcp/[token]/route.ts`)
Removes the one remaining click. A minimal MCP server (Streamable HTTP, JSON-RPC over POST,
stateless, hand-rolled — only `initialize`, `tools/list`, `tools/call`) that claude.ai can use as a
custom connector. Auth is a per-user token in the URL path: each user mints their own on
`/connector` (`lib/connectorTokens.ts`, SHA-256 of the token stored in KV, mapped to their email,
one live token per user, revocable), pastes `https://<app>/api/mcp/<token>` into claude.ai →
Settings → Connectors → Add custom connector, done. No OAuth server to run; the URL is the secret,
treated like a password. `middleware.ts` lets `/api/mcp` through without a session for that reason.

Tools (`lib/mcpTools.ts`): `seo_list_missing`, `seo_get_page`, `seo_publish`. `seo_publish` runs the
same `validateSeoField` checks as the UI and the same `publishSeo` two-step publish (date
preserved); it refuses on hard errors unless `force: true`. Every call is logged with the owning
email. The hand-off prompt tells Claude: if you have `seo_publish`, call it and confirm; if not,
answer with the Publish link — so users without the connector lose nothing. Meant to grow: tools
for the Asset Uploader / CRM Images go in the same file under the same connector.

### Asset Uploader (in progress)
Flow: drop photos → compress in the browser (`lib/imageCompress.ts`: WebP q80, longest edge
2560/1920/1600/original; Safari can't encode WebP → JPEG with a warning) → batch saved in the
browser (IndexedDB, `lib/batchStore.ts`, survives reloads) → batch page: naming, alt text, checks,
export → upload. Nothing reaches a CMS until "Upload".

Rules (`lib/assetNaming.ts`, also on `/assets/rules`): folder
`10_Media-Galleries/{year}_R{nn}_{LOC}-GP/{SESSION}`; file
`audif1_{year}_{LOC}_GP_{context}_{descriptor}_{nn}.webp`; descriptor 2–6 lowercase hyphen words,
ASCII (Hulkenberg); alt text English < 125 chars, "<subject> of the Audi Revolut F1® Team <action>
at the <race> Grand Prix". Camera names are parsed for round/LOC/date (`R14_MAD_ARF1T_2026_09_12_…`
and `T02_MONZ_ARF1T04_17_26_…`, US date order in the second). Taken from the live CMS media library
(Oct 2026) and the team's Asset Desk rules.

Built: `/assets` (new batch), `/assets/batch/[id]` (editable table: context, descriptor, alt, checks;
ZIP export with alt-texts.csv + .md), `/assets/batches`, `/assets/rules`, `/assets/knowledge`.
Journey (`app/components/Steps.tsx`): 1 Images → 2 Grand Prix & folder (calendar from the
production `race-weekend` collection, `lib/races.ts`; round pre-selected from camera names or photo
date; existing round/session folder used or created, `FolderPicker.tsx` for anything else) → 3 Alt
text → 4 Upload (`/api/assets/upload`, numbering per folder via `/api/assets/next-number`).

**Alt text by Claude** (step 3): the batch page sends 1024px previews + meta to the server
(`/api/assets/batch/[id]` + `/preview`, KV, 7-day TTL, `lib/assetBatchStore.ts`) and opens claude.ai
with the prompt (`lib/assetPrompt.ts`, `/api/assets/handoff`). Claude works through the connector:
`asset_rulebook` (people + terms from the editable knowledge store, rules + patterns from the seed),
`asset_list_batch`, `asset_get_image` (image content), `asset_set_meta` (validated: length, team
name, spellings, em-dash). The page polls the server copy every 5s and fills the rows. No connector
→ the button explains the setup; there is no URL fallback because images can't travel in a link.

Team knowledge (`/assets/knowledge`, `lib/teamKnowledge.ts` seed, KV `assets:knowledge:v1`): only
people and terms are user-editable; alt-text rules and patterns are the tool's rulebook. Team name
is exactly "Audi Revolut F1® Team", nothing else; "Revolut Apex Card"; Hulkenberg EN / Hülkenberg DE.

**Content tags** (step 4, `lib/contentTags.ts`, `/api/assets/tags`, `app/components/TagPicker.tsx`):
the production vocabulary (105 `content-tags` titles, Oct 2026) is in `PROD_TAG_TITLES`; a one-time
`POST /api/assets/tags {seed:true}` copied it to staging. Tags live on a batch/row by *title* and
are resolved to staging ids at upload (`uploadMedia(..., contentTagIds)` → `_payload.contentTags`).
Production pattern, learned from 3,000 media: every GP photo carries `2026` + `gp | <gp> | <circuit>`
+ weekday + session (`fp1`…`race`), per photo a person tag (`nico hulkenberg`, `mattia binotto`, …)
and a scene (`on-track & garage` / `team` / `off-track`); wallpapers `2026 | <city> | wallpaper`.
`proposeBatchTags` fills the batch tags from year/race/session; `asset_set_meta` now takes `people`
+ `scene` and the page turns them into per-image tags (`proposeRowTags`). `tagIssues` runs in the
Check column and before upload (year, GP, day/session, scene-or-person, no "do not use"). New tags
are created on staging from the picker ("Create … on staging").

**Learning** (`lib/referenceStore.ts`, `lib/feedbackStore.ts`, `/api/assets/references`, `/api/assets/feedback`):
reference photos per person (KV `assets:refs:index` + `assets:ref:<id>`, max 8 per person) that Claude
must look at (`knowledge_reference_image`) before naming anyone; saved from a batch photo (row dialog →
Teach Claude, 1024px WebP) or by Claude from the library during a learning session
(`knowledge_add_reference`). Corrections: at upload, rows where the final people/scene differ from
Claude's proposal (`row.ai`) are logged (`assets:feedback:v1`, cap 100) and the last 25 appear in the
rulebook. Both are visible on `/assets/learn`. The batch table is the SEO table: inline alt/descriptor,
inline tag picker per row, row selection with a bulk bar (add tag, set scene, clear tags).

**In-tool generation** (`lib/claudeDescribe.ts`, `/api/assets/generate`, `lib/learnRun.ts`,
`/api/assets/learn/run`, Admin → Claude API `/admin/anthropic`, KV `settings:anthropic` encrypted):
with an Anthropic API key the batch page describes each photo itself (two in parallel, one Messages
call per photo, rulebook + reference photos as a cached prefix, same validation as `asset_set_meta`,
one retry on rule violations) and the learn page builds the reference library per person
(`learn_person`, also a connector tool). Without a key everything falls back to the claude.ai
hand-off. claude.ai cannot be iframed (`frame-ancestors 'none'`), hence the API path.

Still to do: production toggle (second CMS login in /admin), SlashLens intake (`/assets/intake`,
Drive file ids, link-sharing is on).

### CRM Images
Generates cropped, rounded-corner image variants matched to the CRM template library
(`08_AF1_Platform_Dev`, node 4572:2 — Image Teaser, Gallery 01/02, Statistic, Ecom). Corner radii
and crop dimensions are pulled from the Figma templates themselves, not guessed. Corners are
baked into the exported PNG/WebP (not left to CSS) since email clients don't reliably render
`border-radius`. Export is a download button for now; direct Salesforce Marketing Cloud upload
is a later phase.

### Admin (`/admin`)
A small internal settings area, separate from the four tools, for things like the staging CMS
login (`tma+cthulhu@slash.digital`) that SEO Studio (and any future tool needing CMS writes) logs
in as server-side. Restricted to admin accounts — see Sign-in below.

Saved values (currently: the staging email/password) are AES-256-GCM encrypted
(`CREDENTIALS_ENCRYPTION_KEY`) before being written to KV, and the password is write-only — the
admin page never reads it back, only shows which email is set and when it last changed.

**This only persists once KV is set up.** Add the Vercel KV / Upstash Redis integration to the
project (`KV_REST_API_URL` / `KV_REST_API_TOKEN` get injected automatically) — without it, the
admin page works but anything saved lives only in that serverless instance's memory and is gone
on the next redeploy or cold start. The UI shows a warning banner when this is the case.

No credentials are committed to this repo, ever, including in commit history — the staging login
should be entered once directly through `/admin/credentials` after the env vars below are set in
Vercel, not passed through the codebase at any point.

## Sign-in

Google OAuth via NextAuth, restricted to `@slash.digital` — the same domain gate UTM Studio uses
(github.com/tom-b-stone/UTM-Studio: Google Identity Services, `ALLOWED_DOMAIN = 'slash.digital'`,
bootstrap admin `tma@slash.digital`). This app can reuse that same Google Cloud OAuth client —
NextAuth just needs its client secret too (UTM Studio's client-side-only flow never used one, but
the Google Cloud OAuth client still has one issued) and this app's callback URL added to its
Authorized redirect URIs: `https://<domain>/api/auth/callback/google`.

Two env vars control access (`lib/auth.ts`):
- `ADMIN_EMAILS` — comma-separated list that can reach `/admin`. Defaults to `tma@slash.digital`.
- `ALLOW_ALL_SLASH_DIGITAL` — while `false` (the default), **only** `ADMIN_EMAILS` can sign in at
  all, same as Tom asked to start: him only, as admin. Flip to `true` to open the four tools to
  every `@slash.digital` account, mirroring UTM Studio's "editor" role — `/admin` stays
  `ADMIN_EMAILS`-only either way. No code change needed for that rollout step.

Unauthenticated or domain-rejected visitors land on `/login` (`middleware.ts` gates every route
except `/login` and `/api/auth/*`).

## Environment

Copy `.env.example` to `.env.local`. `PAYLOAD_API_URL` should point at
`https://staging.audif1team.com/cms/api` until a tool is verified, then switch to production per
tool — not globally, since they'll reach production readiness at different times.

Before this is usable in a real deployment, set in Vercel: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`, `CREDENTIALS_ENCRYPTION_KEY`, and (for
KV persistence) `KV_REST_API_URL` / `KV_REST_API_TOKEN` via the KV/Upstash integration.

## Status

Sign-in, admin/credentials (with real KV persistence), and SEO Studio are built and ready to try
against staging. Asset Uploader and CRM Images are still placeholder routes. Next steps: try SEO
Studio end-to-end against `staging.audif1team.com` (a real edit + publish round trip), confirm
the `pages` collection's `meta` field shape matches `news` (assumed, not yet verified against a
real `pages` doc), confirm the existing Payload media folder schema for Asset Uploader, pull
exact Figma specs for the CRM Images templates.
