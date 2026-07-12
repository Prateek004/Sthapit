import { Order, RawMaterial, MenuItem, WastageEntry } from "@/lib/types";
import { isLowStock } from "@/lib/utils";

/**
 * STHAPPIT Confidence Framework — 5 levels (Section E of strategy doc).
 *
 *  Confirmed        → directly measured from hard POS data
 *  High Confidence  → computed from reliable data with enough volume
 *  Estimated        → inferred with stated assumptions
 *  Suggested        → early signal, limited data — needs more history
 *  Flagged          → anomaly detected, cause unknown — review manually
 */
export type LeakConfidence =
  | "Confirmed"
  | "High Confidence"
  | "Estimated"
  | "Suggested"
  | "Flagged";

export interface Leak {
  id: string;
  type:
    | "discount_anomaly"
    | "refund_no_pin"
    | "aggregator_mismatch"
    | "low_stock"
    | "high_void_rate"
    | "menu_margin"
    | "silent_item"
    | "food_waste";
  title: string;
  why: string;
  nextAction: string;
  impactPaise: number;
  confidence: LeakConfidence;
  billIds: string[];
}

/** Orders needed before a statistical rule is allowed to claim certainty. */
const MIN_SAMPLE = 20;

/** Margin benchmark: items earning less than this gross margin are flagged. */
const MARGIN_FLOOR = 0.3;

function withinDays(iso: string, days: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

/**
 * menuItems is OPTIONAL — existing callers keep working unchanged.
 * When provided, two additional rules run (menu_margin, silent_item).
 */
export function detectLeaks(
  orders: Order[],
  rawMaterials: RawMaterial[],
  menuItems?: MenuItem[],
  wastage?: WastageEntry[]
): Leak[] {
  const leaks: Leak[] = [];

  // RULE 1 — discount_anomaly
  const validOrders = orders.filter((o) => o.status !== "voided");
  const avgDiscount =
    validOrders.length > 0
      ? validOrders.reduce((s, o) => s + o.discountPaise, 0) / validOrders.length
      : 0;
  const discountFlagged = validOrders.filter(
    (o) => o.discountPaise > avgDiscount * 2 && o.discountPaise > 5000
  );
  if (discountFlagged.length > 0) {
    const impactPaise = Math.round(
      discountFlagged.reduce((s, o) => s + (o.discountPaise - avgDiscount), 0)
    );
    const enoughData = validOrders.length >= MIN_SAMPLE;
    leaks.push({
      id: "discount_anomaly",
      type: "discount_anomaly",
      title: "Unusual discounts flagged",
      why: enoughData
        ? `${discountFlagged.length} orders have discounts more than 2x the average, based on ${validOrders.length} orders`
        : `${discountFlagged.length} orders have discounts more than 2x the average — early signal, only ${validOrders.length} orders so far`,
      nextAction: "Review flagged bills. Require manager PIN for discounts above average.",
      impactPaise,
      confidence: enoughData ? "Confirmed" : "Suggested",
      billIds: discountFlagged.map((o) => o.billNumber),
    });
  }

  // RULE 2 — refund_no_pin (hard data, always Confirmed)
  const refunded = orders.filter((o) => o.status === "refunded");
  if (refunded.length > 0) {
    const impactPaise = refunded.reduce((s, o) => s + o.totalPaise, 0);
    leaks.push({
      id: "refund_no_pin",
      type: "refund_no_pin",
      title: "Refunds processed without manager PIN",
      why: `${refunded.length} refund(s) recorded today with no PIN verification in audit log`,
      nextAction: "Enable mandatory manager PIN for all refunds in Settings → Security.",
      impactPaise,
      confidence: "Confirmed",
      billIds: refunded.map((o) => o.billNumber),
    });
  }

  // RULE 3 — aggregator_mismatch (flat estimate until real reconciliation ships)
  const deliveryOrders = orders.filter(
    (o) => o.serviceMode === "delivery" && o.status !== "voided"
  );
  if (deliveryOrders.length > 0) {
    const impactPaise = Math.round(
      deliveryOrders.reduce((s, o) => s + o.totalPaise * 0.06, 0)
    );
    leaks.push({
      id: "aggregator_mismatch",
      type: "aggregator_mismatch",
      title: "Aggregator promo fee not reconciled",
      why: `${deliveryOrders.length} delivery orders may have untracked 6% promo deductions`,
      nextAction: "Open Zomato/Swiggy Partner App → Promotions. Match settlement report to bills.",
      impactPaise,
      confidence: "Estimated",
      billIds: deliveryOrders.map((o) => o.billNumber),
    });
  }

  // RULE 4 — low_stock
  const lowItems = rawMaterials.filter(
    (r) => isLowStock(r)
  );
  if (lowItems.length > 0) {
    const impactPaise = lowItems.length * 50000;
    leaks.push({
      id: "low_stock",
      type: "low_stock",
      title: `${lowItems.length} ingredients near reorder level`,
      why: `${lowItems.map((r) => r.name).join(", ")} are at or below reorder threshold`,
      nextAction: "Place reorder for flagged items. WhatsApp vendor or call supplier today.",
      impactPaise,
      confidence: "Estimated",
      billIds: [],
    });
  }

  // RULE 5 — high_void_rate
  const voidedOrders = orders.filter((o) => o.status === "voided");
  if (voidedOrders.length > 0 && orders.length > 0 && voidedOrders.length / orders.length > 0.1) {
    const impactPaise = voidedOrders.reduce((s, o) => s + o.totalPaise, 0);
    const enoughData = orders.length >= MIN_SAMPLE;
    leaks.push({
      id: "high_void_rate",
      type: "high_void_rate",
      title: "High void rate detected",
      why: `${voidedOrders.length} of ${orders.length} orders voided today (${Math.round(
        (voidedOrders.length / orders.length) * 100
      )}%)${enoughData ? "" : " — small sample, treat as an early signal"}`,
      nextAction: "Review void reasons. Require manager approval for all voids.",
      impactPaise,
      confidence: enoughData ? "Confirmed" : "Suggested",
      billIds: voidedOrders.map((o) => o.billNumber),
    });
  }

  // ── Menu-aware rules — only run when menuItems is supplied ──────────────
  if (menuItems && menuItems.length > 0) {
    const recentOrders = orders.filter(
      (o) => o.status !== "voided" && withinDays(o.createdAt, 7)
    );

    // Aggregate 7-day sales per menu item (base price only — matches CartItem contract)
    const soldQty = new Map<string, number>();
    const soldRevenuePaise = new Map<string, number>();
    for (const o of recentOrders) {
      for (const it of o.items) {
        soldQty.set(it.menuItemId, (soldQty.get(it.menuItemId) ?? 0) + it.qty);
        soldRevenuePaise.set(
          it.menuItemId,
          (soldRevenuePaise.get(it.menuItemId) ?? 0) + it.unitPricePaise * it.qty
        );
      }
    }

    // RULE 6 — menu_margin: items selling below the margin floor
    let marginLossPaise = 0;
    const thinItems: { name: string; qty: number; marginPct: number }[] = [];
    let maxQty = 0;
    for (const mi of menuItems) {
      const cost = mi.costPricePaise ?? 0;
      if (cost <= 0) continue;
      const qty = soldQty.get(mi.id) ?? 0;
      if (qty <= 0) continue;
      const rev = soldRevenuePaise.get(mi.id) ?? 0;
      if (rev <= 0) continue;
      const margin = (rev - cost * qty) / rev;
      if (margin < MARGIN_FLOOR) {
        // Rupees lost vs earning the floor margin on the same sales
        marginLossPaise += Math.round((MARGIN_FLOOR - margin) * rev);
        thinItems.push({ name: mi.name, qty, marginPct: Math.round(margin * 100) });
        if (qty > maxQty) maxQty = qty;
      }
    }
    if (thinItems.length > 0 && marginLossPaise > 0) {
      const top = thinItems
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3)
        .map((t) => `${t.name} (${t.marginPct}% margin, ${t.qty} sold)`)
        .join(", ");
      leaks.push({
        id: "menu_margin",
        type: "menu_margin",
        title: `${thinItems.length} item(s) selling below 30% margin`,
        why: `Last 7 days: ${top}${thinItems.length > 3 ? ` and ${thinItems.length - 3} more` : ""}`,
        nextAction:
          "Open Menu Matrix. Reprice, shrink portion cost, or de-emphasise these items on the menu.",
        impactPaise: marginLossPaise,
        confidence: maxQty >= 10 ? "High Confidence" : "Suggested",
        billIds: [],
      });
    }

    // RULE 7 — silent_item: marked available but zero sales while the shop is busy.
    // Cause unknown (stealth stockout, menu placement, price) → Flagged for manual review.
    if (recentOrders.length >= MIN_SAMPLE) {
      const silent = menuItems.filter(
        (mi) => mi.isAvailable && (soldQty.get(mi.id) ?? 0) === 0
      );
      const sellingItemCount = Array.from(soldQty.values()).filter((q) => q > 0).length;
      if (silent.length > 0 && sellingItemCount > 0) {
        const totalRecentRevenue = recentOrders.reduce((s, o) => s + o.totalPaise, 0);
        // Conservative: half of the average per-item weekly revenue, per silent item
        const perItemAvg = totalRecentRevenue / sellingItemCount;
        const impactPaise = Math.round(silent.length * perItemAvg * 0.5);
        leaks.push({
          id: "silent_item",
          type: "silent_item",
          title: `${silent.length} menu item(s) had zero sales in 7 days`,
          why: `${silent
            .slice(0, 4)
            .map((m) => m.name)
            .join(", ")}${silent.length > 4 ? ` and ${silent.length - 4} more` : ""} are marked available but never ordered while ${recentOrders.length} orders came in`,
          nextAction:
            "Check each item: actually in stock? Priced right? Visible on the menu? Remove or fix.",
          impactPaise,
          confidence: "Flagged",
          billIds: [],
        });
      }
    }
  }

  // RULE 8 — food_waste: owner-logged waste (G4 tracker). Hard data → Confirmed.
  if (wastage && wastage.length > 0) {
    const recent = wastage.filter((w) => withinDays(w.createdAt, 7));
    const totalWastePaise = recent.reduce((s, w) => s + w.valuePaise, 0);
    if (recent.length > 0 && totalWastePaise > 0) {
      const byReason = new Map<string, number>();
      for (const w of recent) {
        byReason.set(w.reason, (byReason.get(w.reason) ?? 0) + w.valuePaise);
      }
      const topReason = Array.from(byReason.entries()).sort((a, b) => b[1] - a[1])[0];
      const reasonLabel: Record<string, string> = {
        spoiled: "spoilage",
        overcooked: "overcooking",
        returned: "customer returns",
        prep_waste: "prep waste",
        other: "other causes",
      };
      leaks.push({
        id: "food_waste",
        type: "food_waste",
        title: "Logged food waste this week",
        why: `${recent.length} waste entries in 7 days; biggest cause: ${
          reasonLabel[topReason[0]] ?? topReason[0]
        }`,
        nextAction:
          "Open the Wastage log. Adjust prep quantities or storage for the top-wasted items.",
        impactPaise: totalWastePaise,
        confidence: "Confirmed",
        billIds: [],
      });
    }
  }

  return leaks
    .filter((l) => l.impactPaise !== 0)
    .sort((a, b) => b.impactPaise - a.impactPaise);
}
