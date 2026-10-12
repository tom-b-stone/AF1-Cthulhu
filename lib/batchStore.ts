// Per-browser batch store (IndexedDB) for the Asset Uploader. A batch is a
// set of compressed images plus their metadata; it survives a reload so a
// 200-photo weekend doesn't have to be dropped twice. The server-side store
// (for the Claude connector and the staging → production push) comes next
// and will mirror this shape.

export type AssetRow = {
  id: string;
  originalName: string;
  originalBytes: number;
  bytes: number;
  width: number;
  height: number;
  srcWidth: number;
  srcHeight: number;
  mime: string;
  // parsed from the camera name
  round?: number;
  test?: number;
  loc?: string;
  date?: string;
  // editable
  context: string;
  descriptor: string;
  alt: string;
  fileName: string;
  status: "ready" | "uploaded" | "error";
  note?: string;
  cmsId?: string; // media doc id after upload
  cmsUrl?: string;
  uploadedName?: string; // final file name with the per-folder number
  // extras (SlashLens intake)
  driveId?: string;
  people?: string[];
  scene?: string; // on-track & garage | team | off-track (from Claude)
  tags?: string[]; // per-image content tags (titles), on top of the batch tags
};

export type Batch = {
  id: string;
  createdAt: string;
  label: string;
  year: number;
  loc: string;
  round?: number;
  test?: number;
  session: string;
  folderPath: string; // proposed Payload folder path (under 10_Media-Galleries)
  targetFolderId?: string | null; // chosen CMS folder (staging)
  targetFolderPath?: string;
  edge: number;
  race?: string; // Grand Prix name from the calendar
  tags?: string[]; // batch-wide content tags (titles), applied to every image
  rows: AssetRow[];
};

const DB = "ktulu-assets";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("batches")) db.createObjectStore("batches", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs"); // key: `${batchId}/${rowId}`
      if (!db.objectStoreNames.contains("thumbs")) db.createObjectStore("thumbs");
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store)) as IDBRequest<T>;
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      })
  );
}

export const batchStore = {
  async list(): Promise<Batch[]> {
    const all = await tx<Batch[]>("batches", "readonly", (s) => s.getAll());
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  get(id: string): Promise<Batch | undefined> {
    return tx<Batch | undefined>("batches", "readonly", (s) => s.get(id));
  },
  put(batch: Batch): Promise<unknown> {
    return tx("batches", "readwrite", (s) => s.put(batch));
  },
  async remove(id: string): Promise<void> {
    const b = await this.get(id);
    await tx("batches", "readwrite", (s) => s.delete(id));
    for (const r of b?.rows ?? []) {
      await tx("blobs", "readwrite", (s) => s.delete(`${id}/${r.id}`));
      await tx("thumbs", "readwrite", (s) => s.delete(`${id}/${r.id}`));
    }
  },
  putBlob(batchId: string, rowId: string, blob: Blob): Promise<unknown> {
    return tx("blobs", "readwrite", (s) => s.put(blob, `${batchId}/${rowId}`));
  },
  getBlob(batchId: string, rowId: string): Promise<Blob | undefined> {
    return tx<Blob | undefined>("blobs", "readonly", (s) => s.get(`${batchId}/${rowId}`));
  },
  putThumb(batchId: string, rowId: string, dataUrl: string): Promise<unknown> {
    return tx("thumbs", "readwrite", (s) => s.put(dataUrl, `${batchId}/${rowId}`));
  },
  getThumb(batchId: string, rowId: string): Promise<string | undefined> {
    return tx<string | undefined>("thumbs", "readonly", (s) => s.get(`${batchId}/${rowId}`));
  },
};

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
