export const HIDE_FRANCHISE = true;

export const toP = (rupee: number): number => Math.round(rupee * 100);
export const toR = (paise: number): number => paise / 100;

export const fmtRupee = (paise: number): string =>
  "₹" +
  (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Calculate discount in paise.
 * - "flat"   : value is in RUPEES (user types ₹50 → value=50 → 5000 paise)
 * - "percent": value is 0-100 (user types 10 → 10% of subtotal)
 * Result is clamped to [0, subtotalPaise].
 * Negative values are rejected — Math.max(0, value) guards both paths.
 */
export const calcDiscount = (
  subtotalPaise: number,
  type: "flat" | "percent",
  value: number
): number => {
  const safeValue = Math.max(0, value);
  if (!safeValue) return 0;
  if (type === "percent") {
    const pct = Math.min(safeValue, 100);
    return Math.round((subtotalPaise * pct) / 100);
  }
  // flat — value is in rupees
  return Math.min(toP(safeValue), subtotalPaise);
};

/**
 * GST on the post-discount taxable amount.
 * GST = (taxableAmount × gstPercent) / 100, rounded to nearest paise.
 */
export const calcGST = (afterDiscountPaise: number, pct: number): number => {
  if (!pct || pct <= 0) return 0;
  return Math.round((afterDiscountPaise * pct) / 100);
};

/**
 * P1-06: GST-inclusive extraction.
 * When prices include GST (MRP), extract the GST component:
 * GST = total × (pct / (100 + pct))
 * Taxable = total - GST
 */
export const extractGSTFromInclusive = (
  inclusivePaise: number,
  pct: number
): { taxPaise: number; taxablePaise: number } => {
  if (!pct || pct <= 0) return { taxPaise: 0, taxablePaise: inclusivePaise };
  const taxPaise = Math.round((inclusivePaise * pct) / (100 + pct));
  return { taxPaise, taxablePaise: inclusivePaise - taxPaise };
};

// ── Sequential bill number — GST-compliant ────────────────────────────────────
// Format: STH-FY26-000001-<deviceSuffix>
// FY = Indian financial year ending, Apr–Mar. Resets each new FY.
// deviceSuffix = short UUID stored in localStorage, prevents collisions when
// two devices are offline simultaneously.
const BILL_COUNTER_KEY = "sth1r_bill_counter";
const BILL_FY_KEY      = "sth1r_bill_fy";
const DEVICE_ID_KEY    = "sth1r_device_id";

function getCurrentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fyEnd = month >= 4 ? year + 1 : year;
  return String(fyEnd).slice(2); // e.g. "26" for FY 2025-26
}

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "X0";
  }
}

export const generateBillNumber = (): string => {
  try {
    const fy = getCurrentFY();
    const deviceId = getDeviceId();
    const storedFY = localStorage.getItem(BILL_FY_KEY) ?? "";
    let counter = parseInt(localStorage.getItem(BILL_COUNTER_KEY) ?? "0", 10);

    if (storedFY !== fy) {
      counter = 0;
      localStorage.setItem(BILL_FY_KEY, fy);
    }

    counter += 1;
    localStorage.setItem(BILL_COUNTER_KEY, String(counter));
    return `STH-FY${fy}-${String(counter).padStart(6, "0")}-${deviceId}`;
  } catch {
    const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    return `STH-${rand}`;
  }
};

export const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

export const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

/** IST-safe calendar date (YYYY-MM-DD). Fixes UTC bucketing bug: orders placed
 *  12:00-5:29 AM IST were counted in yesterday. en-CA locale gives YYYY-MM-DD. */
const IST_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Convert any Date or ISO timestamp to its IST calendar date string. */
export const dateStrIST = (d: Date | string = new Date()): string =>
  IST_DATE_FMT.format(typeof d === "string" ? new Date(d) : d);

export const todayStr = (): string => dateStrIST();

/** THE single low-stock definition. Every screen must use this — never inline
 *  a threshold multiplier again. Low = at or below the owner-set minStock. */
export const isLowStock = (item: { currentStock: number; minStock?: number }): boolean =>
  item.minStock != null && item.minStock > 0 && item.currentStock <= item.minStock;

export const BUSINESS_TYPE_LABEL: Record<string, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  food_truck: "Food Truck",
  kiosk: "Kiosk",
  bakery: "Bakery",
  franchise: "Franchise",
};

export const QUICK_CASH = [50, 100, 200, 500, 1000, 2000];

export const PAY_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  split: "Split",
};

export const SERVICE_LABEL: Record<string, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

export function cn(
  ...classes: (string | false | undefined | null)[]
): string {
  return classes.filter(Boolean).join(" ");
}

// ── Permission foundation ─────────────────────────────────────────────────────
// Single source of truth for role-based access.
// UI visibility and data-layer guards must both call canPerform() so they
// can never diverge.

import type { UserSession } from "@/lib/types";

type Permission =
  | "placeOrder"
  | "manageMenu"
  | "manageSettings"
  | "voidOrder"
  | "viewReports"
  | "manageStock";

const OWNER_ONLY: Permission[] = [
  "manageMenu",
  "manageSettings",
  "voidOrder",
  "viewReports",
  "manageStock",
];

export function canPerform(
  action: Permission,
  session: UserSession | null | undefined
): boolean {
  if (!session) return false;
  if (session.role === "owner") return true;
  // cashier: only non-destructive POS operations
  return !OWNER_ONLY.includes(action);
}

// ── Payment reconciliation validator (Phase 7B) ───────────────────────────────
/**
 * Validates that an order's payment captures match its total.
 * Returns null if valid, or an error description string.
 */
export function validatePaymentReconciliation(order: import("@/lib/types").Order): string | null {
  const { totalPaise, paymentMethod, splitPayment, cashReceivedPaise } = order;

  if (totalPaise < 0) return `Negative total: ${totalPaise}`;

  if (paymentMethod === "split") {
    if (!splitPayment) return "Split payment missing split details";
    const captured = (splitPayment.cashPaise ?? 0) + (splitPayment.upiPaise ?? 0);
    // 1 paise tolerance for rounding
    if (captured < totalPaise - 1) return `Split underpayment: captured ${captured}, total ${totalPaise}`;
    return null;
  }

  if (paymentMethod === "cash" && cashReceivedPaise !== undefined) {
    if (cashReceivedPaise < totalPaise) {
      return `Cash underpayment: received ${cashReceivedPaise}, total ${totalPaise}`;
    }
  }

  return null;
}

/**
 * Validate that a TableOrder is internally consistent.
 * Returns null if valid, or error string.
 */
export function validateTableOrderInvariants(order: import("@/lib/types").TableOrder): string | null {
  if (order.totalPaise < 0) return `Negative total on table ${order.tableId}`;
  if (order.subtotalPaise < 0) return `Negative subtotal on table ${order.tableId}`;
  if (order.discountPaise < 0) return `Negative discount on table ${order.tableId}`;
  if (order.version < 1) return `Invalid version on table ${order.tableId}`;
  if (order.status === "AVAILABLE" && order.items.length > 0) {
    return `AVAILABLE table has ${order.items.length} items — impossible state`;
  }
  if (order.status === "OCCUPIED" && order.items.length === 0) {
    return `OCCUPIED table has 0 items — impossible state`;
  }
  return null;
}

/**
 * Safe JSON stringify — never throws.
 */
export function safeJson(val: unknown): string {
  try {
    return JSON.stringify(val);
  } catch {
    return "[unserializable]";
  }
}
