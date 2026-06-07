import { getSupabase, isSupabaseEnabled } from "./client";
import {
  dbGetPendingOrders,
  dbUpdateSyncStatus,
  dbGetAllMenuItems,
  dbGetAllCategories,
  dbBulkSaveMenuItems,
  dbBulkSaveCategories,
} from "@/lib/db";
import type { Order, MenuItem, MenuCategory } from "@/lib/types";
import { recordSyncFailure, recordSyncSuccess, setOfflineQueueSize } from "@/lib/utils/observability";

// ── P0-04: Sync status tracking ───────────────────────────────────────────────
let _pendingCount = 0;
let _isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
const _listeners = new Set<() => void>();

export function getSyncStatus() {
  return { pendingCount: _pendingCount, isOnline: _isOnline };
}
export function subscribeSyncStatus(fn: () => void) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
function notifySyncListeners() {
  _listeners.forEach((fn) => fn());
}
function setPending(n: number) {
  _pendingCount = n;
  setOfflineQueueSize(n);
  notifySyncListeners();
}
function setOnline(v: boolean) {
  _isOnline = v;
  notifySyncListeners();
}

// ── Exponential backoff retry ─────────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// ── P0-03: Menu sync ──────────────────────────────────────────────────────────
export async function syncMenu(uid: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const [items, categories] = await Promise.all([
      dbGetAllMenuItems(uid),
      dbGetAllCategories(uid),
    ]);

    if (items.length > 0) {
      await withRetry(() =>
        sb.from("menu_items").upsert(
          items.map((i) => ({
            id: i.id,
            user_id: user.id,
            name: i.name,
            category_id: i.categoryId,
            price_paise: i.pricePaise,
            cost_price_paise: i.costPricePaise ?? null,
            is_veg: i.isVeg,
            is_available: i.isAvailable,
            add_ons: i.addOns,
            sizes: i.sizes ?? null,
            portion_enabled: i.portionEnabled ?? false,
            portions: i.portions ?? null,
            fast_add: i.fastAdd ?? false,
            updated_at: i.updatedAt ?? new Date().toISOString(),
          })),
          { onConflict: "id" }
        ).then(({ error }) => { if (error) throw error; })
      );
    }

    if (categories.length > 0) {
      await withRetry(() =>
        sb.from("menu_categories").upsert(
          categories.map((c) => ({
            id: c.id,
            user_id: user.id,
            name: c.name,
            sort_order: c.sortOrder,
            updated_at: c.updatedAt ?? new Date().toISOString(),
          })),
          { onConflict: "id" }
        ).then(({ error }) => { if (error) throw error; })
      );
    }
    recordSyncSuccess();
  } catch {
    recordSyncFailure();
    // non-fatal — local data is safe
  }
}

export async function restoreMenuFromSupabase(uid: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const localItems = await dbGetAllMenuItems(uid);
    if (localItems.length > 0) return;

    const [{ data: remoteItems }, { data: remoteCats }] = await Promise.all([
      sb.from("menu_items").select("*").eq("user_id", user.id),
      sb.from("menu_categories").select("*").eq("user_id", user.id),
    ]);

    if (remoteCats?.length) {
      const cats: MenuCategory[] = remoteCats.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sort_order,
        updatedAt: c.updated_at,
      }));
      await dbBulkSaveCategories(cats, uid);
    }

    if (remoteItems?.length) {
      const items: MenuItem[] = remoteItems.map((i) => ({
        id: i.id,
        name: i.name,
        categoryId: i.category_id,
        pricePaise: i.price_paise,
        costPricePaise: i.cost_price_paise,
        isVeg: i.is_veg,
        isAvailable: i.is_available,
        addOns: i.add_ons ?? [],
        sizes: i.sizes ?? undefined,
        portionEnabled: i.portion_enabled ?? false,
        portions: i.portions ?? undefined,
        fastAdd: i.fast_add ?? false,
        updatedAt: i.updated_at,
      }));
      await dbBulkSaveMenuItems(items, uid);
    }
    recordSyncSuccess();
  } catch {
    recordSyncFailure();
  }
}

// ── P0-02: Bill counter ───────────────────────────────────────────────────────
// Mutex per session to prevent concurrent getNextBillCounter calls
const _billMutexMap = new Map<string, Promise<number | null>>();

export async function getNextBillCounterFromSupabase(): Promise<number | null> {
  if (!isSupabaseEnabled()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;

    // Serialize per-user to prevent duplicate bill numbers from concurrent checkouts
    const key = user.id;
    const pending = _billMutexMap.get(key);
    if (pending) return pending;

    const promise = sb.rpc("increment_bill_counter", { p_user_id: user.id })
      .then(({ data, error }) => {
        _billMutexMap.delete(key);
        if (error) return null;
        return data as number;
      })
      .catch(() => {
        _billMutexMap.delete(key);
        return null;
      });

    _billMutexMap.set(key, promise);
    return promise;
  } catch {
    return null;
  }
}

// ── Orders sync ───────────────────────────────────────────────────────────────
export async function syncOrder(order: Order): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;

    const { error } = await withRetry(() =>
      sb.from("orders").upsert(
        {
          id: order.id,
          user_id: user.id,
          bill_number: order.billNumber,
          items: order.items,
          service_mode: order.serviceMode,
          table_number: order.tableNumber ?? null,
          subtotal_paise: Math.round(order.subtotalPaise),
          discount_paise: Math.round(order.discountPaise),
          discount_type: order.discountType,
          discount_value: order.discountValue,
          gst_percent: order.gstPercent,
          gst_paise: Math.round(order.gstPaise),
          total_paise: Math.round(order.totalPaise),
          payment_method: order.paymentMethod,
          split_payment: order.splitPayment ?? null,
          cash_received_paise: order.cashReceivedPaise != null ? Math.round(order.cashReceivedPaise) : null,
          change_paise: order.changePaise != null ? Math.round(order.changePaise) : null,
          created_at: order.createdAt,
          status: order.status ?? "completed",
          voided_at: order.voidedAt ?? null,
          void_reason: order.voidReason ?? null,
        },
        { onConflict: "id" }
      )
    );

    if (error) throw error;
    await dbUpdateSyncStatus(order.id, "synced");
    recordSyncSuccess();
    return true;
  } catch {
    await dbUpdateSyncStatus(order.id, "failed");
    recordSyncFailure();
    return false;
  }
}

// ── Bulk sync ─────────────────────────────────────────────────────────────────
async function bulkSyncOrders(pending: Order[]): Promise<void> {
  if (!pending.length) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const rows = pending.map((order) => ({
      id: order.id,
      user_id: user.id,
      bill_number: order.billNumber,
      items: order.items,
      service_mode: order.serviceMode,
      table_number: order.tableNumber ?? null,
      subtotal_paise: Math.round(order.subtotalPaise),
      discount_paise: Math.round(order.discountPaise),
      discount_type: order.discountType,
      discount_value: order.discountValue,
      gst_percent: order.gstPercent,
      gst_paise: Math.round(order.gstPaise),
      total_paise: Math.round(order.totalPaise),
      payment_method: order.paymentMethod,
      split_payment: order.splitPayment ?? null,
      cash_received_paise: order.cashReceivedPaise != null ? Math.round(order.cashReceivedPaise) : null,
      change_paise: order.changePaise != null ? Math.round(order.changePaise) : null,
      created_at: order.createdAt,
      status: order.status ?? "completed",
      voided_at: order.voidedAt ?? null,
      void_reason: order.voidReason ?? null,
    }));

    const { error } = await sb.from("orders").upsert(rows, { onConflict: "id" });
    if (!error) {
      for (const o of pending) await dbUpdateSyncStatus(o.id, "synced");
      recordSyncSuccess();
    } else {
      // Bulk failed — fall back to individual with retry
      for (const o of pending) await syncOrder(o);
    }
  } catch {
    for (const o of pending) await syncOrder(o);
  }
}

// ── P0-04: backgroundSync ─────────────────────────────────────────────────────
let _syncInterval: ReturnType<typeof setInterval> | null = null;
let _syncUid: string | null = null;
let _syncInFlight = false;

export async function backgroundSync(userId: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  if (_syncInFlight) return; // Prevent concurrent sync runs
  _syncUid = userId;
  _syncInFlight = true;
  try {
    const pending = await dbGetPendingOrders(userId);
    setPending(pending.length);
    if (pending.length > 0) {
      await bulkSyncOrders(pending);
      setPending(0);
    }
    // Also sync pending table orders
    const { syncAllPendingTableOrders } = await import("@/lib/supabase/tableSync");
    await syncAllPendingTableOrders(userId);
  } catch {
    recordSyncFailure();
    /* silent — never blocks UI */
  } finally {
    _syncInFlight = false;
  }
}

export function startSyncListeners(userId: string): () => void {
  _syncUid = userId;

  const onOnline = () => {
    setOnline(true);
    if (_syncUid) backgroundSync(_syncUid).catch(() => {});
  };
  const onOffline = () => setOnline(false);

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);
  }

  // 60-second interval sync
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(() => {
    if (_syncUid && _isOnline && !_syncInFlight) backgroundSync(_syncUid).catch(() => {});
  }, 60_000);

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    }
    if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
  };
}
