import { ALT_MAX, CONTEXTS, SESSIONS } from "@/lib/assetNaming";

export default function RulesPage() {
  return (
    <div style={{ maxWidth: 760, fontSize: 14, lineHeight: 1.7 }}>
      <h1>Naming + alt text rules</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>What the Asset Uploader applies. Taken from the live CMS media library and the team&apos;s Asset Desk rules.</p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Folder</h2>
      <p>
        <code>10_Media-Galleries/{"{year}"}_R{"{nn}"}_{"{LOC}"}-GP/{"{SESSION}"}</code> — year stays in the folder name; LOC is the ISO3 code the
        round already uses in the CMS; sessions: {SESSIONS.join(", ")}. Pre-season tests go under <code>{"{year}"}_R00_Pre-Season</code>.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>File name</h2>
      <p>
        <code>audif1_{"{year}"}_{"{LOC}"}_GP_{"{context}"}_{"{descriptor}"}_{"{nn}"}.webp</code> — context one of {CONTEXTS.join(", ")}; descriptor
        2–6 lowercase words joined with hyphens, ASCII only (no umlaut transcription, so <code>hulkenberg</code>); <code>nn</code> continues from
        the highest number already in that CMS folder, set at upload.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Alt text (English)</h2>
      <p>
        Under {ALT_MAX} characters. Pattern: <em>&lt;subject&gt; of the Audi Revolut F1® Team &lt;action&gt; at the &lt;race&gt; Grand Prix</em>.
        Always <strong>Audi Revolut F1® Team</strong> with the ®, <strong>Nico Hulkenberg</strong> without umlaut, <strong>Gabriel Bortoleto</strong>, car is
        the <strong>R26</strong>. No em-dash. Only what is in the picture: no results, no invented places. Decorative images (patterns, textures) get a
        short factual alt, never empty.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Compression</h2>
      <p>WebP, quality 80, longest edge 2560 px by default (1920 / 1600 / original available). Payload generates its own sizes from the upload.</p>
    </div>
  );
}
