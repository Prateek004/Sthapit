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
import {
  recordSyncFailure,
  recordSyncSuccess,
  setOfflineQueueSize,
} from "@/lib/utils/observability";

// ── Sync status tracking ──────────────────────────────────────
let _pendingCount = 0;
let _isOnline =
  typeof navigator !== "undefined" ? navigator.onLine : true;
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

// ── Exponential backoff retry ─────────────────────────────────
async function withRetry<T>(
  fn: () => PromiseLike<T>,
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
        await new Promise((r) =>
          setTimeout(r, baseDelayMs * Math.pow(2, attempt))
        );
      }
    }
  }
  throw lastErr;
}

// ── Menu sync ─────────────────────────────────────────────────
// businessId = tenant key. user_id on each row = acting auth user (for audit).
// RLS governs visibility by business_id so all staff see the same menu.
export async function syncMenu(businessId: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const [items, categories] = await Promise.all([
      dbGetAllMenuItems(businessId),
      dbGetAllCategories(businessId),
    ]);

    if (items.length > 0) {
      await withRetry(() =>
        sb
          .from("menu_items")
          .upsert(
            items.map((i) => ({
              id: i.id,
              user_id: user.id,
              business_id: businessId,
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
          )
          .then(({ error }) => {
            if (error) throw error;
          })
      );
    }

    if (categories.length > 0) {
      await withRetry(() =>
        sb
          .from("menu_categories")
          .upsert(
            categories.map((c) => ({
              id: c.id,
              user_id: user.id,
              business_id: businessId,
              name: c.name,
              sort_order: c.sortOrder,
              updated_at: c.updatedAt ?? new Date().toISOString(),
            })),
            { onConflict: "id" }
          )
          .then(({ error }) => {
            if (error) throw error;
          })
      );
    }
    recordSyncSuccess();
  } catch {
    recordSyncFailure();
  }
}

export async function restoreMenuFromSupabase(
  businessId: string
): Promise<void> {
  if (!isSupabaseEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const localItems = await dbGetAllMenuItems(businessId);
    if (localItems.length > 0) return;

    const [{ data: remoteItems }, { data: remoteCats }] = await Promise.all([
      sb.from("menu_items").select("*").eq("business_id", businessId),
      sb.from("menu_categories").select("*").eq("business_id", businessId),
    ]);

    if (remoteCats?.length) {
      const cats: MenuCategory[] = remoteCats.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sort_order,
        updatedAt: c.updated_at,
      }));
      await dbBulkSaveCategories(cats, businessId);
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
      await dbBulkSaveMenuItems(items, businessId);
    }
    recordSyncSuccess();
  } catch {
    recordSyncFailure();
  }
}

// ── Bill counter — keyed by businessId so owner+cashiers share one sequence ──
const _billMutexMap = new Map<string, Promise<number | null>>();

export async function getNextBillCounterFromSupabase(
  businessId: string
): Promise<number | null> {
  if (!isSupabaseEnabled()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return null;

    // Serialize per-business to prevent duplicate bill numbers
    const pending = _billMutexMap.get(businessId);
    if (pending) return pending;

    const promise = Promise.resolve(
      sb.rpc("increment_bill_counter_v2", { p_business_id: businessId })
    )
      .then(({ data, error }) => {
        _billMutexMap.delete(businessId);
        if (error) return null;
        return data as number;
      })
      .catch(() => {
        _billMutexMap.delete(businessId);
        return null;
      });

    _billMutexMap.set(businessId, promise);
    return promise;
  } catch {
    return null;
  }
}

// ── Single order sync ─────────────────────────────────────────
export async function syncOrder(
  order: Order,
  businessId: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return false;

    const { error } = await withRetry(() =>
      sb.from("orders").upsert(
        {
          id: order.id,
          user_id: user.id,
          business_id: businessId,
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
          cash_received_paise:
            order.cashReceivedPaise != null
              ? Math.round(order.cashReceivedPaise)
              : null,
          change_paise:
            order.changePaise != null
              ? Math.round(order.changePaise)
              : null,
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

// ── Bulk order sync ───────────────────────────────────────────
async function bulkSyncOrders(
  pending: Order[],
  businessId: string
): Promise<void> {
  if (!pending.length) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const rows = pending.map((order) => ({
      id: order.id,
      user_id: user.id,
      business_id: businessId,
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
      cash_received_paise:
        order.cashReceivedPaise != null
          ? Math.round(order.cashReceivedPaise)
          : null,
      change_paise:
        order.changePaise != null ? Math.round(order.changePaise) : null,
      created_at: order.createdAt,
      status: order.status ?? "completed",
      voided_at: order.voidedAt ?? null,
      void_reason: order.voidReason ?? null,
    }));

    const { error } = await sb
      .from("orders")
      .upsert(rows, { onConflict: "id" });
    if (!error) {
      for (const o of pending) await dbUpdateSyncStatus(o.id, "synced");
      recordSyncSuccess();
    } else {
      for (const o of pending) await syncOrder(o, businessId);
    }
  } catch {
    for (const o of pending) await syncOrder(o, businessId);
  }
}

// ── Background sync ───────────────────────────────────────────
let _syncInterval: ReturnType<typeof setInterval> | null = null;
let _syncBusinessId: string | null = null;
let _syncInFlight = false;

export async function backgroundSync(businessId: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  if (_syncInFlight) return;
  _syncBusinessId = businessId;
  _syncInFlight = true;
  try {
    const pending = await dbGetPendingOrders(businessId);
    setPending(pending.length);
    if (pending.length > 0) {
      await bulkSyncOrders(pending, businessId);
      setPending(0);
    }
    const { syncAllPendingTableOrders } = await import(
      "@/lib/supabase/tableSync"
    );
    await syncAllPendingTableOrders(businessId);
  } catch {
    recordSyncFailure();
  } finally {
    _syncInFlight = false;
  }
}

export function startSyncListeners(businessId: string): () => void {
  _syncBusinessId = businessId;

  const onOnline = () => {
    setOnline(true);
    if (_syncBusinessId)
      backgroundSync(_syncBusinessId).catch(() => {});
  };
  const onOffline = () => setOnline(false);

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);
  }

  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(() => {
    if (_syncBusinessId && _isOnline && !_syncInFlight)
      backgroundSync(_syncBusinessId).catch(() => {});
  }, 60_000);

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    }
    if (_syncInterval) {
      clearInterval(_syncInterval);
      _syncInterval = null;
    }
  };
}
