"use client";
import React from "react";
import type { RawMaterial } from "@/lib/types";

interface Props {
  items: RawMaterial[];
}

export default function InventoryTable({ items }: Props) {
  if (items.length === 0) {
    return (
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
        No reorder signals right now. Stock levels look healthy.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            // INVENTORY · REORDER INTELLIGENCE
          </div>
          <div style={{ color: "white", fontSize: 16, fontWeight: 700, marginTop: 4 }}>
            Stock, variance &amp; vendor lead-times
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#4A6A58" }}>{items.length} reorder signals</div>
      </div>

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
              {["ITEM", "ON HAND", "REORDER AT", "WEEKLY USE", "VENDOR", "CONFIDENCE", "ACTION"].map(
                (h) => (
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
                )
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr
                key={item.id}
                style={{
                  borderBottom: idx === items.length - 1 ? "none" : "1px solid #2A3D30",
                }}
              >
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ color: "white", fontSize: 14, fontWeight: 700 }}>{item.name}</div>
                  <div style={{ color: "#4A6A58", fontSize: 10, textTransform: "uppercase", marginTop: 2 }}>
                    {item.name}
                  </div>
                </td>
                <td
                  style={{
                    padding: "12px 16px",
                    color: item.currentStock < (item.minStock ?? 0) ? "#EF4444" : "white",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.currentStock} {item.unit}
                </td>
                <td style={{ padding: "12px 16px", color: "#A8C4B0", fontSize: 13, whiteSpace: "nowrap" }}>
                  {item.minStock ?? 0} {item.unit}
                </td>
                <td style={{ padding: "12px 16px", color: "#4A6A58", fontSize: 13 }}>
                  Not tracked yet
                </td>
                <td style={{ padding: "12px 16px", color: "#4A6A58", fontSize: 13 }}>—</td>
                <td style={{ padding: "12px 16px" }}>
                  <span
                    style={{
                      background: "#0D2B1A",
                      border: "1px solid #00C896",
                      color: "#00C896",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 999,
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ● CONFIRMED
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <button
                    style={{
                      background: "#00C896",
                      color: "#0A1A0F",
                      fontWeight: 700,
                      padding: "6px 16px",
                      borderRadius: 8,
                      border: "none",
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ⟳ Reorder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
