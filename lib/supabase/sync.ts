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

    const { error } = await sb.from("orders").upsert(
      {
        id: order.id,
        user_id: user.id,
        bill_number: order.billNumber,
        items: order.items,
        service_mode: order.serviceMode,
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
      },
      { onConflict: "id" }
    );

    if (error) throw error;
    await dbUpdateSyncStatus(order.id, "synced");
    return true;
  } catch {
    await dbUpdateSyncStatus(order.id, "failed");
    return false;
  }
}

export async function backgroundSync(userId: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  try {
    const pending = await dbGetPendingOrders(userId);
    for (const order of pending) {
      await syncOrder(order);
    }
  } catch {
    /* silent — never blocks the UI */
  }
}
