"use client";

import { useState } from "react";

export default function CopyTags({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* clipboard blocked: the text is visible anyway */
        }
      }}
      style={{ border: "1px solid #2B2929", background: "transparent", color: "#2B2929", borderRadius: 999, padding: "10px 18px", font: "600 14px Archivo, Arial, sans-serif", cursor: "pointer" }}
    >
      {done ? "Copied" : "Copy tags"}
    </button>
  );
}
