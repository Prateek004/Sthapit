import { getSupabase, isSupabaseEnabled } from "./client";
import {
  dbGetPendingOrders,
  dbUpdateSyncStatus,
  dbGetAllMenuItems,
  dbGetAllCategories,
  dbGetAllFinishedGoods,
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
          has_variants: !!(i.portionEnabled && i.portions?.length),
          variants: i.portions ?? [],
          addons: i.addOns ?? [],
          tags: i.isVeg ? ["veg"] : ["non-veg"],
        })),
        { onConflict: "id" }
      );
    }
  } catch {
    /* silent */
  }
}

export async function syncFinishedGoodsToSupabase(userId: string): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const goods = await dbGetAllFinishedGoods(userId);
    if (goods.length === 0) return;
    await sb.from("finished_goods").upsert(
      goods.map((g) => ({
        id: g.id,
        user_id: user.id,
        name: g.name,
        quantity: g.quantity,
        unit: g.unit,
        cost_price_paise: g.costPricePaise ?? null,
        selling_price_paise: g.sellingPricePaise ?? null,
        expiry_date: g.expiryDate ?? null,
        is_in_billing: g.isInBilling ?? false,
        billing_menu_item_id: g.billingMenuItemId ?? null,
        updated_at: g.updatedAt,
      })),
      { onConflict: "id" }
    );
  } catch {
    /* silent — table may not exist yet */
  }
}

export async function backgroundSync(userId: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  try {
    const pending = await dbGetPendingOrders(userId);
    for (const order of pending) await syncOrder(order);
    await syncMenuToSupabase(userId);
    await syncFinishedGoodsToSupabase(userId);
  } catch {
    /* silent */
  }
}
