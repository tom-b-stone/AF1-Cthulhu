// Edge-safe (uses Web Crypto, not node:crypto) so this works in both
// middleware.ts (edge runtime) and ordinary API routes.

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(message: string): Promise<string> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET is not set");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bufToHex(sig);
}

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12h

export async function signSession(): Promise<string> {
  const ts = Date.now().toString();
  const sig = await hmac(ts);
  return `${ts}.${sig}`;
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  const expected = await hmac(ts);
  if (expected !== sig) return false;
  const age = Date.now() - Number(ts);
  return age >= 0 && age < SESSION_MAX_AGE_MS;
}

export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;
