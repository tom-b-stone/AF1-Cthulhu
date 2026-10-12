"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

// The home page has no sidebar, so the account bits live down here.
export default function HomeFooter() {
  const { data: session } = useSession();
  if (!session) return null;
  const isAdmin = (session.user as { role?: string } | undefined)?.role === "admin";
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 32, fontSize: 11, opacity: 0.55 }}>
      <span>{session.user?.email}</span>
      {isAdmin && (
        <Link href="/admin/credentials" style={{ textDecoration: "none" }}>
          Admin
        </Link>
      )}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 11 }}
      >
        Sign out
      </button>
    </div>
  );
}
