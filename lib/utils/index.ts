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

// Unique bill numbers — date prefix + 6-char random suffix
export const generateBillNumber = (): string => {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `SV${yy}${mm}${dd}-${rand}`;
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
