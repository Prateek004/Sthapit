import { getSupabase, isSupabaseEnabled } from "./client";
import { dbUpdateTableOrderSyncStatus } from "@/lib/db";
import type { TableOrder } from "@/lib/types";

export async function syncTableOrder(order: TableOrder): Promise<boolean> {
  if (!isSupabaseEnabled()) return false;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return false;

    if (order.status === "AVAILABLE" || order.items.length === 0) {
      // Delete from remote if table is now available
      await sb
        .from("table_orders")
        .delete()
        .eq("id", order.id)
        .eq("user_id", user.id);
      await dbUpdateTableOrderSyncStatus(order.id, "synced");
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
      },
      { onConflict: "id" }
    );

    if (error) throw error;
    await dbUpdateTableOrderSyncStatus(order.id, "synced");
    return true;
  } catch {
    await dbUpdateTableOrderSyncStatus(order.id, "failed").catch(() => {});
    return false;
  }
}

export async function syncAllPendingTableOrders(uid: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  try {
    const { dbGetPendingTableOrders } = await import("@/lib/db");
    const pending = await dbGetPendingTableOrders(uid);
    for (const order of pending) {
      await syncTableOrder(order);
    }
  } catch {
    // silent
  }
}

export async function restoreTableOrdersFromSupabase(uid: string): Promise<void> {
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
      .eq("user_id", user.id)
      .eq("status", "OCCUPIED");

    if (error || !remoteOrders?.length) return;

    const { dbGetAllTableOrders, dbSaveTableOrder } = await import("@/lib/db");
    const localOrders = await dbGetAllTableOrders(uid);
    const localMap = new Map(localOrders.map((o) => [o.id, o]));

    for (const remote of remoteOrders) {
      const local = localMap.get(remote.id);
      // Only restore from remote if newer version or not present locally
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
        };
        await dbSaveTableOrder(order, uid);
      }
    }
  } catch {
    // silent
  }
}
