"use client";

// Step indicator for the Asset Uploader journey:
// 1 Images → 2 Grand Prix & folder → 3 Alt text → 4 Content tags → 5 Upload
export const ASSET_STEPS = ["Images", "Grand Prix & folder", "Alt text", "Content tags", "Upload"];

export default function Steps({ current, done = [] }: { current: number; done?: number[] }) {
  return (
    <ol style={{ display: "flex", gap: 8, listStyle: "none", padding: 0, margin: "0 0 22px" }}>
      {ASSET_STEPS.map((label, i) => {
        const n = i + 1;
        const isDone = done.includes(n);
        const isCurrent = n === current;
        return (
          <li
            key={label}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}`,
              background: isCurrent ? "rgba(255,45,0,0.08)" : "var(--bg-2)",
              opacity: isCurrent || isDone ? 1 : 0.55,
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontFamily: "var(--font-heading)",
                background: isDone ? "#2e7d4f" : isCurrent ? "var(--accent)" : "var(--surface)",
                color: "#fff",
              }}
            >
              {isDone ? "✓" : n}
            </span>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
