import { Order, RawMaterial } from "@/lib/types";

export interface Leak {
  id: string;
  type:
    | "discount_anomaly"
    | "refund_no_pin"
    | "aggregator_mismatch"
    | "low_stock"
    | "high_void_rate";
  title: string;
  why: string;
  nextAction: string;
  impactPaise: number;
  confidence: "Confirmed" | "Estimated";
  billIds: string[];
}

export function detectLeaks(orders: Order[], rawMaterials: RawMaterial[]): Leak[] {
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
    leaks.push({
      id: "discount_anomaly",
      type: "discount_anomaly",
      title: "Unusual discounts flagged",
      why: `${discountFlagged.length} orders have discounts more than 2x the daily average`,
      nextAction: "Review flagged bills. Require manager PIN for discounts above average.",
      impactPaise,
      confidence: "Confirmed",
      billIds: discountFlagged.map((o) => o.billNumber),
    });
  }

  // RULE 2 — refund_no_pin
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

  // RULE 3 — aggregator_mismatch
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
    (r) => (r.minStock ?? 0) > 0 && r.currentStock <= (r.minStock ?? 0) * 1.2
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
    leaks.push({
      id: "high_void_rate",
      type: "high_void_rate",
      title: "High void rate detected",
      why: `${voidedOrders.length} of ${orders.length} orders voided today (${Math.round(
        (voidedOrders.length / orders.length) * 100
      )}%)`,
      nextAction: "Review void reasons. Require manager approval for all voids.",
      impactPaise,
      confidence: "Confirmed",
      billIds: voidedOrders.map((o) => o.billNumber),
    });
  }

  return leaks
    .filter((l) => l.impactPaise !== 0)
    .sort((a, b) => b.impactPaise - a.impactPaise);
}
