# Brief for the AF1 Payload MCP — Asset Uploader (AF1-Ktulu)

Paste this into Claude in the repo of `af1-staging-mcp`.

---

AF1-Ktulu's Asset Uploader compresses race photos in the browser, gets alt texts and content tags from Claude, and uploads them into the CMS media library. Today the upload, folders and tags run through a shared staging login inside Ktulu, because the Payload MCP has none of these tools. Add them so Claude (and later Ktulu) can do it with each editor's own login.

## 1. Media folders (`payload-folders`, folderType media)
- `list_media_folders(parent?)` → id, name, parent, full path (e.g. `10_Media-Galleries/2026_R18_USA-GP/FRI`).
- `create_media_folder(name, parent)` → returns existing folder if the name exists under that parent.
Conventions: race folders under `10_Media-Galleries`, named `{year}_R{nn}_{LOC}-GP`, day subfolders `THU`, `FRI`, `SAT`, `SUN` (or session names).

## 2. Content tags (`content-tags`)
- `list_content_tags(search?)` → id, title.
- `create_content_tag(title)` → returns the existing one if the title matches case-insensitively.
Vocabulary: production has 105 titles (`2026`, `gp | <gp> | <circuit>`, weekdays, sessions, people like `nico hulkenberg`, scenes `on-track & garage` / `team` / `off-track`); staging was seeded with all of them on 2026-10-12.

## 3. Media upload and edit
- `upload_media(fileUrl | base64, filename, alt, folderId?, contentTags?: string[] (titles or ids))` → id, filename, url, admin link. Max ~4 MB per file (WebP from Ktulu is well under).
- `update_media(id, { alt?, folder?, contentTags? })`.
- `next_number_in_folder(folderId, prefix)` → next free 2-digit number for names like `audif1_2026_USA_GP_<descriptor>_<nn>.webp`.
Alt-text rules to validate on upload: English, under 125 chars, team name only "Audi Revolut F1® Team", no em dash, "Nico Hulkenberg" (no umlaut in English).

## 4. Read helpers Ktulu already needs
- `media` search by alt text and by content tag on production (read-only), returning a small preview URL — used by Ktulu's learning session to build reference photos.

When 1–3 exist on staging, Ktulu's Claude prompts upload through the Payload MCP; Ktulu keeps its own batches, previews, team knowledge, reference photos and learning tools in AF1 Tools.
