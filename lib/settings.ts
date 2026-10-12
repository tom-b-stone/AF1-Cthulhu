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

// Anthropic API key + model for in-tool generation (no claude.ai tab).
const ANTHROPIC_KEY = "settings:anthropic";
export type AnthropicSettings = { key: string; model: string; updatedAt: string };
export const DEFAULT_MODEL = "claude-sonnet-4-5";

export async function getAnthropicSettings(): Promise<AnthropicSettings | null> {
  const raw = await kvGet(ANTHROPIC_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw)) as AnthropicSettings;
  } catch {
    return null;
  }
}

export async function setAnthropicSettings(key: string, model: string): Promise<void> {
  const payload: AnthropicSettings = { key, model: model || DEFAULT_MODEL, updatedAt: new Date().toISOString() };
  await kvSet(ANTHROPIC_KEY, encrypt(JSON.stringify(payload)));
}

export async function clearAnthropicSettings(): Promise<void> {
  const { kvDel } = await import("./kv");
  await kvDel(ANTHROPIC_KEY);
}
