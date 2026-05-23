import { getSupabase, isSupabaseEnabled } from "./client";
import {
  dbGetPendingOrders,
  dbUpdateSyncStatus,
  dbGetAllMenuItems,
  dbGetAllCategories,
} from "@/lib/db";
import type { Order } from "@/lib/types";

export async function syncOrder(order: Order): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return false;
    const { error } = await sb.from("orders").upsert({
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
      cash_received_paise:
        order.cashReceivedPaise != null ? Math.round(order.cashReceivedPaise) : null,
      change_paise: order.changePaise != null ? Math.round(order.changePaise) : null,
      created_at: order.createdAt,
      sync_status: "synced",
    });
    if (error) throw error;
    await dbUpdateSyncStatus(order.id, "synced");
    return true;
  } catch {
    await dbUpdateSyncStatus(order.id, "failed");
    return false;
  }
}

export async function syncMenuToSupabase(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const [cats, items] = await Promise.all([
      dbGetAllCategories(userId),
      dbGetAllMenuItems(userId),
    ]);
    if (cats.length > 0) {
      await sb.from("menu_categories").upsert(
        cats.map((c) => ({
          id: c.id,
          user_id: user.id,
          name: c.name,
          sort_order: c.sortOrder,
        })),
        { onConflict: "id" }
      );
    }
    if (items.length > 0) {
      await sb.from("menu_items").upsert(
        items.map((i) => ({
          id: i.id,
          user_id: user.id,
          category_id: i.categoryId,
          name: i.name,
          price_paise: i.pricePaise,
          is_available: i.isAvailable,
          portions: i.portions ?? [],
          add_ons: i.addOns ?? [],
          is_veg: i.isVeg,
        })),
        { onConflict: "id" }
      );
    }
  } catch {
    /* silent — sync failure never blocks the UI */
  }
}

export async function backgroundSync(userId: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  try {
    const pending = await dbGetPendingOrders(userId);
    for (const order of pending) await syncOrder(order);
    await syncMenuToSupabase(userId);
  } catch {
    /* silent */
  }
}
