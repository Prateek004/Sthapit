"use client";

/**
 * TableStore — isolated state for the /tables module.
 *
 * FIXES applied in this version:
 *  H-03: All mutations use dbAtomicUpdateTableOrder — no lost-update race.
 *  C-01: clearOrder() now syncs deletion to Supabase.
 *  C-03: persist() is serialized per-table via a per-table mutex map.
 *  H-08: Permission check added to checkout path (enforced upstream).
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  TableOrder,
  TableOrderItem,
  MenuItem,
  AddOn,
  CartItem,
  UserSession,
} from "@/lib/types";
import { calcGST } from "@/lib/utils";
import { Mutex } from "@/lib/utils/mutex";
import { logAudit } from "@/lib/utils/auditLog";

// ── Per-table mutex map ───────────────────────────────────────────────────────
// Prevents concurrent mutations on the same table from racing.
const _tableMutexes = new Map<string, Mutex>();
function getTableMutex(tableId: string): Mutex {
  if (!_tableMutexes.has(tableId)) _tableMutexes.set(tableId, new Mutex());
  return _tableMutexes.get(tableId)!;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tableOrderId(tableId: string): string {
  return `table_${tableId}`;
}

function itemMergeKey(i: {
  menuItemId: string;
  selectedSize?: string;
  selectedPortion?: string;
  selectedAddOns: { id: string }[];
  notes?: string;
}): string {
  return [
    i.menuItemId,
    i.selectedSize ?? "",
    i.selectedPortion ?? "",
    i.selectedAddOns.map((a) => a.id).sort().join(","),
    i.notes ?? "",
  ].join("|");
}

function computeTotals(
  items: TableOrderItem[],
  gstPercent: number,
  discountPaise: number
): { subtotalPaise: number; taxPaise: number; totalPaise: number } {
  const subtotalPaise = items.reduce((s, i) => {
    const ao = i.selectedAddOns.reduce((x, a) => x + a.pricePaise, 0);
    return s + (i.unitPricePaise + ao) * i.qty;
  }, 0);
  const afterDiscount = Math.max(0, subtotalPaise - discountPaise);
  const taxPaise = calcGST(afterDiscount, gstPercent);
  const totalPaise = afterDiscount + taxPaise;
  return { subtotalPaise, taxPaise, totalPaise };
}

function makeTableOrder(
  tableId: string,
  tableName: string,
  tableNumber: number,
  gstPercentAtOpen: number
): TableOrder {
  const now = new Date().toISOString();
  return {
    id: tableOrderId(tableId),
    tableId,
    tableName,
    tableNumber,
    status: "AVAILABLE",
    items: [],
    subtotalPaise: 0,
    taxPaise: 0,
    discountPaise: 0,
    totalPaise: 0,
    heldAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
    syncStatus: "pending",
    gstPercentAtOpen,
    kotFiredAt: null,
    kotAutoPlaced: false,
  };
}

// ── State & Actions ───────────────────────────────────────────────────────────

interface TableStoreState {
  orders: Record<string, TableOrder>;
  isLoading: boolean;
}

type TableStoreAction =
  | { type: "INIT"; orders: TableOrder[] }
  | { type: "UPSERT"; order: TableOrder }
  | { type: "DELETE"; id: string };

function reducer(state: TableStoreState, action: TableStoreAction): TableStoreState {
  switch (action.type) {
    case "INIT": {
      const orders: Record<string, TableOrder> = {};
      for (const o of action.orders) orders[o.id] = o;
      return { orders, isLoading: false };
    }
    case "UPSERT":
      return {
        ...state,
        orders: { ...state.orders, [action.order.id]: action.order },
      };
    case "DELETE": {
      const next = { ...state.orders };
      delete next[action.id];
      return { ...state, orders: next };
    }
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface TableStoreContextValue {
  state: TableStoreState;
  getOrCreateOrder: (tableId: string, tableName: string, tableNumber: number) => TableOrder;
  addItem: (tableId: string, tableName: string, tableNumber: number, item: MenuItem, addOns: AddOn[], size?: string, portion?: string, notes?: string) => Promise<void>;
  addCartItems: (tableId: string, tableName: string, tableNumber: number, items: CartItem[]) => Promise<void>;
  updateItemQty: (tableId: string, cartId: string, qty: number) => Promise<void>;
  removeItem: (tableId: string, cartId: string) => Promise<void>;
  setDiscount: (tableId: string, discountPaise: number) => Promise<void>;
  holdOrder: (tableId: string) => Promise<void>;
  markKotFired: (tableId: string, auto?: boolean) => Promise<void>;
  clearOrder: (tableId: string) => Promise<void>;
  getTableOrder: (tableId: string) => TableOrder | null;
}

const TableStoreContext = createContext<TableStoreContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function TableStoreProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: UserSession | null;
}) {
  const [state, dispatch] = useReducer(reducer, { orders: {}, isLoading: true });
  const uid = session?.businessId ?? "default";
  const currentGstPercent = session?.gstPercent ?? 0;
  const stateRef = useRef(state);
  stateRef.current = state;
  const uidRef = useRef(uid);
  uidRef.current = uid;

  // Boot: load from IDB
  useEffect(() => {
    if (!session) {
      dispatch({ type: "INIT", orders: [] });
      return;
    }
    import("@/lib/db").then(({ dbGetAllTableOrders }) =>
      dbGetAllTableOrders(uid).then((orders) => {
        dispatch({ type: "INIT", orders });
      })
    );
  }, [session?.businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription
  useEffect(() => {
    if (!session?.businessId) return;
    import("@/lib/supabase/tableSync").then(({ subscribeToTableOrders }) => {
      const unsub = subscribeToTableOrders(
        session.businessId,
        (order) => {
          const local = stateRef.current.orders[order.id];
          if (!local || order.version > local.version) {
            dispatch({ type: "UPSERT", order });
          }
        },
        (orderId) => dispatch({ type: "DELETE", id: orderId })
      );
      return unsub;
    }).catch(() => {});
  }, [session?.businessId]);

  // ── Internal: atomic persist ─────────────────────────────────────────────
  // FIX H-03: All writes go through dbAtomicUpdateTableOrder (IDB transaction).
  // FIX C-03: Serialized per-table via mutex.
  const persistAtomic = useCallback(
    async (
      tableId: string,
      updater: (current: TableOrder | null) => TableOrder | null
    ): Promise<TableOrder | null> => {
      const orderId = tableOrderId(tableId);
      const mutex = getTableMutex(tableId);

      return mutex.run(async () => {
        const { dbAtomicUpdateTableOrder } = await import("@/lib/db");
        const result = await dbAtomicUpdateTableOrder(orderId, uidRef.current, updater);
        if (result) {
          dispatch({ type: "UPSERT", order: result });
          // Fire-and-forget Supabase sync
          import("@/lib/supabase/tableSync")
            .then(({ syncTableOrder }) => syncTableOrder(result, uidRef.current))
            .catch(() => {});
        }
        return result;
      });
    },
    []
  );

  // ── Public API ────────────────────────────────────────────────────────────

  const getOrCreateOrder = useCallback(
    (tableId: string, tableName: string, tableNumber: number): TableOrder => {
      const id = tableOrderId(tableId);
      return stateRef.current.orders[id] ?? makeTableOrder(tableId, tableName, tableNumber, currentGstPercent);
    },
    [currentGstPercent]
  );

  const getTableOrder = useCallback(
    (tableId: string): TableOrder | null => {
      const id = tableOrderId(tableId);
      return stateRef.current.orders[id] ?? null;
    },
    []
  );

  const addItem = useCallback(
    async (
      tableId: string,
      tableName: string,
      tableNumber: number,
      menuItem: MenuItem,
      addOns: AddOn[],
      size?: string,
      portion?: string,
      notes?: string
    ): Promise<void> => {
      await persistAtomic(tableId, (existing) => {
        const base = existing ?? makeTableOrder(tableId, tableName, tableNumber, currentGstPercent);

        const mergeKey = [
          menuItem.id,
          size ?? "",
          portion ?? "",
          addOns.map((a) => a.id).sort().join(","),
          notes ?? "",
        ].join("|");

        let newItems: TableOrderItem[];
        const matchIdx = base.items.findIndex((i) => itemMergeKey(i) === mergeKey);

        if (matchIdx !== -1) {
          newItems = base.items.map((i, idx) =>
            idx === matchIdx ? { ...i, qty: i.qty + 1 } : i
          );
        } else {
          const unitPrice = size
            ? (menuItem.sizes?.find((s) => s.label === size)?.pricePaise ?? menuItem.pricePaise)
            : portion
            ? (menuItem.portions?.find((p) => p.label === portion)?.pricePaise ?? menuItem.pricePaise)
            : menuItem.pricePaise;
          newItems = [
            ...base.items,
            {
              cartId: crypto.randomUUID(),
              menuItemId: menuItem.id,
              name: menuItem.name,
              unitPricePaise: unitPrice,
              qty: 1,
              selectedSize: size,
              selectedPortion: portion,
              selectedAddOns: addOns,
              notes,
            },
          ];
        }

        const now = new Date().toISOString();
        const { subtotalPaise, taxPaise, totalPaise } = computeTotals(
          newItems,
          base.gstPercentAtOpen ?? currentGstPercent,
          base.discountPaise
        );

        return {
          ...base,
          items: newItems,
          status: "OCCUPIED",
          subtotalPaise,
          taxPaise,
          totalPaise,
          updatedAt: now,
          heldAt: base.heldAt ?? now,
          version: base.version + 1,
          syncStatus: "pending",
          // BUGFIX: items changed since the last KOT print — a stale "already
          // printed" flag would let new items silently miss the kitchen.
          kotFiredAt: null,
          kotAutoPlaced: false,
        };
      });

      logAudit("TABLE_ITEM_ADDED", uid, {
        entityType: "table",
        entityId: tableId,
        meta: { menuItemId: menuItem.id, name: menuItem.name },
      });
    },
    [persistAtomic, currentGstPercent, uid]
  );

  const addCartItems = useCallback(
    async (
      tableId: string,
      tableName: string,
      tableNumber: number,
      incoming: CartItem[]
    ): Promise<void> => {
      if (!incoming || incoming.length === 0) return;

      await persistAtomic(tableId, (existing) => {
        const base = existing ?? makeTableOrder(tableId, tableName, tableNumber, currentGstPercent);
        const newItems: TableOrderItem[] = base.items.map((i) => ({ ...i }));

        for (const ci of incoming) {
          const key = itemMergeKey(ci);
          const idx = newItems.findIndex((i) => itemMergeKey(i) === key);
          if (idx !== -1) {
            newItems[idx] = { ...newItems[idx], qty: newItems[idx].qty + ci.qty };
          } else {
            newItems.push({
              cartId: crypto.randomUUID(),
              menuItemId: ci.menuItemId,
              name: ci.name,
              unitPricePaise: ci.unitPricePaise,
              qty: ci.qty,
              selectedSize: ci.selectedSize,
              selectedPortion: ci.selectedPortion,
              selectedAddOns: ci.selectedAddOns,
              notes: ci.notes,
            });
          }
        }

        const now = new Date().toISOString();
        const { subtotalPaise, taxPaise, totalPaise } = computeTotals(
          newItems,
          base.gstPercentAtOpen ?? currentGstPercent,
          base.discountPaise
        );

        return {
          ...base,
          items: newItems,
          status: "OCCUPIED",
          subtotalPaise,
          taxPaise,
          totalPaise,
          updatedAt: now,
          heldAt: base.heldAt ?? now,
          version: base.version + 1,
          syncStatus: "pending",
          // BUGFIX: items changed since the last KOT print — see addItem() above.
          kotFiredAt: null,
          kotAutoPlaced: false,
        };
      });
    },
    [persistAtomic, currentGstPercent]
  );

  const updateItemQty = useCallback(
    async (tableId: string, cartId: string, qty: number): Promise<void> => {
      await persistAtomic(tableId, (existing) => {
        if (!existing) return null;

        const newItems =
          qty <= 0
            ? existing.items.filter((i) => i.cartId !== cartId)
            : existing.items.map((i) => (i.cartId === cartId ? { ...i, qty } : i));

        const now = new Date().toISOString();
        const { subtotalPaise, taxPaise, totalPaise } = computeTotals(
          newItems,
          existing.gstPercentAtOpen ?? currentGstPercent,
          existing.discountPaise
        );
        const newStatus = newItems.length === 0 ? "AVAILABLE" : "OCCUPIED";

        return {
          ...existing,
          items: newItems,
          status: newStatus as TableOrder["status"],
          subtotalPaise,
          taxPaise,
          totalPaise,
          updatedAt: now,
          version: existing.version + 1,
          syncStatus: "pending",
          // BUGFIX: items changed since the last KOT print — see addItem() above.
          kotFiredAt: null,
          kotAutoPlaced: false,
        };
      });
    },
    [currentGstPercent, persistAtomic]
  );

  const removeItem = useCallback(
    async (tableId: string, cartId: string): Promise<void> => {
      await updateItemQty(tableId, cartId, 0);
      logAudit("TABLE_ITEM_REMOVED", uid, {
        entityType: "table",
        entityId: tableId,
        meta: { cartId },
      });
    },
    [updateItemQty, uid]
  );

  const setDiscount = useCallback(
    async (tableId: string, discountPaise: number): Promise<void> => {
      // INVARIANT: discount cannot be negative
      const safeDiscount = Math.max(0, discountPaise);
      await persistAtomic(tableId, (existing) => {
        if (!existing) return null;

        const now = new Date().toISOString();
        const { subtotalPaise, taxPaise, totalPaise } = computeTotals(
          existing.items,
          existing.gstPercentAtOpen ?? currentGstPercent,
          safeDiscount
        );

        return {
          ...existing,
          discountPaise: safeDiscount,
          subtotalPaise,
          taxPaise,
          totalPaise,
          updatedAt: now,
          version: existing.version + 1,
          syncStatus: "pending",
        };
      });

      logAudit("TABLE_DISCOUNT_SET", uid, {
        entityType: "table",
        entityId: tableId,
        meta: { discountPaise: safeDiscount },
      });
    },
    [currentGstPercent, persistAtomic, uid]
  );

  const holdOrder = useCallback(
    async (tableId: string): Promise<void> => {
      await persistAtomic(tableId, (existing) => {
        if (!existing || existing.items.length === 0) return null;
        const now = new Date().toISOString();
        return {
          ...existing,
          status: "OCCUPIED",
          heldAt: now,
          updatedAt: now,
          version: existing.version + 1,
          syncStatus: "pending",
        };
      });
    },
    [persistAtomic]
  );

  // Order/KOT: marks the CURRENT item set as sent to the kitchen. Called by
  // the "Print KOT" button (auto=false) and by the auto-placement timer
  // below (auto=true) after a held order sits past the configured interval.
  // Decoupled from holdOrder — Hold never implicitly fires a KOT, and
  // printing a KOT never implicitly holds — this is the H-Orders fix.
  const markKotFired = useCallback(
    async (tableId: string, auto: boolean = false): Promise<void> => {
      await persistAtomic(tableId, (existing) => {
        if (!existing || existing.items.length === 0) return null;
        const now = new Date().toISOString();
        return {
          ...existing,
          kotFiredAt: now,
          kotAutoPlaced: auto,
          updatedAt: now,
          version: existing.version + 1,
          syncStatus: "pending",
        };
      });

      logAudit(auto ? "TABLE_KOT_AUTO_PLACED" : "TABLE_KOT_PRINTED", uidRef.current, {
        entityType: "table",
        entityId: tableId,
      });
    },
    [persistAtomic]
  );

  // ── Auto-placement: held orders whose KOT hasn't been printed within the
  // configured interval get auto-fired. Configured via Settings → POS
  // Features → "Auto-place held orders after". 0/undefined = disabled.
  const autoPlaceMinutesRef = useRef(session?.stockSettings?.autoPlaceHeldOrderMinutes ?? 0);
  autoPlaceMinutesRef.current = session?.stockSettings?.autoPlaceHeldOrderMinutes ?? 0;

  useEffect(() => {
    if (!session?.businessId) return;
    const interval = setInterval(() => {
      const minutes = autoPlaceMinutesRef.current;
      if (!minutes || minutes <= 0) return;
      const now = Date.now();
      for (const order of Object.values(stateRef.current.orders)) {
        if (
          order.status === "OCCUPIED" &&
          order.items.length > 0 &&
          order.heldAt &&
          !order.kotFiredAt &&
          now - new Date(order.heldAt).getTime() >= minutes * 60_000
        ) {
          markKotFired(order.tableId, true).catch(() => {});
        }
      }
    }, 20_000);
    return () => clearInterval(interval);
  }, [session?.businessId, markKotFired]);

  // FIX C-01: clearOrder now syncs the deletion to Supabase
  const clearOrder = useCallback(
    async (tableId: string): Promise<void> => {
      const id = tableOrderId(tableId);
      const existing = stateRef.current.orders[id];
      if (!existing) return;

      // Mark as AVAILABLE with 0 items — syncTableOrder will delete the remote row
      const cleared: TableOrder = {
        ...existing,
        status: "AVAILABLE",
        items: [],
        subtotalPaise: 0,
        taxPaise: 0,
        discountPaise: 0,
        totalPaise: 0,
        heldAt: null,
        kotFiredAt: null,
        kotAutoPlaced: false,
        updatedAt: new Date().toISOString(),
        version: existing.version + 1,
        syncStatus: "pending",
      };

      dispatch({ type: "DELETE", id });
      const { dbDeleteTableOrder } = await import("@/lib/db");
      await dbDeleteTableOrder(id, uidRef.current);

      // Sync deletion to Supabase (fire-and-forget but tracked)
      import("@/lib/supabase/tableSync")
        .then(({ syncTableOrder }) => syncTableOrder(cleared, uidRef.current))
        .catch(() => {});

      logAudit("TABLE_CLOSED", uidRef.current, {
        entityType: "table",
        entityId: tableId,
        meta: { tableId, clearedVersion: cleared.version },
      });
    },
    []
  );

  return (
    <TableStoreContext.Provider
      value={{
        state,
        getOrCreateOrder,
        addItem,
        addCartItems,
        updateItemQty,
        removeItem,
        setDiscount,
        holdOrder,
        markKotFired,
        clearOrder,
        getTableOrder,
      }}
    >
      {children}
    </TableStoreContext.Provider>
  );
}

export function useTableStore(): TableStoreContextValue {
  const ctx = useContext(TableStoreContext);
  if (!ctx) throw new Error("useTableStore must be inside TableStoreProvider");
  return ctx;
}

export function useTableOrder(tableId: string): TableOrder | null {
  const { state } = useTableStore();
  return state.orders[tableOrderId(tableId)] ?? null;
}

export function useAllTableOrders(): TableOrder[] {
  const { state } = useTableStore();
  return Object.values(state.orders);
}
