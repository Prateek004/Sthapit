import { getSupabase, isSupabaseEnabled } from "./client";
import { dbUpdateTableOrderSyncStatus, dbAtomicUpdateTableOrder } from "@/lib/db";
import type { TableOrder } from "@/lib/types";
import { recordSyncFailure, recordSyncSuccess } from "@/lib/utils/observability";

// ── Sync single table order ───────────────────────────────────────────────────
export async function syncTableOrder(order: TableOrder): Promise<boolean> {
  if (!isSupabaseEnabled()) return false;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;

    // FIX C-01: Always sync to Supabase — even for AVAILABLE/empty orders.
    // For cleared tables, delete the remote row. This was the ghost-occupied bug.
    if (order.status === "AVAILABLE" || order.items.length === 0) {
      const { error } = await sb
        .from("table_orders")
        .delete()
        .eq("id", order.id)
        .eq("user_id", user.id);
      // Not-found is not an error — row may never have been synced
      if (error && error.code !== "PGRST116") throw error;
      await dbUpdateTableOrderSyncStatus(order.id, "synced");
      recordSyncSuccess();
      return true;
    }

    const { error } = await sb.from("table_orders").upsert(
      {
        id: order.id,
        user_id: user.id,
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

// ── Bulk sync pending table orders ────────────────────────────────────────────
export async function syncAllPendingTableOrders(uid: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  try {
    const { dbGetPendingTableOrders } = await import("@/lib/db");
    const pending = await dbGetPendingTableOrders(uid);
    if (!pending.length) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // FIX H-02: Sync ALL pending orders regardless of status (not just OCCUPIED)
    // AVAILABLE orders need to delete their remote row
    const toDelete = pending.filter((o) => o.status === "AVAILABLE" || o.items.length === 0);
    const toUpsert = pending.filter((o) => o.status === "OCCUPIED" && o.items.length > 0);

    // Delete cleared tables from Supabase
    for (const order of toDelete) {
      await Promise.resolve(
        sb.from("table_orders").delete().eq("id", order.id).eq("user_id", user.id)
      )
        .then(() => dbUpdateTableOrderSyncStatus(order.id, "synced"))
        .catch(() => {});
    }

    if (toUpsert.length > 0) {
      const rows = toUpsert.map((order) => ({
        id: order.id,
        user_id: user.id,
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

      const { error } = await sb.from("table_orders").upsert(rows, { onConflict: "id" });
      if (!error) {
        for (const o of toUpsert) await dbUpdateTableOrderSyncStatus(o.id, "synced");
        recordSyncSuccess();
        return;
      }
    }
    // Fallback: individual
    for (const order of pending) await syncTableOrder(order);
  } catch {
    recordSyncFailure();
  }
}

// ── Restore from Supabase ─────────────────────────────────────────────────────
export async function restoreTableOrdersFromSupabase(uid: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // FIX H-06: Fetch ALL table orders (not just OCCUPIED) so we can clear
    // stale local OCCUPIED records that were cleared on another device
    const { data: remoteOrders, error } = await sb
      .from("table_orders")
      .select("*")
      .eq("user_id", user.id);

    if (error) return;

    const { dbGetAllTableOrders, dbSaveTableOrder, dbDeleteTableOrder } = await import("@/lib/db");
    const localOrders = await dbGetAllTableOrders(uid);
    const localMap = new Map(localOrders.map((o) => [o.id, o]));
    const remoteIds = new Set((remoteOrders ?? []).map((r) => r.id));

    // Apply remote state (newer wins)
    for (const remote of (remoteOrders ?? [])) {
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
        await dbSaveTableOrder(order, uid);
      }
    }

    // FIX H-06: Remove local OCCUPIED orders that no longer exist on remote
    // (they were cleared by another device while this device was offline)
    for (const local of localOrders) {
      if (!remoteIds.has(local.id) && local.status === "OCCUPIED" && local.syncStatus === "synced") {
        await dbDeleteTableOrder(local.id, uid);
      }
    }
  } catch {
    // silent
  }
}

// ── Realtime subscription ─────────────────────────────────────────────────────
export function subscribeToTableOrders(
  userId: string,
  onUpdate: (order: TableOrder) => void,
  onDelete: (orderId: string) => void
): () => void {
  if (!isSupabaseEnabled()) return () => {};
  const sb = getSupabase();
  if (!sb) return () => {};

  const channel = sb
    .channel(`table_orders:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "table_orders",
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        if (payload.eventType === "DELETE") {
          onDelete(payload.old.id as string);
          // FIX H-06: Also clean up IDB when remote deletes
          const { dbDeleteTableOrder } = await import("@/lib/db");
          await dbDeleteTableOrder(payload.old.id as string, userId).catch(() => {});
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
          gstPercentAtOpen: (remote.gst_percent_at_open as number) ?? undefined,
        };
        const { dbSaveTableOrder } = await import("@/lib/db");
        await dbSaveTableOrder(order, userId);
        onUpdate(order);
      }
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}
