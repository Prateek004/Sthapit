import Dexie, { type Table } from "dexie";
import type {
  Order,
  MenuItem,
  MenuCategory,
  RawMaterial,
  FinishedGood,
  OpenTable,
  TableOrder,
} from "@/lib/types";

type WithUid<T> = T & { _uid: string };

async function migrateIfNeeded(): Promise<void> {
  try {
    if (typeof indexedDB === "undefined" || !indexedDB.databases) return;
    const databases = await indexedDB.databases();
    const dbNames = databases.map((d) => d.name);
    const hasSth1r = dbNames.includes("sth1r_db");
    const hasVynn = dbNames.includes("vynn_db");
    const hasServezy = dbNames.includes("servezy_db");

    if (hasSth1r) return;

    const sourceDbName = hasVynn ? "vynn_db" : hasServezy ? "servezy_db" : null;
    if (!sourceDbName) return;

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
  } catch {
    // non-fatal
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
    // Version 2: add tableOrders store
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
  }
}

let _db: Sth1rDB | null = null;
let _ready: Promise<Sth1rDB> | null = null;

function getDB(): Promise<Sth1rDB> {
  if (_ready) return _ready;
  _ready = migrateIfNeeded().then(() => {
    if (!_db) _db = new Sth1rDB();
    return _db;
  });
  return _ready;
}

// ── Orders ────────────────────────────────────────────────────────────────────
export async function dbSaveOrder(order: Order, uid: string): Promise<void> {
  const db = await getDB();
  await db.orders.put({ ...order, _uid: uid });
}
export async function dbGetAllOrders(uid: string): Promise<Order[]> {
  const db = await getDB();
  const rows = await db.orders
    .where("_uid")
    .equals(uid)
    .reverse()
    .sortBy("createdAt");
  return rows as unknown as Order[];
}
export async function dbGetTodaysOrders(uid: string): Promise<Order[]> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  const all = await db.orders.where("_uid").equals(uid).toArray();
  return all.filter((o) => o.createdAt.startsWith(today)) as unknown as Order[];
}
export async function dbGetPendingOrders(uid: string): Promise<Order[]> {
  const db = await getDB();
  const all = await db.orders.where("_uid").equals(uid).toArray();
  return all.filter(
    (o) => o.syncStatus === "pending" || o.syncStatus === "failed"
  ) as unknown as Order[];
}
export async function dbUpdateSyncStatus(
  id: string,
  status: Order["syncStatus"]
): Promise<void> {
  const db = await getDB();
  await db.orders.update(id, { syncStatus: status });
}

// ── Menu Items ────────────────────────────────────────────────────────────────
export async function dbSaveMenuItem(item: MenuItem, uid: string): Promise<void> {
  const db = await getDB();
  await db.menuItems.put({ ...item, _uid: uid });
}
export async function dbDeleteMenuItem(id: string, uid: string): Promise<void> {
  const db = await getDB();
  const rec = await db.menuItems.get(id);
  if (rec && rec._uid === uid) await db.menuItems.delete(id);
}
export async function dbGetAllMenuItems(uid: string): Promise<MenuItem[]> {
  const db = await getDB();
  return db.menuItems
    .where("_uid")
    .equals(uid)
    .toArray() as unknown as MenuItem[];
}
export async function dbBulkSaveMenuItems(
  items: MenuItem[],
  uid: string
): Promise<void> {
  const db = await getDB();
  await db.menuItems.bulkPut(items.map((i) => ({ ...i, _uid: uid })));
}

// ── Categories ────────────────────────────────────────────────────────────────
export async function dbSaveCategory(cat: MenuCategory, uid: string): Promise<void> {
  const db = await getDB();
  await db.categories.put({ ...cat, _uid: uid });
}
export async function dbDeleteCategory(id: string, uid: string): Promise<void> {
  const db = await getDB();
  const rec = await db.categories.get(id);
  if (rec && rec._uid === uid) await db.categories.delete(id);
}
export async function dbGetAllCategories(uid: string): Promise<MenuCategory[]> {
  const db = await getDB();
  const cats = await db.categories.where("_uid").equals(uid).toArray();
  return cats.sort((a, b) => a.sortOrder - b.sortOrder) as unknown as MenuCategory[];
}
export async function dbBulkSaveCategories(cats: MenuCategory[], uid: string): Promise<void> {
  const db = await getDB();
  await db.categories.bulkPut(cats.map((c) => ({ ...c, _uid: uid })));
}

// ── Raw Materials ─────────────────────────────────────────────────────────────
export async function dbSaveRawMaterial(item: RawMaterial, uid: string): Promise<void> {
  const db = await getDB();
  await db.rawMaterials.put({ ...item, _uid: uid });
}
export async function dbDeleteRawMaterial(id: string, uid: string): Promise<void> {
  const db = await getDB();
  const rec = await db.rawMaterials.get(id);
  if (rec && rec._uid === uid) await db.rawMaterials.delete(id);
}
export async function dbGetAllRawMaterials(uid: string): Promise<RawMaterial[]> {
  const db = await getDB();
  return db.rawMaterials.where("_uid").equals(uid).toArray() as unknown as RawMaterial[];
}

// ── Finished Goods ────────────────────────────────────────────────────────────
export async function dbSaveFinishedGood(item: FinishedGood, uid: string): Promise<void> {
  const db = await getDB();
  await db.finishedGoods.put({ ...item, _uid: uid });
}
export async function dbDeleteFinishedGood(id: string, uid: string): Promise<void> {
  const db = await getDB();
  const rec = await db.finishedGoods.get(id);
  if (rec && rec._uid === uid) await db.finishedGoods.delete(id);
}
export async function dbGetAllFinishedGoods(uid: string): Promise<FinishedGood[]> {
  const db = await getDB();
  return db.finishedGoods.where("_uid").equals(uid).toArray() as unknown as FinishedGood[];
}

// ── Bar Items ─────────────────────────────────────────────────────────────────
export async function dbSaveBarItem(item: FinishedGood, uid: string): Promise<void> {
  const db = await getDB();
  await db.barItems.put({ ...item, _uid: uid });
}
export async function dbDeleteBarItem(id: string, uid: string): Promise<void> {
  const db = await getDB();
  const rec = await db.barItems.get(id);
  if (rec && rec._uid === uid) await db.barItems.delete(id);
}
export async function dbGetAllBarItems(uid: string): Promise<FinishedGood[]> {
  const db = await getDB();
  return db.barItems.where("_uid").equals(uid).toArray() as unknown as FinishedGood[];
}

// ── Legacy Open Tables ────────────────────────────────────────────────────────
export async function dbSaveOpenTable(tab: OpenTable, uid: string): Promise<void> {
  const db = await getDB();
  await db.openTables.put({ ...tab, _uid: uid });
}
export async function dbGetAllOpenTables(uid: string): Promise<OpenTable[]> {
  const db = await getDB();
  return db.openTables.where("_uid").equals(uid).toArray() as unknown as OpenTable[];
}
export async function dbDeleteOpenTable(id: string, uid: string): Promise<void> {
  const db = await getDB();
  const rec = await db.openTables.get(id);
  if (rec && rec._uid === uid) await db.openTables.delete(id);
}

// ── TableOrders (new module) ──────────────────────────────────────────────────
export async function dbSaveTableOrder(order: TableOrder, uid: string): Promise<void> {
  const db = await getDB();
  await db.tableOrders.put({ ...order, _uid: uid });
}

export async function dbGetTableOrder(id: string, uid: string): Promise<TableOrder | null> {
  const db = await getDB();
  const rec = await db.tableOrders.get(id);
  if (!rec || rec._uid !== uid) return null;
  return rec as unknown as TableOrder;
}

export async function dbGetAllTableOrders(uid: string): Promise<TableOrder[]> {
  const db = await getDB();
  return db.tableOrders
    .where("_uid")
    .equals(uid)
    .toArray() as unknown as TableOrder[];
}

export async function dbDeleteTableOrder(id: string, uid: string): Promise<void> {
  const db = await getDB();
  const rec = await db.tableOrders.get(id);
  if (rec && rec._uid === uid) await db.tableOrders.delete(id);
}

export async function dbGetPendingTableOrders(uid: string): Promise<TableOrder[]> {
  const db = await getDB();
  const all = await db.tableOrders.where("_uid").equals(uid).toArray();
  return all.filter(
    (o) => o.syncStatus === "pending" || o.syncStatus === "failed"
  ) as unknown as TableOrder[];
}

export async function dbUpdateTableOrderSyncStatus(
  id: string,
  status: TableOrder["syncStatus"]
): Promise<void> {
  const db = await getDB();
  await db.tableOrders.update(id, { syncStatus: status });
}
