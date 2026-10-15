// Per-browser store for photobooks (IndexedDB): the book record plus the
// photos as blobs (already downscaled on import). Same pattern as the
// Asset Uploader's batch store.
import type { Book } from "./photobook";

const DB = "ktulu-photobook";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("books")) db.createObjectStore("books", { keyPath: "id" });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos"); // key `${bookId}/${photoId}`
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const r = fn(db.transaction(store, mode).objectStore(store));
        r.onsuccess = () => res(r.result as T);
        r.onerror = () => rej(r.error);
      })
  );
}

export const bookStore = {
  async list(): Promise<Book[]> {
    const all = await tx<Book[]>("books", "readonly", (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  get(id: string) {
    return tx<Book | undefined>("books", "readonly", (s) => s.get(id));
  },
  put(book: Book) {
    return tx("books", "readwrite", (s) => s.put({ ...book, updatedAt: new Date().toISOString() }));
  },
  async remove(id: string) {
    const b = await this.get(id);
    await tx("books", "readwrite", (s) => s.delete(id));
    for (const p of b?.photos ?? []) await tx("photos", "readwrite", (s) => s.delete(`${id}/${p.id}`));
  },
  putPhoto(bookId: string, photoId: string, blob: Blob) {
    return tx("photos", "readwrite", (s) => s.put(blob, `${bookId}/${photoId}`));
  },
  getPhoto(bookId: string, photoId: string) {
    return tx<Blob | undefined>("photos", "readonly", (s) => s.get(`${bookId}/${photoId}`));
  },
  deletePhoto(bookId: string, photoId: string) {
    return tx("photos", "readwrite", (s) => s.delete(`${bookId}/${photoId}`));
  },
};
