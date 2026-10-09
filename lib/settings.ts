import { kvGet, kvSet, kvConfigured } from "./kv";
import { encrypt, decrypt } from "./crypto";

const STAGING_CREDENTIALS_KEY = "settings:staging-credentials";
const ANTHROPIC_KEY_KEY = "settings:anthropic-api-key";

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

// The Anthropic API key SEO Studio's "Generate SEO title" feature calls
// server-side. Stored the same way as the staging CMS login (AES-256-GCM in
// KV, write-only from the admin UI) rather than a Vercel env var, so adding
// or rotating it never needs a redeploy and never touches the codebase.
export type AnthropicKeySetting = { key: string; updatedAt: string };

export async function getAnthropicApiKey(): Promise<AnthropicKeySetting | null> {
  const raw = await kvGet(ANTHROPIC_KEY_KEY);
  if (!raw) return null;
  return JSON.parse(decrypt(raw)) as AnthropicKeySetting;
}

export async function setAnthropicApiKey(key: string): Promise<void> {
  const payload: AnthropicKeySetting = { key, updatedAt: new Date().toISOString() };
  await kvSet(ANTHROPIC_KEY_KEY, encrypt(JSON.stringify(payload)));
}

export { kvConfigured };
