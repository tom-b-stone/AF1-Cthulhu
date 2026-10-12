export default function KnowledgePage() {
  return (
    <div style={{ maxWidth: 760, fontSize: 14, lineHeight: 1.7 }}>
      <h1>Team knowledge</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        People and visual cues Claude uses to name who is in a photo (helmet colours, race suits, roles). Shared for everyone, stored in
        the app. Editing comes with the alt-text step.
      </p>
      <ul>
        <li>Nico Hulkenberg — driver, #27</li>
        <li>Gabriel Bortoleto — driver, #5</li>
        <li>Paul Aron — reserve driver</li>
        <li>Allan McNish — racing director</li>
        <li>Jonathan Wheatley — team principal</li>
        <li>Mattia Binotto — head of Audi F1 project</li>
      </ul>
    </div>
  );
}
