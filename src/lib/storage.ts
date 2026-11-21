// Progresso da varredura no IndexedDB (so numeros, nunca imagens).
import type { ScanData } from "./types";

const DB = "frame-do-pregador";
const STORE = "varreduras";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

export async function loadScan(key: string): Promise<ScanData | null> {
  try {
    return ((await tx("readonly", (s) => s.get(key))) as ScanData | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveScan(data: ScanData): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put({ ...data, updatedAt: Date.now() }));
  } catch {
    /* sem espaco ou modo privado: segue sem salvar */
  }
}

export async function deleteScan(key: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(key));
  } catch {
    /* ignora */
  }
}
