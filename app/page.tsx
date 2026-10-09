import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1>AF1 Cthulhu</h1>
      <p>Internal tool shell for audif1.com — pick a tool from the sidebar.</p>
      <ul>
        <li><strong>UTM Studio</strong> — link builder (to be migrated in here)</li>
        <li><strong>SEO Studio</strong> — edit Payload meta titles/descriptions for news &amp; pages</li>
        <li><strong>Asset Uploader</strong> — compress, pick a folder, upload to Payload media, write alt text</li>
        <li><strong>CRM Images</strong> — generate cropped, rounded-corner image variants for CRM templates</li>
      </ul>

      <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "12px 16px", maxWidth: 640, marginTop: 24, fontSize: 13 }}>
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
