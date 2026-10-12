import { kvGet, kvSetEx } from "./kv";

// Server-side batch meta + previews (KV, 7-day TTL). Shared by the API
// routes and the connector tools.
export const TTL = 7 * 24 * 3600;

export type ServerRow = { id: string; originalName: string; fileName: string; context: string; descriptor: string; alt: string; width: number; height: number; people?: string[]; date?: string };
export type ServerBatch = { id: string; owner: string; updatedAt: string; folderPath: string; year: number; loc: string; round?: number; session?: string; race?: string; rows: ServerRow[] };

export async function readBatch(id: string): Promise<ServerBatch | null> {
  const raw = await kvGet(`asset:batch:${id}`);
  return raw ? (JSON.parse(raw) as ServerBatch) : null;
}

export async function writeBatch(b: ServerBatch): Promise<void> {
  await kvSetEx(`asset:batch:${b.id}`, JSON.stringify(b), TTL);
}

export async function readPreview(batchId: string, rowId: string): Promise<{ mime: string; data: string } | null> {
  const raw = await kvGet(`asset:preview:${batchId}:${rowId}`);
  return raw ? (JSON.parse(raw) as { mime: string; data: string }) : null;
}
