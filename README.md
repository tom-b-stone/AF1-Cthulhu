# AF1 Cthulhu

Internal tool shell for audif1.com, built alongside UTM Studio. One Next.js app, several tools
in the sidebar, deployed to Vercel, tested against `staging.audif1team.com` (the staging CMS
domain — note it's `audif1team.com`, not `audif1.com`) before anything touches production.

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

Auth: the CMS's `users` collection doesn't have Payload's API-key auth enabled (no code change
was made to add it), so writes go through a server-side login instead — `lib/payloadClient.ts`
logs in as the dedicated staging CMS user already saved via `/admin/credentials`
(`tma+cthulhu@slash.digital`, same one used elsewhere in this app) against
`/cms/api/users/login`, caches the returned JWT, and sends it as `Authorization: JWT <token>`.
Nothing is exposed to the client. Because that login is shared, per-user activity is tracked at
the app layer (the signed-in app user), not against the CMS account.

**Generate / Regenerate SEO title** (`lib/seoGenerate.ts`, `app/api/seo/generate/route.ts`):
each row has a button ("Generate SEO title" when EN or DE is empty, "Regenerate" once both are
set), and there's a "Generate missing" button above the table that runs the same thing for every
doc currently missing an EN or DE title/description, one doc at a time. Generation reads the
doc's own real content (`getSeoGenerationSource` in `lib/payloadClient.ts` — teaser/summary
fields, the hero/cover image's alt text, and a generic walk over `sections` for any block's
title/heading/text/caption fields, explicitly excluding the existing `meta` block so regenerating
never just echoes back what's already there), sends it to Claude with the same brand rules
`lib/seoBrand.ts` validates against (title/description length, the `| Audi Revolut F1® Team`
patterns by article type, no em-dash, brand-mark typos), retries up to twice server-side if the
result fails validation, and — once it passes — **publishes immediately** using the existing
two-step trick (`publishSeo`, DE draft then EN publish) so `publishedAt` never moves. There's no
manual review step before the write, matching how the audif1-seo-sync skill's "publish now"
workflow already works; Tom asked for direct publish rather than staging it in the edit drawer
first. The Anthropic API key this calls is saved encrypted via `/admin/credentials`, same
pattern as the staging CMS login, not a plain env var.

### Asset Uploader
Compresses an uploaded image, lets the user pick an existing Payload media folder (or create a
new one — the folder structure already exists in the CMS, this just reads/writes it) and uploads
to the `media` collection, then writes English alt text. Build and test this against
`staging.audif1team.com` first since folder creation is a real write.

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
