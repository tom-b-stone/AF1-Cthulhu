"use client";

import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "That account isn't allowed in yet. Sign-in is restricted to slash.digital — and for now, only to the admin account while this rolls out.",
};

// Only ever bounce back to a path on this app — never to an absolute URL
// someone could plant in the query string.
function safeCallback(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function SignInButton() {
  const params = useSearchParams();
  const callbackUrl = safeCallback(params.get("callbackUrl"));
  return (
    <button
      onClick={() => signIn("google", { callbackUrl })}
      style={{
        padding: "10px 16px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "#fff",
        color: "#1a1a1a",
        cursor: "pointer",
        fontWeight: 500,
      }}
    >
      Sign in with Google
    </button>
  );
}

function LoginError() {
  const params = useSearchParams();
  const error = params.get("error");
  if (!error) return null;
  return (
    <div
      style={{
        border: "1px solid #a33",
        background: "#2a1414",
        color: "#ff9d90",
        padding: "10px 12px",
        borderRadius: 6,
        fontSize: 13,
        margin: "12px 0",
      }}
    >
      {ERROR_MESSAGES[error] ?? "Couldn't sign you in."}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div style={{ maxWidth: 360 }}>
      <h1>AF1 Cthulhu</h1>
      <p style={{ fontSize: 13, opacity: 0.7 }}>
        Sign in with your slash.digital Google account — same restriction as UTM Studio.
      </p>
      <Suspense fallback={null}>
        <LoginError />
      </Suspense>
      <Suspense fallback={null}>
        <SignInButton />
      </Suspense>
    </div>
  );
}
