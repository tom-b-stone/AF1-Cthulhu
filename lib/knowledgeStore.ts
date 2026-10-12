import { kvGet } from "./kv";
import { SEED_KNOWLEDGE, type KnowledgeEntry } from "./teamKnowledge";

export const KNOWLEDGE_KEY = "assets:knowledge:v1";

// Server-side read, shared by the API route and the connector tools.
export async function readKnowledge(): Promise<KnowledgeEntry[]> {
  try {
    const raw = await kvGet(KNOWLEDGE_KEY);
    if (raw) return JSON.parse(raw) as KnowledgeEntry[];
  } catch {
    /* fall through */
  }
  return SEED_KNOWLEDGE;
}
