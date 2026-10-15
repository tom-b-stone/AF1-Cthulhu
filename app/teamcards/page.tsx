// Team Card Configurator: placeholder. The planned flow, so the team can
// see where it is going and add to it via the suggestion box.

const STEPS: { n: string; title: string; text: string }[] = [
  { n: "01", title: "Briefing", text: "Name, occasion (GP, partner, campaign), dates, owner, target groups, loyalty programme and level, unlock rule. One place for everything the card needs." },
  { n: "02", title: "Status", text: "Every card with its stage and what is still missing: artwork, copy, approvals, CMS setup. Who is waiting for whom." },
  { n: "03", title: "Assets", text: "Upload front artwork, background and badges. Checked against the formats and safe zones of the card." },
  { n: "04", title: "Copy along the journey", text: "Texts per touchpoint: teaser before unlock, unlock moment, in the profile, email and push. Claude drafts in the team voice, the tool checks length and wording." },
  { n: "05", title: "Preview", text: "The card as the fan sees it at each step of the journey, logged in and logged out, mobile and desktop." },
  { n: "06", title: "Build on staging, then production", text: "When everything is in, the tool builds the card on staging: engagement, card, module on its page. After approval it publishes on staging and rebuilds the same card on production." },
];

export default function Page() {
  return (
    <div style={{ maxWidth: 880, display: "grid", gap: 24 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--vapor-lilac)" }}>Planned</div>
        <h1 style={{ margin: "6px 0 8px" }}>Team Card Configurator</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Briefing and status tool for Team Cards. Collect what a card needs, upload and adapt the artwork, preview the texts along the fan journey, then publish and set up the card once everything is in. Not built yet.
        </p>
      </div>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {STEPS.map((s) => (
          <li key={s.n} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 12, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}>
            <span className="tabular-nums" style={{ color: "var(--muted)", fontFamily: "var(--font-heading)" }}>{s.n}</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
        Ideas or must-haves for this tool? Add them in the <a href="/suggest">suggestion box</a>.
      </p>
    </div>
  );
}
