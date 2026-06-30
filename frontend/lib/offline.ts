// IndexedDB 暂存 todos 离线改动 + 上线同步
// 极简实现:V1 只支持 offline-queue 模式(把离线时的 mutation 排队,上线后逐个重放)

const DB_NAME = "todoapp-offline";
const DB_VERSION = 1;
const QUEUE_STORE = "pending-mutations";

export type PendingMutation =
  | { kind: "create"; title: string; description?: string }
  | { kind: "update"; id: number; patch: { title?: string; description?: string; completed?: boolean } }
  | { kind: "delete"; id: number }
  | { kind: "toggle"; id: number; completed: boolean };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
  });
}

// 入参类型(显式,避开 Omit<Union, "id"> 的分配性坑)
export type PendingMutationInput =
  | { kind: "create"; title: string; description?: string }
  | { kind: "update"; id: number; patch: { title?: string; description?: string; completed?: boolean } }
  | { kind: "delete"; id: number }
  | { kind: "toggle"; id: number; completed: boolean };

export async function enqueue(m: PendingMutationInput): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).add(m);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueue(): Promise<PendingMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result as PendingMutation[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearQueue(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
