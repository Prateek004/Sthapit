import Dexie, { type Table } from "dexie";
import type {
  Order,
  MenuItem,
  MenuCategory,
  RawMaterial,
  FinishedGood,
  OpenTable,
  TableOrder,
  WastageEntry,
  Recipe,
  PurchaseRecord,
  PersistedCart,
  LeakAction,
} from "@/lib/types";
import { recordIdbError } from "@/lib/utils/observability";

type WithUid<T> = T & { _uid: string };

// ── Migration status — P0-11: never silently fail ─────────────────────────────
const MIGRATION_STATUS_KEY = "sth1r_migration_status";
export type MigrationStatus = "ok" | "failed" | "in_progress" | "none";

export function getMigrationStatus(): MigrationStatus {
  try {
    return (localStorage.getItem(MIGRATION_STATUS_KEY) as MigrationStatus) ?? "none";
  } catch {
    return "none";
  }
}
function setMigrationStatus(s: MigrationStatus) {
  try { localStorage.setItem(MIGRATION_STATUS_KEY, s); } catch {}
}

async function migrateIfNeeded(): Promise<void> {
  try {
    if (typeof indexedDB === "undefined" || !indexedDB.databases) return;
    const databases = await indexedDB.databases();
    const dbNames = databases.map((d) => d.name);
    const hasSth1r = dbNames.includes("sth1r_db");
    const hasVynn = dbNames.includes("vynn_db");
    const hasServezy = dbNames.includes("servezy_db");

    if (hasSth1r) { setMigrationStatus("ok"); return; }

    const sourceDbName = hasVynn ? "vynn_db" : hasServezy ? "servezy_db" : null;
    if (!sourceDbName) { setMigrationStatus("ok"); return; }

    setMigrationStatus("in_progress");

    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(sourceDbName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const storeNames = Array.from(old.objectStoreNames);
    const exported: Record<string, unknown[]> = {};

    await Promise.all(
      storeNames.map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const tx = old.transaction(name, "readonly");
            const req = tx.objectStore(name).getAll();
            req.onsuccess = () => {
              exported[name] = req.result ?? [];
              resolve();
            };
            req.onerror = () => reject(req.error);
          })
      )
    );
    old.close();

    const sth1r = new Sth1rDB();
    await sth1r.open();

    const tableMap: Record<string, Table> = {
      orders:        sth1r.orders as unknown as Table,
      menuItems:     sth1r.menuItems as unknown as Table,
      categories:    sth1r.categories as unknown as Table,
      rawMaterials:  sth1r.rawMaterials as unknown as Table,
      finishedGoods: sth1r.finishedGoods as unknown as Table,
      barItems:      sth1r.barItems as unknown as Table,
      openTables:    sth1r.openTables as unknown as Table,
    };

    for (const [store, rows] of Object.entries(exported)) {
      if (tableMap[store] && rows.length > 0) {
        await tableMap[store].bulkPut(rows);
      }
    }
    sth1r.close();

    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(sourceDbName);
      req.onsuccess = () => resolve();
      req.onerror  = () => resolve();
      req.onblocked = () => resolve();
    });

    setMigrationStatus("ok");
  } catch (err) {
    setMigrationStatus("failed");
    console.error("[Sth1r] DB migration failed:", err);
    recordIdbError();
  }
}

class Sth1rDB extends Dexie {
  orders!:        Table<WithUid<Order>,        string>;
  menuItems!:     Table<WithUid<MenuItem>,     string>;
  categories!:    Table<WithUid<MenuCategory>, string>;
  rawMaterials!:  Table<WithUid<RawMaterial>,  string>;
  finishedGoods!: Table<WithUid<FinishedGood>, string>;
  barItems!:      Table<WithUid<FinishedGood>, string>;
  openTables!:    Table<WithUid<OpenTable>,    string>;
  tableOrders!:   Table<WithUid<TableOrder>,   string>;
  carts!:         Table<PersistedCart,         string>;
  leakActions!:   Table<WithUid<LeakAction>,   string>;
  wastage!:       Table<WithUid<WastageEntry>, string>;
  recipes!:       Table<WithUid<Recipe>, string>;
  purchases!:     Table<WithUid<PurchaseRecord>, string>;

  constructor() {
    super("sth1r_db");
    this.version(1).stores({
      orders:        "id, _uid, createdAt, syncStatus",
      menuItems:     "id, _uid, categoryId",
      categories:    "id, _uid, sortOrder",
      rawMaterials:  "id, _uid, name",
      finishedGoods: "id, _uid, name, expiryDate",
      barItems:      "id, _uid, name, expiryDate",
      openTables:    "id, _uid, tableNumber",
    });
    this.version(2).stores({
      orders:        "id, _uid, createdAt, syncStatus",
      menuItems:     "id, _uid, categoryId",
      categories:    "id, _uid, sortOrder",
      rawMaterials:  "id, _uid, name",
      finishedGoods: "id, _uid, name, expiryDate",
      barItems:      "id, _uid, name, expiryDate",
      openTables:    "id, _uid, tableNumber",
      tableOrders:   "id, _uid, tableId, status, syncStatus",
    });
    this.version(3).stores({
      orders:        "id, _uid, createdAt, syncStatus, status",
      menuItems:     "id, _uid, categoryId",
      categories:    "id, _uid, sortOrder",
      rawMaterials:  "id, _uid, name",
      finishedGoods: "id, _uid, name, expiryDate",
      barItems:      "id, _uid, name, expiryDate",
      openTables:    "id, _uid, tableNumber",
      tableOrders:   "id, _uid, tableId, status, syncStatus",
      carts:         "id",
    });
    // Version 4: audit_events lightweight store for Phase 7
    // (audit_log DB is separate, but we add updatedAt index on tableOrders)
    this.version(4).stores({
      orders:        "id, _uid, createdAt, syncStatus, status",
      menuItems:     "id, _uid, categoryId",
      categories:    "id, _uid, sortOrder",
      rawMaterials:  "id, _uid, name",
      finishedGoods: "id, _uid, name, expiryDate",
      barItems:      "id, _uid, name, expiryDate",
      openTables:    "id, _uid, tableNumber",
      tableOrders:   "id, _uid, tableId, status, syncStatus, updatedAt",
      carts:         "id",
    });
    // Version 5: leakActions store for Profit AI — Resolve/Snooze persistence.
    // Purely additive: existing stores are unchanged.
    this.version(5).stores({
      orders:        "id, _uid, createdAt, syncStatus, status",
      menuItems:     "id, _uid, categoryId",
      categories:    "id, _uid, sortOrder",
      rawMaterials:  "id, _uid, name",
      finishedGoods: "id, _uid, name, expiryDate",
      barItems:      "id, _uid, name, expiryDate",
      openTables:    "id, _uid, tableNumber",
      tableOrders:   "id, _uid, tableId, status, syncStatus, updatedAt",
      carts:         "id",
      leakActions:   "id, _uid",
    });
    // Version 6: wastage store for G4 Wastage Tracker.
    // Purely additive: existing stores are unchanged, no data migration runs.
    this.version(6).stores({
      orders:        "id, _uid, createdAt, syncStatus, status",
      menuItems:     "id, _uid, categoryId",
      categories:    "id, _uid, sortOrder",
      rawMaterials:  "id, _uid, name",
      finishedGoods: "id, _uid, name, expiryDate",
      barItems:      "id, _uid, name, expiryDate",
      openTables:    "id, _uid, tableNumber",
      tableOrders:   "id, _uid, tableId, status, syncStatus, updatedAt",
      carts:         "id",
      leakActions:   "id, _uid",
      wastage:       "id, _uid, createdAt",
    });
    // Version 7: recipes (G2) + purchases (G1). Purely additive.
    this.version(7).stores({
      orders:        "id, _uid, createdAt, syncStatus, status",
      menuItems:     "id, _uid, categoryId",
      categories:    "id, _uid, sortOrder",
      rawMaterials:  "id, _uid, name",
      finishedGoods: "id, _uid, name, expiryDate",
      barItems:      "id, _uid, name, expiryDate",
      openTables:    "id, _uid, tableNumber",
      tableOrders:   "id, _uid, tableId, status, syncStatus, updatedAt",
      carts:         "id",
      leakActions:   "id, _uid",
      wastage:       "id, _uid, createdAt",
      recipes:       "id, _uid",
      purchases:     "id, _uid, createdAt",
    });
  }
}

let _db: Sth1rDB | null = null;
let _ready: Promise<Sth1rDB> | null = null;

function getDB(): Promise<Sth1rDB> {
  if (_ready) return _ready;
  _ready = migrateIfNeeded().then(() => {
    if (!_db) _db = new Sth1rDB();
    return _db;
  }).catch((err) => {
    recordIdbError();
    // Reset so next call retries
    _ready = null;
    throw err;
  });
  return _ready;
}

// ── P0-01: Cart persistence ───────────────────────────────────────────────────
const CART_IDB_KEY = "active_cart";

export async function dbSaveCart(items: import("@/lib/types").CartItem[], uid: string): Promise<void> {
  try {
    const db = await getDB();
    await db.carts.put({ id: CART_IDB_KEY, _uid: uid, items, updatedAt: new Date().toISOString() });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbLoadCart(uid: string): Promise<import("@/lib/types").CartItem[]> {
  try {
    const db = await getDB();
    const rec = await db.carts.get(CART_IDB_KEY);
    if (!rec || rec._uid !== uid) return [];
    return rec.items ?? [];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbClearCart(uid: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.carts.get(CART_IDB_KEY);
    if (rec && rec._uid === uid) await db.carts.delete(CART_IDB_KEY);
  } catch {
    recordIdbError();
  }
}

// ── Orders ────────────────────────────────────────────────────────────────────
export async function dbSaveOrder(order: Order, uid: string): Promise<void> {
  try {
    // INVARIANT: totalPaise must be non-negative
    if (order.totalPaise < 0) throw new Error(`Invariant violation: negative totalPaise on order ${order.id}`);
    const db = await getDB();
    await db.orders.put({ ...order, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetAllOrders(uid: string): Promise<Order[]> {
  try {
    const db = await getDB();
    const rows = await db.orders
      .where("_uid")
      .equals(uid)
      .reverse()
      .sortBy("createdAt");
    return rows as unknown as Order[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbGetTodaysOrders(uid: string): Promise<Order[]> {
  try {
    const db = await getDB();
    const { todayStr, dateStrIST } = await import("@/lib/utils");
    const today = todayStr();
    const all = await db.orders.where("_uid").equals(uid).toArray();
    return all.filter((o) => dateStrIST(o.createdAt) === today) as unknown as Order[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbGetPendingOrders(uid: string): Promise<Order[]> {
  try {
    const db = await getDB();
    const all = await db.orders.where("_uid").equals(uid).toArray();
    return all.filter(
      (o) => o.syncStatus === "pending" || o.syncStatus === "failed"
    ) as unknown as Order[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbUpdateSyncStatus(
  id: string,
  status: Order["syncStatus"]
): Promise<void> {
  try {
    const db = await getDB();
    await db.orders.update(id, { syncStatus: status });
  } catch {
    recordIdbError();
  }
}

export async function dbVoidOrder(id: string, uid: string, reason?: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.orders.get(id);
    if (!rec || rec._uid !== uid) return;
    // INVARIANT: Cannot void an already-voided order
    if (rec.status === "voided") return;
    await db.orders.update(id, {
      status: "voided",
      voidedAt: new Date().toISOString(),
      voidReason: reason ?? "",
      syncStatus: "pending",
    });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

// ── Menu Items ────────────────────────────────────────────────────────────────
export async function dbSaveMenuItem(item: MenuItem, uid: string): Promise<void> {
  try {
    const db = await getDB();
    await db.menuItems.put({ ...item, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbDeleteMenuItem(id: string, uid: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.menuItems.get(id);
    if (rec && rec._uid === uid) await db.menuItems.delete(id);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetAllMenuItems(uid: string): Promise<MenuItem[]> {
  try {
    const db = await getDB();
    return db.menuItems
      .where("_uid")
      .equals(uid)
      .toArray() as unknown as MenuItem[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbBulkSaveMenuItems(items: MenuItem[], uid: string): Promise<void> {
  try {
    const db = await getDB();
    await db.menuItems.bulkPut(items.map((i) => ({ ...i, _uid: uid })));
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

// ── Categories ────────────────────────────────────────────────────────────────
export async function dbSaveCategory(cat: MenuCategory, uid: string): Promise<void> {
  try {
    const db = await getDB();
    await db.categories.put({ ...cat, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbDeleteCategory(id: string, uid: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.categories.get(id);
    if (rec && rec._uid === uid) await db.categories.delete(id);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetAllCategories(uid: string): Promise<MenuCategory[]> {
  try {
    const db = await getDB();
    const cats = await db.categories.where("_uid").equals(uid).toArray();
    return cats.sort((a, b) => a.sortOrder - b.sortOrder) as unknown as MenuCategory[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbBulkSaveCategories(cats: MenuCategory[], uid: string): Promise<void> {
  try {
    const db = await getDB();
    await db.categories.bulkPut(cats.map((c) => ({ ...c, _uid: uid })));
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

// ── Raw Materials ─────────────────────────────────────────────────────────────
export async function dbSaveRawMaterial(item: RawMaterial, uid: string): Promise<void> {
  try {
    const db = await getDB();
    await db.rawMaterials.put({ ...item, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbDeleteRawMaterial(id: string, uid: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.rawMaterials.get(id);
    if (rec && rec._uid === uid) await db.rawMaterials.delete(id);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetAllRawMaterials(uid: string): Promise<RawMaterial[]> {
  try {
    const db = await getDB();
    return db.rawMaterials.where("_uid").equals(uid).toArray() as unknown as RawMaterial[];
  } catch {
    recordIdbError();
    return [];
  }
}

// ── Finished Goods ────────────────────────────────────────────────────────────
export async function dbSaveFinishedGood(item: FinishedGood, uid: string): Promise<void> {
  try {
    const db = await getDB();
    await db.finishedGoods.put({ ...item, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbDeleteFinishedGood(id: string, uid: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.finishedGoods.get(id);
    if (rec && rec._uid === uid) await db.finishedGoods.delete(id);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetAllFinishedGoods(uid: string): Promise<FinishedGood[]> {
  try {
    const db = await getDB();
    return db.finishedGoods.where("_uid").equals(uid).toArray() as unknown as FinishedGood[];
  } catch {
    recordIdbError();
    return [];
  }
}

// ── Bar Items ─────────────────────────────────────────────────────────────────
export async function dbSaveBarItem(item: FinishedGood, uid: string): Promise<void> {
  try {
    const db = await getDB();
    await db.barItems.put({ ...item, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbDeleteBarItem(id: string, uid: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.barItems.get(id);
    if (rec && rec._uid === uid) await db.barItems.delete(id);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetAllBarItems(uid: string): Promise<FinishedGood[]> {
  try {
    const db = await getDB();
    return db.barItems.where("_uid").equals(uid).toArray() as unknown as FinishedGood[];
  } catch {
    recordIdbError();
    return [];
  }
}

// ── Legacy Open Tables ────────────────────────────────────────────────────────
export async function dbSaveOpenTable(tab: OpenTable, uid: string): Promise<void> {
  try {
    const db = await getDB();
    await db.openTables.put({ ...tab, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetAllOpenTables(uid: string): Promise<OpenTable[]> {
  try {
    const db = await getDB();
    return db.openTables.where("_uid").equals(uid).toArray() as unknown as OpenTable[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbDeleteOpenTable(id: string, uid: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.openTables.get(id);
    if (rec && rec._uid === uid) await db.openTables.delete(id);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

// ── TableOrders ───────────────────────────────────────────────────────────────
export async function dbSaveTableOrder(order: TableOrder, uid: string): Promise<void> {
  try {
    // INVARIANT: totalPaise must be non-negative
    if (order.totalPaise < 0) throw new Error(`Invariant violation: negative totalPaise on table order ${order.id}`);
    const db = await getDB();
    await db.tableOrders.put({ ...order, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetTableOrder(id: string, uid: string): Promise<TableOrder | null> {
  try {
    const db = await getDB();
    const rec = await db.tableOrders.get(id);
    if (!rec || rec._uid !== uid) return null;
    return rec as unknown as TableOrder;
  } catch {
    recordIdbError();
    return null;
  }
}

export async function dbGetAllTableOrders(uid: string): Promise<TableOrder[]> {
  try {
    const db = await getDB();
    return db.tableOrders
      .where("_uid")
      .equals(uid)
      .toArray() as unknown as TableOrder[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbDeleteTableOrder(id: string, uid: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.tableOrders.get(id);
    if (rec && rec._uid === uid) await db.tableOrders.delete(id);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetPendingTableOrders(uid: string): Promise<TableOrder[]> {
  try {
    const db = await getDB();
    const all = await db.tableOrders.where("_uid").equals(uid).toArray();
    return all.filter(
      (o) => o.syncStatus === "pending" || o.syncStatus === "failed"
    ) as unknown as TableOrder[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbUpdateTableOrderSyncStatus(
  id: string,
  status: TableOrder["syncStatus"]
): Promise<void> {
  try {
    const db = await getDB();
    await db.tableOrders.update(id, { syncStatus: status });
  } catch {
    recordIdbError();
  }
}

/**
 * Atomic read-modify-write for TableOrder.
 * FIX C-03/H-03: Prevents lost-update race between concurrent addItem calls.
 * All mutations to a TableOrder must go through this function.
 */
export async function dbAtomicUpdateTableOrder(
  id: string,
  uid: string,
  updater: (current: TableOrder | null) => TableOrder | null
): Promise<TableOrder | null> {
  try {
    const db = await getDB();
    return await db.transaction("rw", db.tableOrders, async () => {
      const rec = await db.tableOrders.get(id);
      const current = (rec && rec._uid === uid) ? rec as unknown as TableOrder : null;
      const next = updater(current);
      if (next === null) return null;
      if (next.totalPaise < 0) throw new Error("Invariant: negative totalPaise");
      await db.tableOrders.put({ ...next, _uid: uid });
      return next;
    });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

// ── Leak Actions (Profit AI — Resolve/Snooze) ────────────────────────────────
export async function dbGetLeakActions(uid: string): Promise<LeakAction[]> {
  try {
    const db = await getDB();
    return db.leakActions.where("_uid").equals(uid).toArray() as unknown as LeakAction[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbSetLeakAction(
  uid: string,
  leakActionId: string,
  status: LeakAction["status"]
): Promise<void> {
  try {
    const db = await getDB();
    await db.leakActions.put({
      id: leakActionId,
      status,
      updatedAt: new Date().toISOString(),
      _uid: uid,
    });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbClearLeakAction(uid: string, leakActionId: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.leakActions.get(leakActionId);
    if (rec && rec._uid === uid) await db.leakActions.delete(leakActionId);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

// ── Wastage Tracker (G4) ──────────────────────────────────────────────────────
export async function dbAddWastage(uid: string, entry: WastageEntry): Promise<void> {
  try {
    const db = await getDB();
    await db.wastage.put({ ...entry, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

/** Returns entries newest-first. Pass sinceIso to limit the window. */
export async function dbGetWastage(uid: string, sinceIso?: string): Promise<WastageEntry[]> {
  try {
    const db = await getDB();
    let rows = (await db.wastage
      .where("_uid")
      .equals(uid)
      .toArray()) as unknown as WastageEntry[];
    if (sinceIso) rows = rows.filter((r) => r.createdAt >= sinceIso);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbDeleteWastage(uid: string, entryId: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.wastage.get(entryId);
    if (rec && rec._uid === uid) await db.wastage.delete(entryId);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

// ── Recipes (G2) ──────────────────────────────────────────────────────────────
export async function dbSaveRecipe(uid: string, recipe: Recipe): Promise<void> {
  try {
    const db = await getDB();
    await db.recipes.put({ ...recipe, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetAllRecipes(uid: string): Promise<Recipe[]> {
  try {
    const db = await getDB();
    return (await db.recipes
      .where("_uid")
      .equals(uid)
      .toArray()) as unknown as Recipe[];
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbDeleteRecipe(uid: string, recipeId: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.recipes.get(recipeId);
    if (rec && rec._uid === uid) await db.recipes.delete(recipeId);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

// ── Purchases (G1) ────────────────────────────────────────────────────────────
export async function dbAddPurchase(uid: string, purchase: PurchaseRecord): Promise<void> {
  try {
    const db = await getDB();
    await db.purchases.put({ ...purchase, _uid: uid });
  } catch (err) {
    recordIdbError();
    throw err;
  }
}

export async function dbGetPurchases(uid: string): Promise<PurchaseRecord[]> {
  try {
    const db = await getDB();
    const rows = (await db.purchases
      .where("_uid")
      .equals(uid)
      .toArray()) as unknown as PurchaseRecord[];
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    recordIdbError();
    return [];
  }
}

export async function dbDeletePurchase(uid: string, purchaseId: string): Promise<void> {
  try {
    const db = await getDB();
    const rec = await db.purchases.get(purchaseId);
    if (rec && rec._uid === uid) await db.purchases.delete(purchaseId);
  } catch (err) {
    recordIdbError();
    throw err;
  }
}
