import { getSupabase, isSupabaseEnabled } from "./client";
import { dbUpdateTableOrderSyncStatus } from "@/lib/db";
import type { TableOrder } from "@/lib/types";

// ── Sync single table order ───────────────────────────────────────────────────
export async function syncTableOrder(order: TableOrder): Promise<boolean> {
  if (!isSupabaseEnabled()) return false;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;

    if (order.status === "AVAILABLE" || order.items.length === 0) {
      await sb.from("table_orders").delete().eq("id", order.id).eq("user_id", user.id);
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
        // P0-08: persist locked GST rate
        gst_percent_at_open: order.gstPercentAtOpen ?? null,
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

// ── P1-04: Bulk sync pending table orders ─────────────────────────────────────
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

    const rows = pending
      .filter((o) => o.status === "OCCUPIED" && o.items.length > 0)
      .map((order) => ({
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

    if (rows.length > 0) {
      const { error } = await sb.from("table_orders").upsert(rows, { onConflict: "id" });
      if (!error) {
        for (const o of pending) await dbUpdateTableOrderSyncStatus(o.id, "synced");
        return;
      }
    }
    // Fallback: individual
    for (const order of pending) await syncTableOrder(order);
  } catch {
    // silent
  }
}

// ── Restore from Supabase (on login / reconnect) ──────────────────────────────
export async function restoreTableOrdersFromSupabase(uid: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
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
  } catch {
    // silent
  }
}

// ── P1-01: Supabase Realtime subscription for table state ─────────────────────
// Returns unsubscribe fn. Call in TableStoreProvider useEffect.
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
        // Save to IDB and notify store
        const { dbSaveTableOrder } = await import("@/lib/db");
        // Get uid for IDB save
        const raw = typeof window !== "undefined" ? localStorage.getItem("sth1r_session") : null;
        const uid = raw ? (JSON.parse(raw).userId ?? userId) : userId;
        await dbSaveTableOrder(order, uid);
        onUpdate(order);
      }
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}
