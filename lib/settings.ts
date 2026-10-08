import { kvGet, kvSet, kvConfigured } from "./kv";
import { encrypt, decrypt } from "./crypto";

const STAGING_CREDENTIALS_KEY = "settings:staging-credentials";

export type StagingCredentials = {
  email: string;
  password: string;
  updatedAt: string;
};

export async function getStagingCredentials(): Promise<StagingCredentials | null> {
  const raw = await kvGet(STAGING_CREDENTIALS_KEY);
  if (!raw) return null;
  return JSON.parse(decrypt(raw)) as StagingCredentials;
}

export async function setStagingCredentials(email: string, password: string): Promise<void> {
  const payload: StagingCredentials = { email, password, updatedAt: new Date().toISOString() };
  await kvSet(STAGING_CREDENTIALS_KEY, encrypt(JSON.stringify(payload)));
}

export { kvConfigured };
