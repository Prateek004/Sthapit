import { getSupabase, isSupabaseEnabled } from "./client";
import {
  dbUpdateTableOrderSyncStatus,
  dbAtomicUpdateTableOrder,
} from "@/lib/db";
import type { TableOrder } from "@/lib/types";
import {
  recordSyncFailure,
  recordSyncSuccess,
} from "@/lib/utils/observability";

// ── Sync single table order ───────────────────────────────────
// businessId = tenant key. All staff in a business share the same
// live table state via this partition. Realtime filter uses business_id
// so every cashier + owner on any device sees updates instantly.
export async function syncTableOrder(
  order: TableOrder,
  businessId: string
): Promise<boolean> {
  if (!isSupabaseEnabled()) return false;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return false;

    // AVAILABLE or empty tables: delete the remote row (clears ghost-occupied)
    if (order.status === "AVAILABLE" || order.items.length === 0) {
      const { error } = await sb
        .from("table_orders")
        .delete()
        .eq("id", order.id)
        .eq("business_id", businessId);
      // PGRST116 = row not found — not an error (may never have been synced)
      if (error && error.code !== "PGRST116") throw error;
      await dbUpdateTableOrderSyncStatus(order.id, "synced");
      recordSyncSuccess();
      return true;
    }

    const { error } = await sb.from("table_orders").upsert(
      {
        id: order.id,
        user_id: user.id,
        business_id: businessId,
        table_id: order.tableId,
        table_name: order.tableName,
        table_number: order.tableNumber,
        status: order.status,
        items: order.items,
        subtotal_paise: Math.round(order.subtotalPaise),
        tax_paise: Math.round(order.taxPaise),
        discount_paise: Math.round(order.discountPaise),
        total_paise: Math.round(order.totalPaise),
        held_at: order.heldAt,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
        version: order.version,
        gst_percent_at_open: order.gstPercentAtOpen ?? null,
      },
      { onConflict: "id" }
    );

    if (error) throw error;
    await dbUpdateTableOrderSyncStatus(order.id, "synced");
    recordSyncSuccess();
    return true;
  } catch {
    await dbUpdateTableOrderSyncStatus(order.id, "failed").catch(() => {});
    recordSyncFailure();
    return false;
  }
}

// ── Bulk sync pending table orders ────────────────────────────
export async function syncAllPendingTableOrders(
  businessId: string
): Promise<void> {
  if (!isSupabaseEnabled()) return;
  try {
    const { dbGetPendingTableOrders } = await import("@/lib/db");
    const pending = await dbGetPendingTableOrders(businessId);
    if (!pending.length) return;

    const sb = getSupabase();
    if (!sb) return;
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    // AVAILABLE orders → delete remote row
    const toDelete = pending.filter(
      (o) => o.status === "AVAILABLE" || o.items.length === 0
    );
    // OCCUPIED orders → upsert
    const toUpsert = pending.filter(
      (o) => o.status === "OCCUPIED" && o.items.length > 0
    );

    for (const order of toDelete) {
      await Promise.resolve(
        sb
          .from("table_orders")
          .delete()
          .eq("id", order.id)
          .eq("business_id", businessId)
      )
        .then(() => dbUpdateTableOrderSyncStatus(order.id, "synced"))
        .catch(() => {});
    }

    if (toUpsert.length > 0) {
      const rows = toUpsert.map((order) => ({
        id: order.id,
        user_id: user.id,
        business_id: businessId,
        table_id: order.tableId,
        table_name: order.tableName,
        table_number: order.tableNumber,
        status: order.status,
        items: order.items,
        subtotal_paise: Math.round(order.subtotalPaise),
        tax_paise: Math.round(order.taxPaise),
        discount_paise: Math.round(order.discountPaise),
        total_paise: Math.round(order.totalPaise),
        held_at: order.heldAt,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
        version: order.version,
        gst_percent_at_open: order.gstPercentAtOpen ?? null,
      }));

      const { error } = await sb
        .from("table_orders")
        .upsert(rows, { onConflict: "id" });
      if (!error) {
        for (const o of toUpsert)
          await dbUpdateTableOrderSyncStatus(o.id, "synced");
        recordSyncSuccess();
        return;
      }
    }

    // Fallback: individual
    for (const order of pending) await syncTableOrder(order, businessId);
  } catch {
    recordSyncFailure();
  }
}

// ── Restore table orders from Supabase on login/device wipe ──
export async function restoreTableOrdersFromSupabase(
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

    const { data: remoteOrders, error } = await sb
      .from("table_orders")
      .select("*")
      .eq("business_id", businessId);

    if (error) return;

    const { dbGetAllTableOrders, dbSaveTableOrder, dbDeleteTableOrder } =
      await import("@/lib/db");
    const localOrders = await dbGetAllTableOrders(businessId);
    const localMap = new Map(localOrders.map((o) => [o.id, o]));
    const remoteIds = new Set((remoteOrders ?? []).map((r) => r.id));

    // Apply remote state (higher version wins)
    for (const remote of remoteOrders ?? []) {
      const local = localMap.get(remote.id);
      if (!local || remote.version > local.version) {
        const order: TableOrder = {
          id: remote.id,
          tableId: remote.table_id,
          tableName: remote.table_name,
          tableNumber: remote.table_number,
          status: remote.status,
          items: remote.items ?? [],
          subtotalPaise: remote.subtotal_paise,
          taxPaise: remote.tax_paise,
          discountPaise: remote.discount_paise,
          totalPaise: remote.total_paise,
          heldAt: remote.held_at,
          createdAt: remote.created_at,
          updatedAt: remote.updated_at,
          version: remote.version,
          syncStatus: "synced",
          gstPercentAtOpen: remote.gst_percent_at_open ?? undefined,
        };
        await dbSaveTableOrder(order, businessId);
      }
    }

    // Remove local OCCUPIED orders that no longer exist on remote
    // (cleared by another device while this device was offline)
    for (const local of localOrders) {
      if (
        !remoteIds.has(local.id) &&
        local.status === "OCCUPIED" &&
        local.syncStatus === "synced"
      ) {
        await dbDeleteTableOrder(local.id, businessId);
      }
    }
  } catch {
    // silent — local data takes precedence when offline
  }
}

// ── Realtime subscription ─────────────────────────────────────
// Filtered by business_id — every staff member of the same business
// gets the same live table updates regardless of who is logged in.
export function subscribeToTableOrders(
  businessId: string,
  onUpdate: (order: TableOrder) => void,
  onDelete: (orderId: string) => void
): () => void {
  if (!isSupabaseEnabled()) return () => {};
  const sb = getSupabase();
  if (!sb) return () => {};

  const channel = sb
    .channel(`table_orders:${businessId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "table_orders",
        filter: `business_id=eq.${businessId}`,
      },
      async (payload) => {
        if (payload.eventType === "DELETE") {
          onDelete(payload.old.id as string);
          const { dbDeleteTableOrder } = await import("@/lib/db");
          await dbDeleteTableOrder(
            payload.old.id as string,
            businessId
          ).catch(() => {});
          return;
        }
        const remote = payload.new as Record<string, unknown>;
        const order: TableOrder = {
          id: remote.id as string,
          tableId: remote.table_id as string,
          tableName: remote.table_name as string,
          tableNumber: remote.table_number as number,
          status: remote.status as "AVAILABLE" | "OCCUPIED",
          items: (remote.items as TableOrder["items"]) ?? [],
          subtotalPaise: remote.subtotal_paise as number,
          taxPaise: remote.tax_paise as number,
          discountPaise: remote.discount_paise as number,
          totalPaise: remote.total_paise as number,
          heldAt: (remote.held_at as string) ?? null,
          createdAt: remote.created_at as string,
          updatedAt: remote.updated_at as string,
          version: remote.version as number,
          syncStatus: "synced",
          gstPercentAtOpen:
            (remote.gst_percent_at_open as number) ?? undefined,
        };
        const { dbSaveTableOrder } = await import("@/lib/db");
        await dbSaveTableOrder(order, businessId);
        onUpdate(order);
      }
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}
