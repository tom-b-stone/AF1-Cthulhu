# AF1 Cthulhu

Internal tool shell for audif1.com, built alongside UTM Studio. One Next.js app, several tools
in the sidebar, deployed to Vercel, tested against `staging.audif1.com` before anything touches
production.

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
Edits Payload CMS `meta.title` / `meta.description` (EN + DE) for `news` and `pages`, with the
same brand rules the `audif1-seo-sync` skill already encodes: 50–60 char titles ending
`| Audi Revolut F1® Team`, 100–150 char descriptions, no em-dash, DE≠EN fallback detection,
draft/publish status, and the two-step publish trick (DE draft → EN `_status: published`) for
promoting changes to live.

Writes go through a server-side API route using a **Payload service-account API key**
(`PAYLOAD_API_KEY`), never exposed to the client. Because the service account is shared,
**who did what is tracked at the app layer**: every write is logged against the signed-in app
user (name/email), not against the Payload service account, so there's still a real audit trail
even though Payload only ever sees one technical user.

### Asset Uploader
Compresses an uploaded image, lets the user pick an existing Payload media folder (or create a
new one — the folder structure already exists in the CMS, this just reads/writes it) and uploads
to the `media` collection, then writes English alt text. Build and test this against
`staging.audif1.com` first since folder creation is a real write.

### CRM Images
Generates cropped, rounded-corner image variants matched to the CRM template library
(`08_AF1_Platform_Dev`, node 4572:2 — Image Teaser, Gallery 01/02, Statistic, Ecom). Corner radii
and crop dimensions are pulled from the Figma templates themselves, not guessed. Corners are
baked into the exported PNG/WebP (not left to CSS) since email clients don't reliably render
`border-radius`. Export is a download button for now; direct Salesforce Marketing Cloud upload
is a later phase.

### Admin (`/admin`)
A small internal settings area, separate from the four tools, for things like the staging login
this app uses when it needs to act as a real user (distinct from the Payload service-account API
key the tools use for CMS writes). Gated by a single shared password (`ADMIN_PASSWORD`) for now —
not real per-person auth yet.

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

## Environment

Copy `.env.example` to `.env.local`. `PAYLOAD_API_URL` should point at
`https://staging.audif1.com/cms/api` until a tool is verified, then switch to production per tool
— not globally, since they'll reach production readiness at different times.

Before `/admin` is usable in a real deployment, set in Vercel: `ADMIN_PASSWORD`, `ADMIN_SECRET`,
`CREDENTIALS_ENCRYPTION_KEY`, and (for persistence) `KV_REST_API_URL` / `KV_REST_API_TOKEN` via
the KV/Upstash integration.

## Status

Scaffold only — the four tool routes are placeholders; `/admin/credentials` is functional (store
a login, encrypted, pending KV being wired up for real persistence). Next steps: confirm Payload
API key auth is available for a service account, confirm the existing Payload media folder
schema, pull exact Figma specs for the CRM Images templates, then build SEO Studio first.
