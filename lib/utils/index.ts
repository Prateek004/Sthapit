export const HIDE_FRANCHISE = true;

export const toP = (rupee: number): number => Math.round(rupee * 100);
export const toR = (paise: number): number => paise / 100;

export const fmtRupee = (paise: number): string =>
  "₹" +
  (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
  return Math.min(toP(value), subtotalPaise);
};

export const calcGST = (afterDiscountPaise: number, pct: number): number => {
  if (!pct || pct <= 0) return 0;
  return Math.round((afterDiscountPaise * pct) / 100);
};

// Sequential bill number — GST-compliant, resets each financial year
// Format: STH-FY26-000001  (FY = financial year ending, e.g. FY26 = Apr 2025–Mar 2026)
const BILL_COUNTER_KEY = "sth1r_bill_counter";
const BILL_FY_KEY = "sth1r_bill_fy";

function getCurrentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  // Indian FY: Apr–Mar. If month >= 4, FY ends next year; else this year.
  const fyEnd = month >= 4 ? year + 1 : year;
  return String(fyEnd).slice(2); // "26" for FY2025-26
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
    // Fallback if localStorage is unavailable (SSR, private mode)
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
