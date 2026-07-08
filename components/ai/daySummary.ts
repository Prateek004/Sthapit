import type { Order } from "@/lib/types";
import type { Leak } from "@/components/ai/LeakEngine";
import { fmtRupee } from "@/lib/utils";

/**
 * Builds the end-of-day WhatsApp summary (strategy doc F4).
 * Pure function — computes ONLY from real order data passed in.
 * Nothing here is estimated except leak impacts, which carry their
 * own confidence labels from the LeakEngine.
 *
 * v1 is MANUAL: the owner taps the button and picks a WhatsApp chat.
 * Scheduled push requires a server-side notification service that
 * does not exist yet.
 */
export function buildDaySummaryText(params: {
  businessName: string;
  /** Today's completed (non-voided) orders */
  orders: Order[];
  /** Count of today's voided orders */
  voidedCount: number;
  /** Total value of today's voided orders, paise */
  voidedPaise: number;
  /** Current detected leaks (already sorted by impact) */
  leaks: Leak[];
  /** Real gross margin % or null when no cost data exists */
  grossMarginPct: number | null;
}): string {
  const { businessName, orders, voidedCount, voidedPaise, leaks, grossMarginPct } =
    params;

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const revenuePaise = orders.reduce((s, o) => s + o.totalPaise, 0);
  const discountPaise = orders.reduce((s, o) => s + o.discountPaise, 0);
  const subtotalPaise = orders.reduce((s, o) => s + o.subtotalPaise, 0);
  const discountPct =
    subtotalPaise > 0 ? Math.round((discountPaise / subtotalPaise) * 100) : 0;
  const avgTicketPaise =
    orders.length > 0 ? Math.round(revenuePaise / orders.length) : 0;

  // Top 3 items by quantity sold
  const qtyByName = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items) {
      qtyByName.set(it.name, (qtyByName.get(it.name) ?? 0) + it.qty);
    }
  }
  const topItems = Array.from(qtyByName.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const lines: string[] = [];
  lines.push(`*${businessName} — Day Summary*`);
  lines.push(dateLabel);
  lines.push("");
  lines.push(`Revenue: *${fmtRupee(revenuePaise)}* (${orders.length} orders)`);
  lines.push(`Avg ticket: ${fmtRupee(avgTicketPaise)}`);
  if (grossMarginPct !== null) {
    lines.push(`Gross margin: ${grossMarginPct}%`);
  }
  if (discountPaise > 0) {
    lines.push(`Discounts: ${fmtRupee(discountPaise)} (${discountPct}% of sales)`);
  }
  if (voidedCount > 0) {
    lines.push(`Voids: ${voidedCount} (${fmtRupee(voidedPaise)})`);
  }

  if (topItems.length > 0) {
    lines.push("");
    lines.push("*Top items:*");
    for (const [name, qty] of topItems) {
      lines.push(`• ${name} × ${qty}`);
    }
  }

  if (leaks.length > 0) {
    const top = leaks[0];
    lines.push("");
    lines.push("*Profit leak alert:*");
    lines.push(
      `${top.title} — impact ${fmtRupee(top.impactPaise)} (${top.confidence})`
    );
    if (leaks.length > 1) {
      lines.push(`+${leaks.length - 1} more in the STHAPPIT dashboard`);
    }
  }

  lines.push("");
  lines.push("— sent from Sth1r");
  return lines.join("\n");
}

/** Opens WhatsApp share with the summary text. Owner picks the recipient. */
export function shareDaySummaryOnWhatsApp(text: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}
