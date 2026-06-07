/**
 * Lightweight audit log — Phase 7.
 * Stores audit events in IndexedDB alongside business data.
 * Never blocks business operations (all writes are fire-and-forget).
 * Hidden from staff; accessible for admin debugging.
 */

export type AuditAction =
  | "ORDER_PLACED"
  | "ORDER_VOIDED"
  | "ORDER_REFUNDED"
  | "TABLE_OPENED"
  | "TABLE_CLOSED"
  | "TABLE_ITEM_ADDED"
  | "TABLE_ITEM_REMOVED"
  | "TABLE_DISCOUNT_SET"
  | "PAYMENT_RECEIVED"
  | "CART_CLEARED"
  | "MENU_ITEM_ADDED"
  | "MENU_ITEM_UPDATED"
  | "MENU_ITEM_DELETED"
  | "CATEGORY_ADDED"
  | "CATEGORY_DELETED"
  | "SETTINGS_CHANGED"
  | "LOGIN"
  | "LOGOUT"
  | "SYNC_FAILED"
  | "SYNC_RECOVERED";

export interface AuditEntry {
  id: string;
  ts: string;           // ISO timestamp
  action: AuditAction;
  userId: string;
  username?: string;
  entityType?: string;  // "order" | "table" | "menu_item" | etc.
  entityId?: string;
  meta?: Record<string, unknown>; // before/after state snippets
}

const AUDIT_STORE = "audit_log";
const MAX_ENTRIES = 5000; // rolling window

let _auditDb: IDBDatabase | null = null;

async function getAuditDb(): Promise<IDBDatabase> {
  if (_auditDb) return _auditDb;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("sth1r_audit", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIT_STORE)) {
        const store = db.createObjectStore(AUDIT_STORE, { keyPath: "id" });
        store.createIndex("ts", "ts");
        store.createIndex("userId", "userId");
        store.createIndex("action", "action");
      }
    };
    req.onsuccess = () => { _auditDb = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

export function logAudit(
  action: AuditAction,
  userId: string,
  opts?: {
    username?: string;
    entityType?: string;
    entityId?: string;
    meta?: Record<string, unknown>;
  }
): void {
  // Fire and forget — never block business operations
  (async () => {
    try {
      const db = await getAuditDb();
      const entry: AuditEntry = {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        action,
        userId,
        ...opts,
      };
      const tx = db.transaction(AUDIT_STORE, "readwrite");
      tx.objectStore(AUDIT_STORE).put(entry);

      // Rolling window: trim if over max (async, non-blocking)
      const countReq = tx.objectStore(AUDIT_STORE).count();
      countReq.onsuccess = () => {
        if (countReq.result > MAX_ENTRIES) {
          // Delete oldest 500
          const idx = tx.objectStore(AUDIT_STORE).index("ts");
          const cursor = idx.openCursor();
          let deleted = 0;
          cursor.onsuccess = (e) => {
            const c = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (c && deleted < 500) {
              c.delete();
              deleted++;
              c.continue();
            }
          };
        }
      };
    } catch {
      // Never throw — audit is best-effort
    }
  })();
}

export async function getAuditLog(
  userId: string,
  limit = 200
): Promise<AuditEntry[]> {
  try {
    const db = await getAuditDb();
    return new Promise((resolve) => {
      const tx = db.transaction(AUDIT_STORE, "readonly");
      const idx = tx.objectStore(AUDIT_STORE).index("ts");
      const req = idx.openCursor(null, "prev");
      const results: AuditEntry[] = [];
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && results.length < limit) {
          const entry = cursor.value as AuditEntry;
          if (entry.userId === userId) results.push(entry);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function getAuditLogForEntity(
  entityId: string
): Promise<AuditEntry[]> {
  try {
    const db = await getAuditDb();
    return new Promise((resolve) => {
      const tx = db.transaction(AUDIT_STORE, "readonly");
      const store = tx.objectStore(AUDIT_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as AuditEntry[])
          .filter((e) => e.entityId === entityId)
          .sort((a, b) => b.ts.localeCompare(a.ts));
        resolve(all);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
