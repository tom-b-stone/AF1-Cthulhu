// Minimal key-value store abstraction.
//
// Targets the Upstash Redis REST API (what Vercel KV is built on). Set
// KV_REST_API_URL + KV_REST_API_TOKEN (Vercel: add the "KV" / "Upstash Redis"
// integration to this project and these are injected automatically) for real
// persistence.
//
// Without them, this falls back to an in-memory map that only lives for the
// current serverless instance — fine for local dev, NOT fine for production:
// values vanish on redeploy / cold start. The admin UI should make this
// obvious rather than silently losing data.

const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

const memoryStore = new Map<string, string>();

export function kvConfigured(): boolean {
  return Boolean(URL && TOKEN);
}

export async function kvGet(key: string): Promise<string | null> {
  if (URL && TOKEN) {
    const res = await fetch(`${URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result: string | null };
    return json.result ?? null;
  }
  console.warn(
    `[kv] KV_REST_API_URL/KV_REST_API_TOKEN not set — reading "${key}" from in-memory fallback (non-persistent).`
  );
  return memoryStore.get(key) ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (URL && TOKEN) {
    await fetch(`${URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
    return;
  }
  console.warn(
    `[kv] KV_REST_API_URL/KV_REST_API_TOKEN not set — writing "${key}" to in-memory fallback (will NOT survive a redeploy or cold start).`
  );
  memoryStore.set(key, value);
}
