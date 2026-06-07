"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import type {
  MenuItem,
  MenuCategory,
  CartItem,
  Order,
  UserSession,
  ServiceMode,
  OpenTable,
} from "@/lib/types";
import { calcDiscount, calcGST, generateBillNumber, canPerform } from "@/lib/utils";
import { debounceAsync } from "@/lib/utils/mutex";
import { MENU_TEMPLATES } from "@/lib/utils/menuTemplates";
import { getSupabase, isSupabaseEnabled } from "@/lib/supabase/client";
import { TableStoreProvider } from "@/lib/store/tableStore";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface AppState {
  session: UserSession | null;
  menuItems: MenuItem[];
  categories: MenuCategory[];
  cart: CartItem[];
  serviceMode: ServiceMode;
  tableNumber: number | undefined;
  orders: Order[];
  openTables: OpenTable[];
  isLoading: boolean;
  toasts: Toast[];
  activeStockTab: string;
  posActiveCat: string;
  ordersFilter: "today" | "all";
  ordersTab: "orders" | "tables";
  ordersTableView: "map" | "list";
  pendingSyncCount: number;
  isOnline: boolean;
  migrationFailed: boolean;
  isLocked: boolean;
}

const initialState: AppState = {
  session: null,
  menuItems: [],
  categories: [],
  cart: [],
  serviceMode: "dine_in",
  tableNumber: undefined,
  orders: [],
  openTables: [],
  isLoading: true,
  toasts: [],
  activeStockTab: "menu",
  posActiveCat: "all",
  ordersFilter: "today",
  ordersTab: "orders",
  ordersTableView: "map",
  pendingSyncCount: 0,
  isOnline: true,
  migrationFailed: false,
  isLocked: false,
};

const SESSION_KEY = "sth1r_session";
const CART_KEY    = "sth1r_cart";
const UI_KEY      = "sth1r_ui";

function migrateLocalStorageKeys(): void {
  try {
    const oldKeys: Record<string, string> = {
      vynn_session: SESSION_KEY,
      vynn_cart:    CART_KEY,
      vynn_ui:      UI_KEY,
    };
    for (const [oldKey, newKey] of Object.entries(oldKeys)) {
      if (localStorage.getItem(newKey)) continue;
      const val = localStorage.getItem(oldKey);
      if (val) {
        localStorage.setItem(newKey, val);
        localStorage.removeItem(oldKey);
      }
    }
  } catch {}
}

function saveSession(s: UserSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

function loadSession(): UserSession | null {
  try {
    migrateLocalStorageKeys();
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed.userId || !parsed.username) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

// P0-01: localStorage as fast-read cache only — IDB is source of truth
function saveCart(cart: CartItem[]): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {}
}

function loadCartFromLocalStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

// UIState: only non-session-specific preferences that survive logout.
// tableNumber is deliberately excluded — it is session-specific and must reset
// on every login/logout so a shared device does not expose a prior user's table.
interface UIState {
  activeStockTab: string;
  posActiveCat: string;
  ordersFilter: "today" | "all";
  ordersTab: "orders" | "tables";
  ordersTableView: "map" | "list";
}

function saveUI(ui: UIState): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {}
}

function loadUI(): UIState {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return { activeStockTab: "menu", posActiveCat: "all", ordersFilter: "today", ordersTab: "orders", ordersTableView: "map" };
    const parsed = JSON.parse(raw) as Partial<UIState>;
    return {
      activeStockTab: parsed.activeStockTab ?? "menu",
      posActiveCat: parsed.posActiveCat ?? "all",
      ordersFilter: parsed.ordersFilter ?? "today",
      ordersTab: parsed.ordersTab ?? "orders",
      ordersTableView: parsed.ordersTableView ?? "map",
    };
  } catch {
    return { activeStockTab: "menu", posActiveCat: "all", ordersFilter: "today", ordersTab: "orders", ordersTableView: "map" };
  }
}

async function syncSessionToSupabase(session: UserSession): Promise<void> {
  if (!isSupabaseEnabled()) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb
      .from("profiles")
      .update({ gst_percent: session.gstPercent, upi_id: session.upiId ?? null })
      .eq("id", user.id);
  } catch {}
}

async function restoreSessionFromSupabase(session: UserSession): Promise<UserSession> {
  if (!isSupabaseEnabled()) return session;
  try {
    const sb = getSupabase();
    if (!sb) return session;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return session;
    const { data: profile } = await sb
      .from("profiles")
      .select("gst_percent, upi_id, stock_settings")
      .eq("id", user.id)
      .single();
    if (!profile) return session;
    return {
      ...session,
      gstPercent: profile.gst_percent ?? session.gstPercent,
      upiId: profile.upi_id ?? session.upiId,
      ...(profile.stock_settings
        ? { stockSettings: profile.stock_settings as import("@/lib/types").StockSettings }
        : {}),
    };
  } catch {
    return session;
  }
}

async function syncOpenTablesFromSupabase(uid: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data: remoteTables, error } = await sb
      .from("open_tables")
      .select("*")
      .eq("user_id", user.id);
    if (error || !remoteTables?.length) return;
    const db = await import("@/lib/db");
    const localTables = await db.dbGetAllOpenTables(uid);
    const localMap = new Map(localTables.map((t) => [t.id, t]));
    for (const remote of remoteTables) {
      if (!localMap.has(remote.id)) {
        const tab: OpenTable = {
          id: remote.id,
          tableNumber: remote.table_number,
          items: remote.items ?? [],
          openedAt: remote.opened_at,
          updatedAt: remote.updated_at,
        };
        await db.dbSaveOpenTable(tab, uid);
      }
    }
  } catch {}
}

type Action =
  | {
      type: "INIT_DONE";
      session: UserSession | null;
      items: MenuItem[];
      categories: MenuCategory[];
      orders: Order[];
      openTables: OpenTable[];
      cart: CartItem[];
      activeStockTab: string;
      posActiveCat: string;
      ordersFilter: "today" | "all";
      ordersTab: "orders" | "tables";
      ordersTableView: "map" | "list";
    }
  | { type: "SET_SESSION"; payload: UserSession | null }
  | { type: "SET_MENU"; items: MenuItem[]; categories: MenuCategory[] }
  | { type: "SET_SERVICE_MODE"; mode: ServiceMode }
  | { type: "SET_TABLE"; tableNumber: number | undefined }
  | { type: "CART_ADD"; payload: CartItem }
  | { type: "CART_QTY"; cartId: string; qty: number }
  | { type: "CART_REMOVE"; cartId: string }
  | { type: "CART_CLEAR" }
  | { type: "ORDER_ADD"; payload: Order }
  | { type: "MENU_ITEM_UPSERT"; payload: MenuItem }
  | { type: "MENU_ITEM_DELETE"; id: string }
  | { type: "CATEGORY_UPSERT"; payload: MenuCategory }
  | { type: "CATEGORY_DELETE"; id: string }
  | { type: "TOAST_ADD"; payload: Toast }
  | { type: "TOAST_REMOVE"; id: string }
  | { type: "OPEN_TABLE_UPSERT"; payload: OpenTable }
  | { type: "OPEN_TABLE_REMOVE"; id: string }
  | { type: "SET_ACTIVE_STOCK_TAB"; tab: string }
  | { type: "SET_POS_ACTIVE_CAT"; cat: string }
  | { type: "SET_ORDERS_FILTER"; filter: "today" | "all" }
  | { type: "SET_ORDERS_TAB"; tab: "orders" | "tables" }
  | { type: "SET_ORDERS_TABLE_VIEW"; view: "map" | "list" }
  | { type: "SET_SYNC_STATUS"; pendingCount: number; isOnline: boolean }
  | { type: "SET_MIGRATION_FAILED"; failed: boolean }
  | { type: "SET_LOCKED"; locked: boolean }
  | { type: "ORDER_VOID"; id: string; voidedAt: string; voidReason: string }
  | { type: "LOGOUT" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "INIT_DONE":
      return {
        ...state,
        session: action.session,
        menuItems: action.items,
        categories: action.categories,
        orders: action.orders,
        openTables: action.openTables,
        cart: action.cart,
        // serviceMode and tableNumber NOT restored — session-specific, must reset
        // on every login to prevent shared-device state leakage.
        serviceMode: "dine_in",
        tableNumber: undefined,
        activeStockTab: action.activeStockTab,
        posActiveCat: action.posActiveCat,
        ordersFilter: action.ordersFilter,
        ordersTab: action.ordersTab,
        ordersTableView: action.ordersTableView,
        isLoading: false,
      };
    case "SET_SESSION":
      return { ...state, session: action.payload };
    case "SET_MENU":
      return { ...state, menuItems: action.items, categories: action.categories };
    case "SET_SERVICE_MODE":
      return { ...state, serviceMode: action.mode };
    case "SET_TABLE":
      return { ...state, tableNumber: action.tableNumber };
    case "SET_ACTIVE_STOCK_TAB":
      return { ...state, activeStockTab: action.tab };
    case "SET_POS_ACTIVE_CAT":
      return { ...state, posActiveCat: action.cat };
    case "SET_ORDERS_FILTER":
      return { ...state, ordersFilter: action.filter };
    case "SET_ORDERS_TAB":
      return { ...state, ordersTab: action.tab };
    case "SET_ORDERS_TABLE_VIEW":
      return { ...state, ordersTableView: action.view };
    case "SET_SYNC_STATUS":
      return { ...state, pendingSyncCount: action.pendingCount, isOnline: action.isOnline };
    case "SET_MIGRATION_FAILED":
      return { ...state, migrationFailed: action.failed };
    case "SET_LOCKED":
      return { ...state, isLocked: action.locked };
    case "ORDER_VOID":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.id
            ? {
                ...o,
                status: "voided" as const,
                voidedAt: action.voidedAt,
                voidReason: action.voidReason,
                syncStatus: "pending" as const,
              }
            : o
        ),
      };
    case "CART_ADD": {
      const inc = action.payload;
      const key = [
        inc.menuItemId,
        inc.selectedSize ?? "",
        inc.selectedPortion ?? "",
        inc.selectedAddOns.map((a) => a.id).sort().join(","),
        inc.notes ?? "",
      ].join("|");
      const idx = state.cart.findIndex(
        (c) =>
          [
            c.menuItemId,
            c.selectedSize ?? "",
            c.selectedPortion ?? "",
            c.selectedAddOns.map((a) => a.id).sort().join(","),
            c.notes ?? "",
          ].join("|") === key
      );
      if (idx !== -1) {
        return {
          ...state,
          cart: state.cart.map((c, i) =>
            i === idx ? { ...c, qty: c.qty + inc.qty } : c
          ),
        };
      }
      return { ...state, cart: [...state.cart, inc] };
    }
    case "CART_QTY":
      return {
        ...state,
        cart:
          action.qty <= 0
            ? state.cart.filter((i) => i.cartId !== action.cartId)
            : state.cart.map((i) =>
                i.cartId === action.cartId ? { ...i, qty: action.qty } : i
              ),
      };
    case "CART_REMOVE":
      return { ...state, cart: state.cart.filter((i) => i.cartId !== action.cartId) };
    case "CART_CLEAR":
      return { ...state, cart: [] };
    case "ORDER_ADD":
      // Deduplicate: if an order with this id already exists, don't add it again.
      // Prevents double-counting when notifyOrderPlaced is called after placeOrder.
      if (state.orders.some((o) => o.id === action.payload.id)) return state;
      return { ...state, orders: [action.payload, ...state.orders] };
    case "MENU_ITEM_UPSERT":
      return {
        ...state,
        menuItems: state.menuItems.some((i) => i.id === action.payload.id)
          ? state.menuItems.map((i) => (i.id === action.payload.id ? action.payload : i))
          : [...state.menuItems, action.payload],
      };
    case "MENU_ITEM_DELETE":
      return { ...state, menuItems: state.menuItems.filter((i) => i.id !== action.id) };
    case "CATEGORY_UPSERT":
      return {
        ...state,
        categories: state.categories.some((c) => c.id === action.payload.id)
          ? state.categories.map((c) => (c.id === action.payload.id ? action.payload : c))
          : [...state.categories, action.payload],
      };
    case "CATEGORY_DELETE":
      return { ...state, categories: state.categories.filter((c) => c.id !== action.id) };
    case "TOAST_ADD":
      return { ...state, toasts: [...state.toasts, action.payload] };
    case "TOAST_REMOVE":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "OPEN_TABLE_UPSERT":
      return {
        ...state,
        openTables: state.openTables.some((t) => t.id === action.payload.id)
          ? state.openTables.map((t) => (t.id === action.payload.id ? action.payload : t))
          : [...state.openTables, action.payload],
      };
    case "OPEN_TABLE_REMOVE":
      return { ...state, openTables: state.openTables.filter((t) => t.id !== action.id) };
    case "LOGOUT":
      return { ...initialState, isLoading: false, toasts: state.toasts };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  setSession: (s: UserSession | null) => void;
  login: (session: UserSession) => Promise<void>;
  logout: () => Promise<void>;
  setServiceMode: (m: ServiceMode) => void;
  setTableNumber: (n: number | undefined) => void;
  loadMenuFromTemplate: (businessType: string, userId: string) => Promise<void>;
  addToCart: (item: CartItem) => void;
  updateCartQty: (cartId: string, qty: number) => void;
  removeFromCart: (cartId: string) => void;
  clearCart: () => void;
  placeOrder: (params: {
    paymentMethod: Order["paymentMethod"];
    discountType: "flat" | "percent";
    discountValue: number;
    cashReceivedPaise?: number;
    splitPayment?: { cashPaise: number; upiPaise: number };
  }) => Promise<Order>;
  holdToTable: (tableNumber: number) => Promise<OpenTable>;
  upsertMenuItem: (item: MenuItem) => Promise<void>;
  deleteMenuItem: (id: string) => Promise<void>;
  upsertCategory: (cat: MenuCategory) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  showToast: (message: string, type?: Toast["type"]) => void;
  openTableAddItems: (tableNumber: number, items: CartItem[]) => Promise<OpenTable>;
  closeTable: (
    tableId: string,
    params: {
      paymentMethod: Order["paymentMethod"];
      discountType: "flat" | "percent";
      discountValue: number;
      cashReceivedPaise?: number;
      splitPayment?: { cashPaise: number; upiPaise: number };
    }
  ) => Promise<Order>;
  setActiveStockTab: (tab: string) => void;
  setPosActiveCat: (cat: string) => void;
  setOrdersFilter: (filter: "today" | "all") => void;
  setOrdersTab: (tab: "orders" | "tables") => void;
  setOrdersTableView: (view: "map" | "list") => void;
  voidOrder: (id: string, reason?: string) => Promise<void>;
  unlockSession: () => void;
  /** Notify AppContext that an order was placed from an external path (e.g. table checkout).
   * Dispatches ORDER_ADD so dashboard/orders page updates without full reload. */
  notifyOrderPlaced: (order: Order) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

async function loadUserData(uid: string) {
  const db = await import("@/lib/db");
  const [items, categories, orders, openTables] = await Promise.all([
    db.dbGetAllMenuItems(uid),
    db.dbGetAllCategories(uid),
    db.dbGetAllOrders(uid),
    db.dbGetAllOpenTables(uid),
  ]);
  return { items, categories, orders, openTables };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INACTIVITY_MS = 15 * 60 * 1000; // P1-02: 15 min

  // ── FIX C-03: In-flight guards prevent double-submit ───────────────────────
  const placeOrderInFlight = useRef(false);
  const closeTableInFlight = useRef<Set<string>>(new Set());

  // ── FIX H-05: Debounced IDB cart write — prevent write storms ─────────────
  // Created once per session; ref holds the debounced function.
  const debouncedCartSave = useRef<((cart: CartItem[], uid: string) => void) | null>(null);

  // P1-02: Reset inactivity timer on any user interaction
  const resetInactivityTimer = useCallback(() => {
    if (!state.session) return;
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      dispatch({ type: "SET_LOCKED", locked: true });
    }, INACTIVITY_MS);
  }, [state.session]);

  useEffect(() => {
    if (!state.session || state.isLoading) return;
    const events = ["click", "keydown", "touchstart", "mousemove"];
    events.forEach((e) => window.addEventListener(e, resetInactivityTimer, { passive: true }));
    resetInactivityTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetInactivityTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [state.session, state.isLoading, resetInactivityTimer]);

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const session = loadSession();
        const ui = loadUI();

        // P0-11: surface migration failures
        const { getMigrationStatus } = await import("@/lib/db");
        const migStatus = getMigrationStatus();
        if (migStatus === "failed") {
          dispatch({ type: "SET_MIGRATION_FAILED", failed: true });
        }

        if (!session) {
          dispatch({
            type: "INIT_DONE",
            session: null,
            items: [], categories: [], orders: [], openTables: [],
            cart: [],
            activeStockTab: ui.activeStockTab,
            posActiveCat: ui.posActiveCat,
            ordersFilter: ui.ordersFilter,
            ordersTab: ui.ordersTab,
            ordersTableView: ui.ordersTableView,
          });
          return;
        }

        // P0-01: load cart from IDB first, fall back to localStorage cache
        const { dbLoadCart } = await import("@/lib/db");
        const idbCart = await dbLoadCart(session.userId);
        const cart = idbCart.length > 0 ? idbCart : loadCartFromLocalStorage();

        const { items, categories, orders, openTables } = await loadUserData(session.userId);

        dispatch({
          type: "INIT_DONE",
          session, items, categories, orders, openTables, cart,
          activeStockTab: ui.activeStockTab,
          posActiveCat: ui.posActiveCat,
          ordersFilter: ui.ordersFilter,
          ordersTab: ui.ordersTab,
          ordersTableView: ui.ordersTableView,
        });

        // P0-03: restore menu from Supabase if IDB is empty (device wipe scenario)
        if (items.length === 0) {
          import("@/lib/supabase/sync")
            .then(({ restoreMenuFromSupabase }) => restoreMenuFromSupabase(session.userId))
            .catch(() => {});
        }

        // P0-04: start sync listeners (reconnect + 60s interval)
        import("@/lib/supabase/sync")
          .then(({ backgroundSync, startSyncListeners, subscribeSyncStatus }) => {
            backgroundSync(session.userId);
            startSyncListeners(session.userId);
            subscribeSyncStatus(() => {
              import("@/lib/supabase/sync").then(({ getSyncStatus }) => {
                const { pendingCount, isOnline } = getSyncStatus();
                dispatch({ type: "SET_SYNC_STATUS", pendingCount, isOnline });
              });
            });
          })
          .catch(() => {});

        import("@/lib/supabase/tableSync")
          .then(({ restoreTableOrdersFromSupabase }) =>
            restoreTableOrdersFromSupabase(session.userId)
          )
          .catch(() => {});

        // P0-03: sync menu to Supabase
        import("@/lib/supabase/sync")
          .then(({ syncMenu }) => syncMenu(session.userId))
          .catch(() => {});

      } catch {
        dispatch({
          type: "INIT_DONE",
          session: null,
          items: [], categories: [], orders: [], openTables: [],
          cart: [],
          activeStockTab: "menu",
          posActiveCat: "all",
          ordersFilter: "today",
          ordersTab: "orders",
          ordersTableView: "map",
        });
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── FIX H-05: Persist cart to IDB (debounced 300ms) + localStorage immediately ──
  useEffect(() => {
    if (state.isLoading || !state.session) return;
    const uid = state.session.userId;

    // localStorage: immediate (fast read on next boot)
    saveCart(state.cart);

    // IDB: debounced — collapses rapid cart mutations into one write
    if (!debouncedCartSave.current) {
      debouncedCartSave.current = (() => {
        let latestCart: CartItem[] = [];
        let latestUid: string = "";
        const flush = debounceAsync(async () => {
          const { dbSaveCart } = await import("@/lib/db");
          await dbSaveCart(latestCart, latestUid);
        }, 300);
        return (cart: CartItem[], uid: string) => {
          latestCart = cart;
          latestUid = uid;
          flush();
        };
      })();
    }
    debouncedCartSave.current(state.cart, uid);
  }, [state.cart, state.session, state.isLoading]);

  useEffect(() => {
    if (!state.isLoading)
      saveUI({
        activeStockTab: state.activeStockTab,
        posActiveCat: state.posActiveCat,
        ordersFilter: state.ordersFilter,
        ordersTab: state.ordersTab,
        ordersTableView: state.ordersTableView,
      });
  }, [state.activeStockTab, state.posActiveCat, state.ordersFilter, state.ordersTab, state.ordersTableView, state.isLoading]);

  useEffect(() => {
    if (!state.isLoading) saveSession(state.session);
  }, [state.session, state.isLoading]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (session: UserSession) => {
    saveSession(session);
    // Reset debounced cart writer for new session
    debouncedCartSave.current = null;
    try {
      const ui = loadUI();
      const { dbLoadCart } = await import("@/lib/db");
      const idbCart = await dbLoadCart(session.userId);
      const cart = idbCart.length > 0 ? idbCart : loadCartFromLocalStorage();
      const { items, categories, orders, openTables } = await loadUserData(session.userId);
      await syncOpenTablesFromSupabase(session.userId).catch(() => {});
      const restoredSession = await restoreSessionFromSupabase(session);
      dispatch({
        type: "INIT_DONE",
        session: restoredSession, items, categories, orders, openTables, cart,
        activeStockTab: ui.activeStockTab,
        posActiveCat: ui.posActiveCat,
        ordersFilter: ui.ordersFilter,
        ordersTab: ui.ordersTab,
        ordersTableView: ui.ordersTableView,
      });
      saveSession(restoredSession);

      if (items.length === 0) {
        import("@/lib/supabase/sync")
          .then(({ restoreMenuFromSupabase }) => restoreMenuFromSupabase(restoredSession.userId))
          .catch(() => {});
      }

      import("@/lib/supabase/sync")
        .then(({ backgroundSync, startSyncListeners, subscribeSyncStatus, syncMenu }) => {
          backgroundSync(restoredSession.userId);
          startSyncListeners(restoredSession.userId);
          syncMenu(restoredSession.userId);
          subscribeSyncStatus(() => {
            import("@/lib/supabase/sync").then(({ getSyncStatus }) => {
              const { pendingCount, isOnline } = getSyncStatus();
              dispatch({ type: "SET_SYNC_STATUS", pendingCount, isOnline });
            });
          });
        })
        .catch(() => {});

      import("@/lib/supabase/tableSync")
        .then(({ restoreTableOrdersFromSupabase }) =>
          restoreTableOrdersFromSupabase(restoredSession.userId)
        )
        .catch(() => {});

      // Audit login
      import("@/lib/utils/auditLog")
        .then(({ logAudit }) => logAudit("LOGIN", restoredSession.userId, { username: restoredSession.username }))
        .catch(() => {});

    } catch {
      dispatch({
        type: "INIT_DONE",
        session,
        items: [], categories: [], orders: [], openTables: [],
        cart: [],
        activeStockTab: "menu",
        posActiveCat: "all",
        ordersFilter: "today",
        ordersTab: "orders",
        ordersTableView: "map",
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    // Read session BEFORE clearing storage
    const currentSession = (() => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as UserSession;
      } catch { return null; }
    })();

    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem(UI_KEY);
    } catch {}

    // P0-01: clear IDB cart on logout
    try {
      if (currentSession) {
        const { dbClearCart } = await import("@/lib/db");
        await dbClearCart(currentSession.userId);
      }
    } catch {}

    try {
      const { signOut } = await import("@/lib/supabase/auth");
      await signOut();
    } catch {}

    // Audit logout
    if (currentSession) {
      import("@/lib/utils/auditLog")
        .then(({ logAudit }) => logAudit("LOGOUT", currentSession.userId, { username: currentSession.username }))
        .catch(() => {});
    }

    // Reset in-flight guards
    placeOrderInFlight.current = false;
    closeTableInFlight.current.clear();
    debouncedCartSave.current = null;

    dispatch({ type: "LOGOUT" });
  }, []);

  const setSession = useCallback((s: UserSession | null) => {
    saveSession(s);
    dispatch({ type: "SET_SESSION", payload: s });
    if (s) syncSessionToSupabase(s).catch(() => {});
  }, []);

  const setServiceMode = useCallback(
    (mode: ServiceMode) => dispatch({ type: "SET_SERVICE_MODE", mode }),
    []
  );
  const setTableNumber = useCallback(
    (tableNumber: number | undefined) => dispatch({ type: "SET_TABLE", tableNumber }),
    []
  );
  const setActiveStockTab = useCallback(
    (tab: string) => dispatch({ type: "SET_ACTIVE_STOCK_TAB", tab }),
    []
  );
  const setPosActiveCat = useCallback(
    (cat: string) => dispatch({ type: "SET_POS_ACTIVE_CAT", cat }),
    []
  );
  const setOrdersFilter = useCallback(
    (filter: "today" | "all") => dispatch({ type: "SET_ORDERS_FILTER", filter }),
    []
  );
  const setOrdersTab = useCallback(
    (tab: "orders" | "tables") => dispatch({ type: "SET_ORDERS_TAB", tab }),
    []
  );
  const setOrdersTableView = useCallback(
    (view: "map" | "list") => dispatch({ type: "SET_ORDERS_TABLE_VIEW", view }),
    []
  );

  // P1-02: unlock after PIN entry
  const unlockSession = useCallback(() => {
    dispatch({ type: "SET_LOCKED", locked: false });
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const loadMenuFromTemplate = useCallback(
    async (businessType: string, userId: string) => {
      const db = await import("@/lib/db");
      const existing = await db.dbGetAllMenuItems(userId);
      if (existing.length > 0) return;
      const key = businessType as keyof typeof MENU_TEMPLATES;
      const template = MENU_TEMPLATES[key] ?? MENU_TEMPLATES["restaurant"];
      await db.dbBulkSaveCategories(template.categories, userId);
      await db.dbBulkSaveMenuItems(template.items, userId);
      dispatch({ type: "SET_MENU", items: template.items, categories: template.categories });
      import("@/lib/supabase/sync")
        .then(({ syncMenu }) => syncMenu(userId))
        .catch(() => {});
    },
    []
  );

  const addToCart = useCallback(
    (item: CartItem) => dispatch({ type: "CART_ADD", payload: item }),
    []
  );
  const updateCartQty = useCallback(
    (cartId: string, qty: number) => dispatch({ type: "CART_QTY", cartId, qty }),
    []
  );
  const removeFromCart = useCallback(
    (cartId: string) => dispatch({ type: "CART_REMOVE", cartId }),
    []
  );
  const clearCart = useCallback(() => dispatch({ type: "CART_CLEAR" }), []);

  // ── FIX C-03 + H-07: placeOrder with in-flight guard + invariant checks ──
  const placeOrder = useCallback(
    async (params: {
      paymentMethod: Order["paymentMethod"];
      discountType: "flat" | "percent";
      discountValue: number;
      cashReceivedPaise?: number;
      splitPayment?: { cashPaise: number; upiPaise: number };
    }): Promise<Order> => {
      // Prevent double-submit
      if (placeOrderInFlight.current) throw new Error("Order already being placed — please wait");
      placeOrderInFlight.current = true;

      try {
        const { paymentMethod, discountType, discountValue, cashReceivedPaise, splitPayment } = params;
        const snap = structuredClone(state.cart);
        if (snap.length === 0) throw new Error("Cart is empty");

        const subtotalPaise = snap.reduce(
          (s, i) =>
            s + (i.unitPricePaise + i.selectedAddOns.reduce((x, a) => x + a.pricePaise, 0)) * i.qty,
          0
        );
        const discountPaise = calcDiscount(subtotalPaise, discountType, discountValue);
        const afterDiscount = Math.max(0, subtotalPaise - discountPaise);
        const gstPercent = state.session?.gstPercent ?? 0;
        // P1-06: inclusive = extract GST from price, exclusive = add on top
        const gstInclusive = state.session?.stockSettings?.gstInclusive ?? false;
        const gstPaise = gstInclusive
          ? Math.round((afterDiscount * gstPercent) / (100 + gstPercent))
          : calcGST(afterDiscount, gstPercent);
        const totalPaise = gstInclusive ? afterDiscount : afterDiscount + gstPaise;

        // INVARIANT: non-negative total
        if (totalPaise < 0) throw new Error("Invariant violation: negative order total");

        const changePaise = cashReceivedPaise ? Math.max(0, cashReceivedPaise - totalPaise) : 0;

        // P0-02: Supabase atomic counter, fall back to local (device-suffixed)
        let billNumber = generateBillNumber();
        try {
          const { getNextBillCounterFromSupabase } = await import("@/lib/supabase/sync");
          const remote = await getNextBillCounterFromSupabase();
          if (remote !== null) billNumber = `#${String(remote).padStart(4, "0")}`;
        } catch {}

        const order: Order = {
          id: crypto.randomUUID(),
          billNumber,
          items: snap,
          serviceMode: state.serviceMode,
          tableNumber: state.tableNumber,
          subtotalPaise,
          discountPaise,
          discountType,
          discountValue,
          gstPercent,
          gstPaise,
          totalPaise,
          paymentMethod,
          splitPayment,
          cashReceivedPaise,
          changePaise,
          createdAt: new Date().toISOString(),
          syncStatus: "pending",
          status: "completed",
        };

        const uid = state.session?.userId ?? "default";
        const db = await import("@/lib/db");
        await db.dbSaveOrder(order, uid);
        dispatch({ type: "ORDER_ADD", payload: order });
        dispatch({ type: "CART_CLEAR" });

        // Audit
        import("@/lib/utils/auditLog")
          .then(({ logAudit }) =>
            logAudit("ORDER_PLACED", uid, {
              entityType: "order",
              entityId: order.id,
              meta: { billNumber, totalPaise, paymentMethod },
            })
          )
          .catch(() => {});

        import("@/lib/supabase/sync")
          .then(({ syncOrder }) => syncOrder(order))
          .catch(() => {});

        return order;
      } finally {
        placeOrderInFlight.current = false;
      }
    },
    [state.cart, state.session, state.serviceMode, state.tableNumber]
  );

  // ── FIX H-04: voidOrder reads from IDB (not stale state.orders snapshot) ──
  const voidOrder = useCallback(
    async (id: string, reason = "") => {
      if (!canPerform("voidOrder", state.session)) {
        throw new Error("Permission denied: only owners can void orders");
      }
      const uid = state.session?.userId ?? "default";

      // Read current state from IDB — source of truth, not state.orders
      const db = await import("@/lib/db");
      const allOrders = await db.dbGetAllOrders(uid);
      const target = allOrders.find((o) => o.id === id);
      if (!target) throw new Error("Order not found");
      if (target.status === "voided") throw new Error("Order already voided");

      const voidedAt = new Date().toISOString();
      await db.dbVoidOrder(id, uid, reason);
      dispatch({ type: "ORDER_VOID", id, voidedAt, voidReason: reason });

      // Audit
      import("@/lib/utils/auditLog")
        .then(({ logAudit }) =>
          logAudit("ORDER_VOIDED", uid, {
            entityType: "order",
            entityId: id,
            meta: { reason, billNumber: target.billNumber, totalPaise: target.totalPaise },
          })
        )
        .catch(() => {});

      // Sync voided record (built from IDB truth, not stale state snapshot)
      import("@/lib/supabase/sync")
        .then(({ syncOrder }) =>
          syncOrder({ ...target, status: "voided", voidedAt, voidReason: reason, syncStatus: "pending" })
        )
        .catch(() => {});
    },
    [state.session] // removed state.orders dependency — reads IDB directly
  );

  const holdToTable = useCallback(
    async (tableNumber: number): Promise<OpenTable> => {
      const snap = structuredClone(state.cart);
      if (snap.length === 0) throw new Error("Cart is empty");
      const uid = state.session?.userId ?? "default";
      const db = await import("@/lib/db");
      const ex = state.openTables.find((t) => t.tableNumber === tableNumber);
      const now = new Date().toISOString();
      const tab: OpenTable = ex
        ? { ...ex, items: [...ex.items, ...snap], updatedAt: now }
        : { id: crypto.randomUUID(), tableNumber, items: snap, openedAt: now, updatedAt: now };
      await db.dbSaveOpenTable(tab, uid);
      dispatch({ type: "OPEN_TABLE_UPSERT", payload: tab });
      dispatch({ type: "CART_CLEAR" });
      return tab;
    },
    [state.cart, state.openTables, state.session]
  );

  const openTableAddItems = useCallback(
    async (tableNumber: number, items: CartItem[]): Promise<OpenTable> => {
      const uid = state.session?.userId ?? "default";
      const db = await import("@/lib/db");
      const ex = state.openTables.find((t) => t.tableNumber === tableNumber);
      const now = new Date().toISOString();
      const tab: OpenTable = ex
        ? { ...ex, items: [...ex.items, ...items], updatedAt: now }
        : { id: crypto.randomUUID(), tableNumber, items, openedAt: now, updatedAt: now };
      await db.dbSaveOpenTable(tab, uid);
      dispatch({ type: "OPEN_TABLE_UPSERT", payload: tab });
      return tab;
    },
    [state.openTables, state.session]
  );

  // ── FIX C-03 + C-04: closeTable with guard + audit ────────────────────────
  const closeTable = useCallback(
    async (
      tableId: string,
      params: {
        paymentMethod: Order["paymentMethod"];
        discountType: "flat" | "percent";
        discountValue: number;
        cashReceivedPaise?: number;
        splitPayment?: { cashPaise: number; upiPaise: number };
      }
    ): Promise<Order> => {
      // Prevent double-submit per table
      if (closeTableInFlight.current.has(tableId)) {
        throw new Error("Table close already in progress — please wait");
      }
      closeTableInFlight.current.add(tableId);

      try {
        const tab = state.openTables.find((t) => t.id === tableId);
        if (!tab) throw new Error("Table not found");
        const { paymentMethod, discountType, discountValue, cashReceivedPaise, splitPayment } = params;
        const subtotalPaise = tab.items.reduce(
          (s, i) =>
            s + (i.unitPricePaise + i.selectedAddOns.reduce((x, a) => x + a.pricePaise, 0)) * i.qty,
          0
        );
        const discountPaise = calcDiscount(subtotalPaise, discountType, discountValue);
        const afterDiscount = Math.max(0, subtotalPaise - discountPaise);
        const gstPercent = state.session?.gstPercent ?? 0;
        const gstInclusive = state.session?.stockSettings?.gstInclusive ?? false;
        const gstPaise = gstInclusive
          ? Math.round((afterDiscount * gstPercent) / (100 + gstPercent))
          : calcGST(afterDiscount, gstPercent);
        const totalPaise = gstInclusive ? afterDiscount : afterDiscount + gstPaise;

        // INVARIANT: non-negative total
        if (totalPaise < 0) throw new Error("Invariant violation: negative order total");

        const changePaise = cashReceivedPaise ? Math.max(0, cashReceivedPaise - totalPaise) : 0;

        let billNumber = generateBillNumber();
        try {
          const { getNextBillCounterFromSupabase } = await import("@/lib/supabase/sync");
          const remote = await getNextBillCounterFromSupabase();
          if (remote !== null) billNumber = `#${String(remote).padStart(4, "0")}`;
        } catch {}

        const order: Order = {
          id: crypto.randomUUID(),
          billNumber,
          items: tab.items,
          serviceMode: "dine_in",
          tableNumber: tab.tableNumber,
          subtotalPaise, discountPaise, discountType, discountValue,
          gstPercent, gstPaise, totalPaise,
          paymentMethod, splitPayment, cashReceivedPaise, changePaise,
          createdAt: new Date().toISOString(),
          syncStatus: "pending",
          status: "completed",
        };

        const uid = state.session?.userId ?? "default";
        const db = await import("@/lib/db");
        await db.dbSaveOrder(order, uid);
        await db.dbDeleteOpenTable(tableId, uid);
        dispatch({ type: "ORDER_ADD", payload: order });
        dispatch({ type: "OPEN_TABLE_REMOVE", id: tableId });

        // Audit
        import("@/lib/utils/auditLog")
          .then(({ logAudit }) =>
            logAudit("TABLE_CLOSED", uid, {
              entityType: "table",
              entityId: tableId,
              meta: { billNumber, totalPaise, paymentMethod, tableNumber: tab.tableNumber },
            })
          )
          .catch(() => {});

        import("@/lib/supabase/sync")
          .then(({ syncOrder }) => syncOrder(order))
          .catch(() => {});

        return order;
      } finally {
        closeTableInFlight.current.delete(tableId);
      }
    },
    [state.openTables, state.session]
  );

  const upsertMenuItem = useCallback(
    async (item: MenuItem) => {
      if (!canPerform("manageMenu", state.session)) {
        throw new Error("Permission denied: only owners can manage menu items");
      }
      const uid = state.session?.userId ?? "default";
      const db = await import("@/lib/db");
      const itemWithTs = { ...item, updatedAt: new Date().toISOString() };
      await db.dbSaveMenuItem(itemWithTs, uid);
      dispatch({ type: "MENU_ITEM_UPSERT", payload: itemWithTs });

      // Audit
      import("@/lib/utils/auditLog")
        .then(({ logAudit }) =>
          logAudit(item.id ? "MENU_ITEM_UPDATED" : "MENU_ITEM_ADDED", uid, {
            entityType: "menu_item",
            entityId: item.id,
            meta: { name: item.name, pricePaise: item.pricePaise },
          })
        )
        .catch(() => {});

      import("@/lib/supabase/sync")
        .then(({ syncMenu }) => syncMenu(uid))
        .catch(() => {});
    },
    [state.session]
  );

  const deleteMenuItem = useCallback(
    async (id: string) => {
      if (!canPerform("manageMenu", state.session)) {
        throw new Error("Permission denied: only owners can manage menu items");
      }
      const uid = state.session?.userId ?? "default";
      const db = await import("@/lib/db");
      await db.dbDeleteMenuItem(id, uid);
      dispatch({ type: "MENU_ITEM_DELETE", id });

      // Audit
      import("@/lib/utils/auditLog")
        .then(({ logAudit }) =>
          logAudit("MENU_ITEM_DELETED", uid, { entityType: "menu_item", entityId: id })
        )
        .catch(() => {});

      import("@/lib/supabase/sync")
        .then(({ syncMenu }) => syncMenu(uid))
        .catch(() => {});
    },
    [state.session]
  );

  const upsertCategory = useCallback(
    async (cat: MenuCategory) => {
      if (!canPerform("manageMenu", state.session)) {
        throw new Error("Permission denied: only owners can manage categories");
      }
      const uid = state.session?.userId ?? "default";
      const db = await import("@/lib/db");
      const catWithTs = { ...cat, updatedAt: new Date().toISOString() };
      await db.dbSaveCategory(catWithTs, uid);
      dispatch({ type: "CATEGORY_UPSERT", payload: catWithTs });
      import("@/lib/supabase/sync")
        .then(({ syncMenu }) => syncMenu(uid))
        .catch(() => {});
    },
    [state.session]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!canPerform("manageMenu", state.session)) {
        throw new Error("Permission denied: only owners can manage categories");
      }
      const uid = state.session?.userId ?? "default";
      const db = await import("@/lib/db");
      await db.dbDeleteCategory(id, uid);
      dispatch({ type: "CATEGORY_DELETE", id });
      import("@/lib/supabase/sync")
        .then(({ syncMenu }) => syncMenu(uid))
        .catch(() => {});
    },
    [state.session]
  );

  const showToast = useCallback(
    (message: string, type: Toast["type"] = "success") => {
      const id = crypto.randomUUID();
      dispatch({ type: "TOAST_ADD", payload: { id, message, type } });
      setTimeout(() => dispatch({ type: "TOAST_REMOVE", id }), 3500);
    },
    []
  );

  const notifyOrderPlaced = useCallback(
    (order: Order) => {
      // ORDER_ADD reducer now deduplicates by id — safe to call even if already added
      dispatch({ type: "ORDER_ADD", payload: order });
    },
    []
  );

  return (
    <AppContext.Provider
      value={{
        state, setSession, login, logout,
        setServiceMode, setTableNumber,
        loadMenuFromTemplate,
        addToCart, updateCartQty, removeFromCart, clearCart,
        placeOrder, holdToTable,
        upsertMenuItem, deleteMenuItem,
        upsertCategory, deleteCategory,
        showToast,
        openTableAddItems, closeTable,
        setActiveStockTab,
        setPosActiveCat,
        setOrdersFilter,
        setOrdersTab,
        setOrdersTableView,
        voidOrder,
        unlockSession,
        notifyOrderPlaced,
      }}
    >
      <TableStoreProvider session={state.session}>
        {children}
      </TableStoreProvider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
