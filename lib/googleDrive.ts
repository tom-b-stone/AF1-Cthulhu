// Server-only: Google Drive read access with the signed-in user's own token
// (granted via "Connect Google Drive" in the GP Mini-Zine tool). Used to pull
// SlashLens photos, which live in the team's shared drive.
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { kvGet, kvSetEx } from "./kv";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

type Jwt = { email?: string; gAccess?: string; gExp?: number; gRefresh?: string };

export class DriveNotConnected extends Error {
  constructor() {
    super("drive_not_connected");
  }
}

async function refresh(email: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new DriveNotConnected();
  const j = (await res.json()) as { access_token: string; expires_in: number };
  await kvSetEx(`gdrive:token:${email}`, j.access_token, Math.max(60, j.expires_in - 120)).catch(() => {});
  return j.access_token;
}

export async function driveToken(req: NextRequest): Promise<string> {
  const t = (await getToken({ req })) as Jwt | null;
  if (!t?.email || (!t.gAccess && !t.gRefresh)) throw new DriveNotConnected();
  const now = Math.floor(Date.now() / 1000);
  if (t.gAccess && t.gExp && t.gExp - 120 > now) return t.gAccess;
  const cached = await kvGet(`gdrive:token:${t.email}`).catch(() => null);
  if (cached) return cached;
  if (!t.gRefresh) throw new DriveNotConnected();
  return refresh(t.email, t.gRefresh);
}

// A print-sized JPEG of a Drive image: Drive's own thumbnail at 2000 px long
// edge (300 dpi on the A7 pages needs ~1240 px), so no resizing here.
export async function driveImage(token: string, fileId: string, size = 2000): Promise<{ bytes: ArrayBuffer; type: string }> {
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=thumbnailLink,mimeType,size&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (meta.status === 401 || meta.status === 403) throw new DriveNotConnected();
  if (!meta.ok) throw new Error(`Drive ${meta.status}`);
  const m = (await meta.json()) as { thumbnailLink?: string; mimeType?: string; size?: string };
  if (m.thumbnailLink) {
    const r = await fetch(m.thumbnailLink.replace(/=s\d+$/, `=s${size}`), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (r.ok) return { bytes: await r.arrayBuffer(), type: r.headers.get("content-type") ?? "image/jpeg" };
  }
  // no thumbnail: the original, if it fits a serverless response
  if (Number(m.size ?? 0) > 4_000_000) throw new Error("image too large and no Drive thumbnail");
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`Drive download ${r.status}`);
  return { bytes: await r.arrayBuffer(), type: m.mimeType ?? "image/jpeg" };
}
