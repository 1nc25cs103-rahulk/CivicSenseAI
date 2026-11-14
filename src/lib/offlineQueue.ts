import type { OfflineDraftComplaint } from '../types/index.ts';

const DB_NAME = 'civicsense-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'draft_complaints';

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineDraft(draft: OfflineDraftComplaint): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getOfflineDrafts(userId?: number): Promise<OfflineDraftComplaint[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openOfflineDb();
  const items = await new Promise<OfflineDraftComplaint[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as OfflineDraftComplaint[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  const filtered =
    typeof userId === 'number'
      ? items.filter((item) => item.userId === undefined || item.userId === userId)
      : items;
  return filtered.sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
}

export async function removeOfflineDraft(localId: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
