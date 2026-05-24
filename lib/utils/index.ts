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
 */
export const calcDiscount = (
  subtotalPaise: number,
  type: "flat" | "percent",
  value: number
): number => {
  if (!value || value <= 0) return 0;
  if (type === "percent") {
    const pct = Math.min(Math.max(value, 0), 100);
    return Math.round((subtotalPaise * pct) / 100);
  }
  // flat — value is in rupees
  return Math.min(toP(value), subtotalPaise);
};

/**
 * GST on the post-discount taxable amount.
 * GST = (taxableAmount × gstPercent) / 100, rounded to nearest paise.
 */
export const calcGST = (afterDiscountPaise: number, pct: number): number => {
  if (!pct || pct <= 0) return 0;
  return Math.round((afterDiscountPaise * pct) / 100);
};

// ── Sequential bill number — GST-compliant ────────────────────────────────────
// Format: STH-FY26-000001  (FY = Indian financial year ending, Apr–Mar)
// Resets automatically each new financial year.
// Falls back to a random suffix if localStorage is unavailable (SSR / private).
const BILL_COUNTER_KEY = "sth1r_bill_counter";
const BILL_FY_KEY = "sth1r_bill_fy";

function getCurrentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  // Indian FY: April–March. Month >= 4 means we're in the FY that ends next year.
  const fyEnd = month >= 4 ? year + 1 : year;
  return String(fyEnd).slice(2); // e.g. "26" for FY 2025-26
}

export const generateBillNumber = (): string => {
  try {
    const fy = getCurrentFY();
    const storedFY = localStorage.getItem(BILL_FY_KEY) ?? "";
    let counter = parseInt(localStorage.getItem(BILL_COUNTER_KEY) ?? "0", 10);

    if (storedFY !== fy) {
      // New financial year — reset counter
      counter = 0;
      localStorage.setItem(BILL_FY_KEY, fy);
    }

    counter += 1;
    localStorage.setItem(BILL_COUNTER_KEY, String(counter));
    return `STH-FY${fy}-${String(counter).padStart(6, "0")}`;
  } catch {
    // Fallback: random suffix (SSR / private browsing)
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

export const todayStr = (): string => new Date().toISOString().slice(0, 10);

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
