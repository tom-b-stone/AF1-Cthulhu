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

// Upstash's command format: POST the Redis command as a JSON array. Values
// round-trip byte-for-byte. (The earlier `/set/<key>` + JSON body form stored
// the value WITH its JSON quotes — harmless for the base64 ciphertexts, which
// ignore stray characters on decode, but fatal for exact-match keys like the
// connector token hashes.)
async function command<T>(args: (string | number)[]): Promise<T | null> {
  const res = await fetch(URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: T };
  return json.result ?? null;
}

// Values written by the old quoted form come back as "\"…\"" — unwrap them
// so existing data (the staging login) keeps working without a migration.
function unquote(v: string | null): string | null {
  if (v && v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try {
      const parsed = JSON.parse(v);
      if (typeof parsed === "string") return parsed;
    } catch {
      // not JSON — return as is
    }
  }
  return v;
}

export async function kvGet(key: string): Promise<string | null> {
  if (URL && TOKEN) {
    return unquote(await command<string>(["GET", key]));
  }
  console.warn(
    `[kv] KV_REST_API_URL/KV_REST_API_TOKEN not set — reading "${key}" from in-memory fallback (non-persistent).`
  );
  return memoryStore.get(key) ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (URL && TOKEN) {
    await command(["SET", key, value]);
    return;
  }
  console.warn(
    `[kv] KV_REST_API_URL/KV_REST_API_TOKEN not set — writing "${key}" to in-memory fallback (will NOT survive a redeploy or cold start).`
  );
  memoryStore.set(key, value);
}

export async function kvDel(key: string): Promise<void> {
  if (URL && TOKEN) {
    await command(["DEL", key]);
    return;
  }
  memoryStore.delete(key);
}
