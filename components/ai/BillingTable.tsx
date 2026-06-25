"use client";
import React, { useMemo, useState } from "react";
import type { Order } from "@/lib/types";
import type { Leak } from "@/components/ai/LeakEngine";
import { fmtRupee, fmtTime, PAY_LABEL } from "@/lib/utils";

interface Props {
  orders: Order[];
  leaks: Leak[];
}

// Maps a bill to the first leak rule that flagged it, for a one-line reason.
const FLAG_LABELS: Record<Leak["type"], string> = {
  discount_anomaly: "Unusual discount vs daily average",
  refund_no_pin: "Refund processed without manager PIN",
  aggregator_mismatch: "Aggregator promo fee mismatch",
  low_stock: "Low stock signal",
  high_void_rate: "Voided — part of high void-rate signal",
};

function channelLabel(order: Order): string {
  if (order.serviceMode === "delivery") return "Zomato/Swiggy";
  if (order.serviceMode === "takeaway") return "Takeaway";
  return "Dine-in";
}

export default function BillingTable({ orders, leaks }: Props) {
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const billNumberToFlag = useMemo(() => {
    const map = new Map<string, string>();
    for (const leak of leaks) {
      for (const billNumber of leak.billIds) {
        if (!map.has(billNumber)) {
          map.set(billNumber, FLAG_LABELS[leak.type]);
        }
      }
    }
    return map;
  }, [leaks]);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders]
  );

  const flaggedCount = sortedOrders.filter((o) => billNumberToFlag.has(o.billNumber)).length;
  const visibleOrders = onlyFlagged
    ? sortedOrders.filter((o) => billNumberToFlag.has(o.billNumber))
    : sortedOrders;

  const revenueToday = sortedOrders.reduce((s, o) => s + o.totalPaise, 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            // BILLING · TODAY
          </div>
          <div style={{ color: "white", fontSize: 16, fontWeight: 700, marginTop: 4 }}>
            Live bills, anomalies flagged
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase" }}>REVENUE TODAY</div>
            <div style={{ color: "white", fontSize: 16, fontWeight: 700 }}>{fmtRupee(revenueToday)}</div>
          </div>
          <button
            onClick={() => setOnlyFlagged((v) => !v)}
            style={{
              background: onlyFlagged ? "#00C896" : "transparent",
              border: "1px solid #00C896",
              color: onlyFlagged ? "#0A1A0F" : "#00C896",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ONLY FLAGGED ({flaggedCount})
          </button>
        </div>
      </div>

      {visibleOrders.length === 0 ? (
        <div
          style={{
            background: "#1C2D24",
            border: "1px solid #2A3D30",
            borderRadius: 12,
            padding: 24,
            color: "#A8C4B0",
            fontSize: 14,
          }}
        >
          {onlyFlagged ? "No flagged bills today." : "No bills recorded today yet."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "#1C2D24",
              borderRadius: 12,
            }}
          >
            <thead>
              <tr>
                {["BILL", "TIME", "CHANNEL", "ITEMS", "DISCOUNT", "TOTAL", "FLAG"].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontSize: 10,
                      color: "#4A6A58",
                      textTransform: "uppercase",
                      padding: "12px 16px",
                      borderBottom: "1px solid #2A3D30",
                      textAlign: "left",
                      fontWeight: 400,
                      letterSpacing: "0.08em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order, idx) => {
                const flag = billNumberToFlag.get(order.billNumber);
                return (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: idx === visibleOrders.length - 1 ? "none" : "1px solid #2A3D30",
                    }}
                  >
                    <td style={{ padding: "12px 16px", color: "white", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {order.billNumber}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#A8C4B0", fontSize: 13, whiteSpace: "nowrap" }}>
                      {fmtTime(order.createdAt)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#00C896", fontSize: 13, whiteSpace: "nowrap" }}>
                      {channelLabel(order)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#A8C4B0", fontSize: 13 }}>
                      {order.items.reduce((s, i) => s + i.qty, 0)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#A8C4B0", fontSize: 13, whiteSpace: "nowrap" }}>
                      {fmtRupee(order.discountPaise)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "white", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {fmtRupee(order.totalPaise)}
                    </td>
                    <td style={{ padding: "12px 16px", color: flag ? "#D4B106" : "#4A6A58", fontSize: 12 }}>
                      {flag ?? PAY_LABEL[order.paymentMethod] ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
