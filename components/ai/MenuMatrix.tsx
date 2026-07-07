"use client";
import React, { useMemo } from "react";
import type { Order, MenuItem } from "@/lib/types";
import { fmtRupee } from "@/lib/utils";
import { Star, Puzzle, Truck, CircleSlash, Info } from "lucide-react";

/**
 * Menu Engineering Matrix (strategy doc F2).
 * Classifies every menu item with cost-price data into:
 *   Stars      — high margin, high sales  → promote harder
 *   Puzzles    — high margin, low sales   → make visible
 *   Plowhorses — low margin, high sales   → reprice / cut cost
 *   Dogs       — low margin, low sales    → remove or rework
 *
 * Popularity split = median units sold among selling items.
 * Margin split     = 30% gross-margin floor (same benchmark as LeakEngine).
 * Runs entirely locally on IDB data — zero network calls.
 */

interface Props {
  /** Recent orders (recommended: last 30 days, voided excluded) */
  orders: Order[];
  menuItems: MenuItem[];
  windowLabel?: string;
}

type Quadrant = "star" | "puzzle" | "plowhorse" | "dog";

interface ItemStat {
  id: string;
  name: string;
  qty: number;
  revenuePaise: number;
  marginPct: number;
  quadrant: Quadrant;
}

const MARGIN_FLOOR = 30; // percent

const QUADRANTS: {
  id: Quadrant;
  label: string;
  Icon: typeof Star;
  color: string;
  action: string;
}[] = [
  { id: "star", label: "STARS", Icon: Star, color: "#00C896", action: "High margin, high sales — give these prime menu placement and staff push." },
  { id: "puzzle", label: "PUZZLES", Icon: Puzzle, color: "#38BDF8", action: "High margin, low sales — make them visible: photos, combos, first page." },
  { id: "plowhorse", label: "PLOWHORSES", Icon: Truck, color: "#D4B106", action: "Low margin, high sales — raise price slightly or cut portion cost." },
  { id: "dog", label: "DOGS", Icon: CircleSlash, color: "#EF4444", action: "Low margin, low sales — remove, rework, or bundle away." },
];

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export default function MenuMatrix({ orders, menuItems, windowLabel = "last 30 days" }: Props) {
  const { stats, noCostCount, totalWithCost } = useMemo(() => {
    const qtyMap = new Map<string, number>();
    const revMap = new Map<string, number>();
    for (const o of orders) {
      if (o.status === "voided") continue;
      for (const it of o.items) {
        qtyMap.set(it.menuItemId, (qtyMap.get(it.menuItemId) ?? 0) + it.qty);
        revMap.set(
          it.menuItemId,
          (revMap.get(it.menuItemId) ?? 0) + it.unitPricePaise * it.qty
        );
      }
    }

    const withCost: Omit<ItemStat, "quadrant">[] = [];
    let noCost = 0;
    for (const mi of menuItems) {
      const qty = qtyMap.get(mi.id) ?? 0;
      const rev = revMap.get(mi.id) ?? 0;
      const cost = mi.costPricePaise ?? 0;
      if (cost <= 0) {
        if (qty > 0) noCost += 1; // selling items missing cost data
        continue;
      }
      if (qty <= 0 || rev <= 0) continue; // silent items handled by LeakEngine
      const marginPct = Math.round(((rev - cost * qty) / rev) * 100);
      withCost.push({ id: mi.id, name: mi.name, qty, revenuePaise: rev, marginPct });
    }

    const popSplit = median(withCost.map((s) => s.qty));
    const stats: ItemStat[] = withCost
      .map((s) => {
        const popular = s.qty >= popSplit && popSplit > 0;
        const profitable = s.marginPct >= MARGIN_FLOOR;
        const quadrant: Quadrant = profitable
          ? popular
            ? "star"
            : "puzzle"
          : popular
          ? "plowhorse"
          : "dog";
        return { ...s, quadrant };
      })
      .sort((a, b) => b.revenuePaise - a.revenuePaise);

    return { stats, noCostCount: noCost, totalWithCost: withCost.length };
  }, [orders, menuItems]);

  if (totalWithCost === 0) {
    return (
      <div
        style={{
          background: "#1C2D24",
          border: "1px solid #2A3D30",
          borderRadius: 12,
          padding: 24,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <Info size={18} color="#D4B106" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ color: "white", fontSize: 15, fontWeight: 700 }}>
            Menu Matrix needs cost prices
          </div>
          <div style={{ color: "#A8C4B0", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
            Add a cost price to your menu items (Menu → edit item → cost price) and this
            screen will sort your entire menu into Stars, Puzzles, Plowhorses and Dogs —
            so you know exactly what to promote, reprice, or drop. One-time entry,
            approximate values are fine.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {"// MENU ENGINEERING MATRIX"}
          </div>
          <div style={{ color: "white", fontSize: 16, fontWeight: 700, marginTop: 4 }}>
            {totalWithCost} items classified · {windowLabel}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#4A6A58" }}>
          Split: median sales volume × {MARGIN_FLOOR}% margin floor
        </div>
      </div>

      {noCostCount > 0 && (
        <div
          style={{
            background: "#2B260D",
            border: "1px solid #D4B106",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 12,
            color: "#D4B106",
          }}
        >
          {noCostCount} selling item(s) have no cost price yet — they are excluded.
          Add cost prices in Menu to classify them.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 16 }}>
        {QUADRANTS.map(({ id, label, Icon, color, action }) => {
          const items = stats.filter((s) => s.quadrant === id);
          return (
            <div
              key={id}
              style={{
                background: "#1C2D24",
                border: "1px solid #2A3D30",
                borderTop: `2px solid ${color}`,
                borderRadius: 12,
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon size={15} color={color} />
                  <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.1em" }}>
                    {label}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "#4A6A58" }}>{items.length} items</span>
              </div>

              <div style={{ fontSize: 11, color: "#6B8F7A", lineHeight: 1.5 }}>{action}</div>

              {items.length === 0 ? (
                <div style={{ fontSize: 12, color: "#4A6A58", padding: "6px 0" }}>None right now.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {items.slice(0, 6).map((s, idx) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "8px 0",
                        borderBottom:
                          idx === Math.min(items.length, 6) - 1 ? "none" : "1px solid #2A3D30",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            color: "white",
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s.name}
                        </div>
                        <div style={{ fontSize: 11, color: "#4A6A58" }}>
                          {s.qty} sold · {fmtRupee(s.revenuePaise)}
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: "'Syne', sans-serif",
                          fontWeight: 700,
                          fontSize: 15,
                          color,
                          flexShrink: 0,
                        }}
                      >
                        {s.marginPct}%
                      </div>
                    </div>
                  ))}
                  {items.length > 6 && (
                    <div style={{ fontSize: 11, color: "#4A6A58", paddingTop: 8 }}>
                      + {items.length - 6} more
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
