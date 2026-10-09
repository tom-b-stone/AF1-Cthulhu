"use client";

import { useEffect, useState } from "react";

type State = {
  persistent: boolean;
  set: boolean;
  email: string | null;
  updatedAt: string | null;
};

export default function AdminCredentialsPage() {
  const [state, setState] = useState<State | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  function refresh() {
    return fetch("/api/admin/credentials")
      .then((r) => r.json())
      .then((data: State) => {
        setState(data);
        if (data.email) setEmail(data.email);
        return data;
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Saving…");
    const res = await fetch("/api/admin/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok) {
      setStatus(body.error ?? "Failed to save");
      return;
    }
    setPassword("");
    setStatus("Saved.");
    await refresh();
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h1>Staging credentials</h1>
      <p style={{ fontSize: 13, opacity: 0.7 }}>
        The staging CMS login (staging.audif1team.com) SEO Studio and future tools use to log in
        server-side and write to Payload. Stored encrypted — the password is never shown back,
        only overwritten.
      </p>

      {state && !state.persistent && (
        <div
          style={{
            border: "1px solid #a36a00",
            background: "#2a1f00",
            color: "#ffc670",
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          No KV store is configured (KV_REST_API_URL / KV_REST_API_TOKEN). Whatever you save here
          will be lost on the next redeploy or cold start — add the Vercel KV / Upstash Redis
          integration to this project before relying on this for anything real.
        </div>
      )}

      {state?.set && (
        <p style={{ fontSize: 13, opacity: 0.6 }}>
          Currently set for <strong>{state.email}</strong>
          {state.updatedAt ? ` (updated ${new Date(state.updatedAt).toLocaleString()})` : ""}.
        </p>
      )}

      <form onSubmit={onSave} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 8, background: "#141415", color: "inherit", border: "1px solid var(--border)", borderRadius: 6 }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={state?.set ? "Leave filled in to replace it" : ""}
            style={{ padding: 8, background: "#141415", color: "inherit", border: "1px solid var(--border)", borderRadius: 6 }}
          />
        </label>
        <button
          type="submit"
          style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--accent)", color: "#fff", cursor: "pointer", width: "fit-content" }}
        >
          Save
        </button>
        {status && <div style={{ fontSize: 13, opacity: 0.7 }}>{status}</div>}
      </form>
    </div>
  );
}
