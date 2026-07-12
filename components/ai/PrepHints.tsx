"use client";
import React, { useMemo } from "react";
import type { Order } from "@/lib/types";
import { CalendarDays, Info } from "lucide-react";
import { todayStr } from "@/lib/utils";

/**
 * G7 v1 — Prep Hints: same-weekday demand averages.
 *
 * Honest scope: this is descriptive statistics, not forecasting. For each
 * menu item it averages quantities sold on the SAME weekday over the last
 * few weeks and labels every number with its sample size ("based on 3
 * Wednesdays"). No trend models, no seasonality claims, no invented
 * precision. It becomes a real forecast engine later — this version is
 * already enough to calibrate tonight's prep.
 */

interface Props {
  /** Non-voided orders, ideally last 30 days */
  orders: Order[];
}

interface HintRow {
  name: string;
  avgQty: number;
  minQty: number;
  maxQty: number;
  daysWithData: number;
}

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function PrepHints({ orders }: Props) {
  const todayDow = new Date().getDay();
  const todayLabel = WEEKDAY_LABELS[todayDow];
  const todayKey = todayStr();

  const { rows, weekdayCount } = useMemo(() => {
    // Group past same-weekday orders by calendar date (exclude today —
    // it's still in progress and would drag averages down).
    const byDate = new Map<string, Order[]>();
    for (const o of orders) {
      if (o.status === "voided") continue;
      const d = new Date(o.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getDay() !== todayDow) continue;
      const key = o.createdAt.slice(0, 10);
      if (key === todayKey) continue;
      const arr = byDate.get(key) ?? [];
      arr.push(o);
      byDate.set(key, arr);
    }

    const dates = Array.from(byDate.keys()).sort().slice(-4); // up to last 4 same-weekdays
    if (dates.length === 0) return { rows: [] as HintRow[], weekdayCount: 0 };

    // qty per item per date
    const perItem = new Map<string, number[]>(); // name -> qty per counted date
    for (const date of dates) {
      const dayTotals = new Map<string, number>();
      for (const o of byDate.get(date) ?? []) {
        for (const it of o.items) {
          dayTotals.set(it.name, (dayTotals.get(it.name) ?? 0) + it.qty);
        }
      }
      for (const [name, qty] of Array.from(dayTotals.entries())) {
        const arr = perItem.get(name) ?? [];
        arr.push(qty);
        perItem.set(name, arr);
      }
    }

    const rows: HintRow[] = Array.from(perItem.entries())
      .map(([name, qtys]) => ({
        name,
        avgQty: Math.round((qtys.reduce((s, q) => s + q, 0) / qtys.length) * 10) / 10,
        minQty: Math.min(...qtys),
        maxQty: Math.max(...qtys),
        daysWithData: qtys.length,
      }))
      .sort((a, b) => b.avgQty - a.avgQty)
      .slice(0, 12);

    return { rows, weekdayCount: dates.length };
  }, [orders, todayDow, todayKey]);

  if (rows.length === 0) {
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
            No past {todayLabel}s on record yet
          </div>
          <div style={{ color: "#A8C4B0", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
            Prep hints average what you sold on previous {todayLabel}s. After one more week
            of billing through Sth1r, this screen will tell you how much of each item to
            prep today — with the sample size shown next to every number.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {"// PREP HINTS"}
        </div>
        <div style={{ color: "white", fontSize: 16, fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarDays size={16} color="#00C896" />
          Today is {todayLabel} — averages from your last {weekdayCount}{" "}
          {todayLabel}
          {weekdayCount > 1 ? "s" : ""}
        </div>
        <div style={{ fontSize: 11, color: "#4A6A58", marginTop: 4 }}>
          Descriptive averages, not a forecast — every row shows its own sample size.
          {weekdayCount < 3 ? " Small sample: treat as a rough starting point." : ""}
        </div>
      </div>

      <div
        style={{
          background: "#1C2D24",
          border: "1px solid #2A3D30",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {rows.map((r, i) => (
          <div
            key={r.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 18px",
              borderBottom: i === rows.length - 1 ? "none" : "1px solid #2A3D30",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: "white",
                  fontSize: 14,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {r.name}
              </div>
              <div style={{ fontSize: 11, color: "#4A6A58", marginTop: 2 }}>
                range {r.minQty}–{r.maxQty} · based on {r.daysWithData} {todayLabel}
                {r.daysWithData > 1 ? "s" : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 700,
                  fontSize: 20,
                  color: "#00C896",
                }}
              >
                ~{r.avgQty}
              </div>
              <div style={{ fontSize: 10, color: "#4A6A58" }}>avg sold</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
