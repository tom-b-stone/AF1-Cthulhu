import Link from "next/link";
import KtuluLogo from "./components/KtuluLogo";

export default function Home() {
  return (
    <div style={{ maxWidth: 820 }}>
      <KtuluLogo height={280} />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginTop: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>AF1 Ktulu</h1>
          <p style={{ marginTop: 0 }}>Internal tool shell for audif1.com — pick a tool from the sidebar.</p>
          <ul>
            <li><strong>UTM Studio</strong> — link builder (to be migrated in here)</li>
            <li><strong>SEO Studio</strong> — edit Payload meta titles/descriptions for news &amp; pages</li>
            <li><strong>Asset Uploader</strong> — compress, pick a folder, upload to Payload media, write alt text</li>
            <li><strong>CRM Images</strong> — generate cropped, rounded-corner image variants for CRM templates</li>
          </ul>
        </div>

        <aside style={{ flex: "1 1 260px", fontSize: 12, opacity: 0.6, lineHeight: 1.6, borderLeft: "1px solid var(--border)", paddingLeft: 16 }}>
          <div style={{ fontWeight: 600, opacity: 0.9, marginBottom: 4 }}>Why &ldquo;Ktulu&rdquo;</div>
          In H. P. Lovecraft&apos;s 1928 story, Cthulhu is an ancient, god-like cosmic being asleep in the sunken city
          of R&apos;lyeh. It reaches into people&apos;s dreams and is worshipped by a cult spread across the world; its very
          existence is beyond human understanding, and those who glimpse it tend to lose their minds. &ldquo;Ktulu&rdquo; is
          the simplified spelling Metallica used for their 1984 instrumental, because the original is hard to say
          and harder to spell. For a box of tools that quietly reaches into every CMS entry, it felt about right.
        </aside>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "12px 16px", marginTop: 24, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Claude connector</div>
        <div style={{ opacity: 0.75, lineHeight: 1.6 }}>
          Let your own Claude use these tools directly, so &quot;Generate SEO title&quot; ends with Claude publishing — no
          link to click. One-minute setup, once per person.{" "}
          <Link href="/connector">Set it up →</Link>
        </div>
      </div>
    </div>
  );
}
