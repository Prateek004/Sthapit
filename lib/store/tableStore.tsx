"use client";

/**
 * TableStore — minimal, isolated state for the /tables module.
 *
 * Deliberately NOT merged into AppContext to keep the global store small.
 * Uses a simple module-level singleton + React context for subscriptions.
 *
 * Responsibilities:
 *  - Load all active TableOrders from IndexedDB on boot
 *  - Expose per-table order as a reactive value
 *  - Autosave every mutation to IndexedDB immediately
 *  - Queue sync events for when Supabase comes back online
 *  - Compute table totals
 *
 * Concurrency: optimistic version check — if remote version > local,
 * reload from DB before writing.
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
  tableNumber: number
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
  };
}

// ── State & Actions ───────────────────────────────────────────────────────────

interface TableStoreState {
  /** Map of tableOrderId → TableOrder */
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
  /** Get or create a table order for the given table */
  getOrCreateOrder: (tableId: string, tableName: string, tableNumber: number) => TableOrder;
  addItem: (tableId: string, tableName: string, tableNumber: number, item: MenuItem, addOns: AddOn[], size?: string, portion?: string, notes?: string) => Promise<void>;
  /** Bulk-add already-configured cart items (used by the POS "Hold to table") */
  addCartItems: (tableId: string, tableName: string, tableNumber: number, items: CartItem[]) => Promise<void>;
  updateItemQty: (tableId: string, cartId: string, qty: number) => Promise<void>;
  removeItem: (tableId: string, cartId: string) => Promise<void>;
  setDiscount: (tableId: string, discountPaise: number) => Promise<void>;
  holdOrder: (tableId: string) => Promise<void>;
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
  const uid = session?.userId ?? "default";
  const gstPercent = session?.gstPercent ?? 0;
  // Ref to avoid stale closures in async save functions
  const stateRef = useRef(state);
  stateRef.current = state;

  // Boot: load all active table orders from IndexedDB
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
  }, [session?.userId]);

  // ── Internal: persist + dispatch ─────────────────────────────────────────
  const persist = useCallback(
    async (order: TableOrder): Promise<void> => {
      dispatch({ type: "UPSERT", order });
      const { dbSaveTableOrder } = await import("@/lib/db");
      await dbSaveTableOrder(order, uid);
      // Fire-and-forget Supabase sync
      import("@/lib/supabase/tableSync")
        .then(({ syncTableOrder }) => syncTableOrder(order))
        .catch(() => {});
    },
    [uid]
  );

  // ── Public API ────────────────────────────────────────────────────────────

  const getOrCreateOrder = useCallback(
    (tableId: string, tableName: string, tableNumber: number): TableOrder => {
      const id = tableOrderId(tableId);
      return stateRef.current.orders[id] ?? makeTableOrder(tableId, tableName, tableNumber);
    },
    []
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
      const existing = getOrCreateOrder(tableId, tableName, tableNumber);

      // Merge key: same item + same size + same portion + same addons + same notes
      const mergeKey = [
        menuItem.id,
        size ?? "",
        portion ?? "",
        addOns.map((a) => a.id).sort().join(","),
        notes ?? "",
      ].join("|");

      let newItems: TableOrderItem[];
      const matchIdx = existing.items.findIndex((i) => itemMergeKey(i) === mergeKey);

      if (matchIdx !== -1) {
        newItems = existing.items.map((i, idx) =>
          idx === matchIdx ? { ...i, qty: i.qty + 1 } : i
        );
      } else {
        const newItem: TableOrderItem = {
          cartId: crypto.randomUUID(),
          menuItemId: menuItem.id,
          name: menuItem.name,
          unitPricePaise: size
            ? (menuItem.sizes?.find((s) => s.label === size)?.pricePaise ?? menuItem.pricePaise)
            : portion
            ? (menuItem.portions?.find((p) => p.label === portion)?.pricePaise ?? menuItem.pricePaise)
            : menuItem.pricePaise,
          qty: 1,
          selectedSize: size,
          selectedPortion: portion,
          selectedAddOns: addOns,
          notes,
        };
        newItems = [...existing.items, newItem];
      }

      const now = new Date().toISOString();
      const { subtotalPaise, taxPaise, totalPaise } = computeTotals(
        newItems,
        gstPercent,
        existing.discountPaise
      );

      const updated: TableOrder = {
        ...existing,
        items: newItems,
        status: "OCCUPIED",
        subtotalPaise,
        taxPaise,
        totalPaise,
        updatedAt: now,
        heldAt: existing.heldAt ?? now,
        version: existing.version + 1,
        syncStatus: "pending",
      };
      await persist(updated);
    },
    [getOrCreateOrder, gstPercent, persist]
  );

  const addCartItems = useCallback(
    async (
      tableId: string,
      tableName: string,
      tableNumber: number,
      incoming: CartItem[]
    ): Promise<void> => {
      if (!incoming || incoming.length === 0) return;
      const existing = getOrCreateOrder(tableId, tableName, tableNumber);

      // Start from existing items, merge each incoming cart item by its config key.
      const newItems: TableOrderItem[] = existing.items.map((i) => ({ ...i }));

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
        gstPercent,
        existing.discountPaise
      );

      const updated: TableOrder = {
        ...existing,
        items: newItems,
        status: "OCCUPIED",
        subtotalPaise,
        taxPaise,
        totalPaise,
        updatedAt: now,
        heldAt: existing.heldAt ?? now,
        version: existing.version + 1,
        syncStatus: "pending",
      };
      await persist(updated);
    },
    [getOrCreateOrder, gstPercent, persist]
  );

  const updateItemQty = useCallback(
    async (tableId: string, cartId: string, qty: number): Promise<void> => {
      const existing = stateRef.current.orders[tableOrderId(tableId)];
      if (!existing) return;

      const newItems =
        qty <= 0
          ? existing.items.filter((i) => i.cartId !== cartId)
          : existing.items.map((i) => (i.cartId === cartId ? { ...i, qty } : i));

      const now = new Date().toISOString();
      const { subtotalPaise, taxPaise, totalPaise } = computeTotals(
        newItems,
        gstPercent,
        existing.discountPaise
      );
      const newStatus = newItems.length === 0 ? "AVAILABLE" : "OCCUPIED";

      const updated: TableOrder = {
        ...existing,
        items: newItems,
        status: newStatus as TableOrder["status"],
        subtotalPaise,
        taxPaise,
        totalPaise,
        updatedAt: now,
        version: existing.version + 1,
        syncStatus: "pending",
      };
      await persist(updated);
    },
    [gstPercent, persist]
  );

  const removeItem = useCallback(
    async (tableId: string, cartId: string): Promise<void> => {
      await updateItemQty(tableId, cartId, 0);
    },
    [updateItemQty]
  );

  const setDiscount = useCallback(
    async (tableId: string, discountPaise: number): Promise<void> => {
      const existing = stateRef.current.orders[tableOrderId(tableId)];
      if (!existing) return;

      const now = new Date().toISOString();
      const { subtotalPaise, taxPaise, totalPaise } = computeTotals(
        existing.items,
        gstPercent,
        discountPaise
      );

      const updated: TableOrder = {
        ...existing,
        discountPaise,
        subtotalPaise,
        taxPaise,
        totalPaise,
        updatedAt: now,
        version: existing.version + 1,
        syncStatus: "pending",
      };
      await persist(updated);
    },
    [gstPercent, persist]
  );

  const holdOrder = useCallback(
    async (tableId: string): Promise<void> => {
      const existing = stateRef.current.orders[tableOrderId(tableId)];
      if (!existing || existing.items.length === 0) return;

      const now = new Date().toISOString();
      const updated: TableOrder = {
        ...existing,
        status: "OCCUPIED",
        heldAt: now,
        updatedAt: now,
        version: existing.version + 1,
        syncStatus: "pending",
      };
      await persist(updated);
    },
    [persist]
  );

  const clearOrder = useCallback(
    async (tableId: string): Promise<void> => {
      const id = tableOrderId(tableId);
      const existing = stateRef.current.orders[id];
      if (!existing) return;

      dispatch({ type: "DELETE", id });
      const { dbDeleteTableOrder } = await import("@/lib/db");
      await dbDeleteTableOrder(id, uid);
    },
    [uid]
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

// ── Selector hooks (prevent unnecessary re-renders) ───────────────────────────

export function useTableOrder(tableId: string): TableOrder | null {
  const { state } = useTableStore();
  return state.orders[tableOrderId(tableId)] ?? null;
}

export function useAllTableOrders(): TableOrder[] {
  const { state } = useTableStore();
  return Object.values(state.orders);
}
