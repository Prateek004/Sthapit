"use client";
import React, { useState, useEffect } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { detectLeaks, Leak } from "@/components/ai/LeakEngine";
import SthappitChat from "@/components/ai/SthappitChat";
import { fmtRupee, todayStr } from "@/lib/utils";
import { dbGetAllOrders, dbGetAllRawMaterials } from "@/lib/db";
import { AlertTriangle, TrendingDown, Package, CheckCircle, Clock } from "lucide-react";
import type { Order, RawMaterial } from "@/lib/types";

function ConfidencePill({ confidence }: { confidence: "Confirmed" | "Estimated" }) {
  if (confidence === "Confirmed") {
    return (
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
        }}
      >
        ● CONFIRMED
      </span>
    );
  }
  return (
    <span
      style={{
        background: "#2B260D",
        border: "1px solid #D4B106",
        color: "#D4B106",
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 999,
        letterSpacing: "0.04em",
      }}
    >
      ● ESTIMATED
    </span>
  );
}

function leakIcon(type: Leak["type"]) {
  switch (type) {
    case "discount_anomaly":
    case "refund_no_pin":
      return AlertTriangle;
    case "aggregator_mismatch":
      return TrendingDown;
    case "low_stock":
    case "high_void_rate":
      return Package;
    default:
      return AlertTriangle;
  }
}

export default function AiDashboardPage() {
  const { state } = useApp();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [leaks, setLeaks] = useState<Leak[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const uid = state.session?.businessId ?? "default";
      const [orders, materials] = await Promise.all([
        dbGetAllOrders(uid),
        dbGetAllRawMaterials(uid),
      ]);
      if (cancelled) return;
      const today = todayStr();
      const todayOrders = orders.filter(
        (o) => o.createdAt.startsWith(today) && o.status !== "voided"
      );
      setAllOrders(todayOrders);
      setRawMaterials(materials);
      setLeaks(detectLeaks(orders, materials));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalRevenuePaise = allOrders.reduce((s, o) => s + o.totalPaise, 0);
  const totalLeakPaise = leaks.reduce((s, l) => s + l.impactPaise, 0);
  const confirmedLeaks = leaks.filter((l) => l.confidence === "Confirmed");
  const avgTicketPaise =
    allOrders.length > 0 ? Math.round(totalRevenuePaise / allOrders.length) : 0;
  const dataConfidence =
    leaks.length > 0 ? Math.round((confirmedLeaks.length / leaks.length) * 100) : 78;
  const lowStockItems = rawMaterials.filter(
    (r) => (r.minStock ?? 0) > 0 && r.currentStock <= (r.minStock ?? 0) * 1.5
  );

  if (loading) {
    return (
      <AppShell>
        <div
          style={{
            minHeight: "100dvh",
            background: "#0A1A0F",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="animate-spin rounded-full border-2 border-t-transparent"
            style={{ width: 32, height: 32, borderColor: "white", borderTopColor: "transparent" }}
          />
        </div>
      </AppShell>
    );
  }

  const topLeak = leaks.length > 0 ? leaks[0] : null;

  return (
    <AppShell>
      <div
        style={{
          minHeight: "100dvh",
          background: "#0A1A0F",
          color: "white",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div
          className="grid grid-cols-1 lg:grid-cols-[1fr_380px]"
          style={{ minHeight: "100dvh" }}
        >
          <div
            className="lg:h-[100dvh] lg:overflow-y-auto"
            style={{
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* SECTION A — Header row */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 700,
                    fontSize: 22,
                    color: "white",
                    letterSpacing: "-0.02em",
                  }}
                >
                  STHAPPIT
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#4A6A58",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    marginTop: 4,
                  }}
                >
                  PROFIT CONTROL · LIVE
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, color: "white" }}>
                  {state.session?.businessName ?? ""}
                </div>
                <div style={{ fontSize: 12, color: "#4A6A58" }}>Karol Bagh, Delhi · North Indian</div>
              </div>
            </div>

            {/* SECTION B — KPI bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 16 }}>
              <div
                style={{
                  background: "#1C2D24",
                  border: "1px solid #2A3D30",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  TODAY REVENUE
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 28, color: "white", marginTop: 6 }}>
                  {fmtRupee(totalRevenuePaise)}
                </div>
                <div style={{ fontSize: 11, color: "#4A6A58", marginTop: 4 }}>
                  {allOrders.length} covers
                </div>
              </div>

              <div
                style={{
                  background: "#1C2D24",
                  border: "1px solid #2A3D30",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  LEAKS DETECTED
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 28, color: "#EF4444", marginTop: 6 }}>
                  {fmtRupee(totalLeakPaise)}
                </div>
                <div style={{ fontSize: 11, color: "#4A6A58", marginTop: 4 }}>
                  {confirmedLeaks.length} confirmed
                </div>
              </div>

              <div
                style={{
                  background: "#1C2D24",
                  border: "1px solid #2A3D30",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  DATA CONFIDENCE
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 28, color: "#00C896", marginTop: 6 }}>
                  {dataConfidence}%
                </div>
                <div style={{ fontSize: 11, color: "#4A6A58", marginTop: 4 }}>
                  {leaks.length} signals
                </div>
              </div>

              <div
                style={{
                  background: "#1C2D24",
                  border: "1px solid #2A3D30",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  AVG TICKET
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 28, color: "white", marginTop: 6 }}>
                  {fmtRupee(avgTicketPaise)}
                </div>
                <div style={{ fontSize: 11, color: "#4A6A58", marginTop: 4 }}>
                  {allOrders.length}/day avg
                </div>
              </div>
            </div>

            {/* SECTION C — Next Best Action */}
            {topLeak && (
              <div
                style={{
                  background: "#1C2D24",
                  border: "1px solid #00C896",
                  borderRadius: 16,
                  padding: 24,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        background: "#00C896",
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <AlertTriangle size={12} color="#0A1A0F" />
                    </div>
                    <span style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      // NEXT BEST ACTION
                    </span>
                    <ConfidencePill confidence={topLeak.confidence} />
                    <span style={{ fontSize: 11, color: "#4A6A58", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={11} /> ~3 min effort
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      RECOVER / WEEK
                    </div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 32, color: "white" }}>
                      {fmtRupee(topLeak.impactPaise)}
                    </div>
                  </div>
                </div>

                <div style={{ color: "white", fontSize: 24, fontWeight: 700, marginTop: 16 }}>
                  {topLeak.title}
                </div>
                <div style={{ color: "#6B8F7A", fontSize: 14, marginTop: 8 }}>
                  {topLeak.why}
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                  <button
                    style={{
                      background: "#00C896",
                      color: "#0A1A0F",
                      fontWeight: 700,
                      padding: "12px 20px",
                      borderRadius: 10,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    Act on this →
                  </button>
                  <button
                    style={{
                      background: "transparent",
                      border: "1px solid #2A3D30",
                      color: "#6B8F7A",
                      padding: "12px 20px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    SEE ALL LEAKS
                  </button>
                </div>
              </div>
            )}

            {/* SECTION D — Profit Leak Ledger */}
            {leaks.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      // PROFIT LEAK LEDGER
                    </div>
                    <div style={{ color: "white", fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                      Ranked by recoverable rupees
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase" }}>
                      TOTAL IMPACT
                    </div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: "white" }}>
                      {fmtRupee(totalLeakPaise)}
                    </div>
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
                  {leaks.map((leak, idx) => {
                    const Icon = leakIcon(leak.type);
                    return (
                      <div
                        key={leak.id}
                        style={{
                          padding: "16px 20px",
                          borderBottom: idx === leaks.length - 1 ? "none" : "1px solid #2A3D30",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <Icon size={16} color="#EF4444" />
                            <span style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              {leak.type.replace(/_/g, " ")}
                            </span>
                            <ConfidencePill confidence={leak.confidence} />
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase" }}>IMPACT</div>
                            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: "#EF4444" }}>
                              {fmtRupee(leak.impactPaise)}
                            </div>
                          </div>
                        </div>

                        <div style={{ color: "white", fontSize: 15, fontWeight: 600, marginTop: 4 }}>
                          {leak.title}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 16, marginTop: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase" }}>WHY</div>
                            <div style={{ color: "#A8C4B0", fontSize: 13, marginTop: 2 }}>{leak.why}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase" }}>NEXT ACTION</div>
                            <div style={{ color: "#A8C4B0", fontSize: 13, marginTop: 2 }}>{leak.nextAction}</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                          <button
                            style={{
                              background: "#0D2B1A",
                              border: "1px solid #00C896",
                              color: "#00C896",
                              padding: "6px 14px",
                              borderRadius: 8,
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            ✓ Resolve
                          </button>
                          <button
                            style={{
                              background: "transparent",
                              border: "1px solid #2A3D30",
                              color: "#4A6A58",
                              padding: "6px 14px",
                              borderRadius: 8,
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            ⏸ Snooze
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION E — Inventory Reorder Intelligence */}
            {lowStockItems.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    // INVENTORY · REORDER INTELLIGENCE
                  </div>
                  <div style={{ fontSize: 11, color: "#4A6A58" }}>
                    {lowStockItems.length} reorder signals
                  </div>
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
                        {["ITEM", "ON HAND", "REORDER AT", "VENDOR", "CONFIDENCE", "ACTION"].map((h) => (
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
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockItems.map((item, idx) => (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: idx === lowStockItems.length - 1 ? "none" : "1px solid #2A3D30",
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
                            }}
                          >
                            {item.currentStock} {item.unit}
                          </td>
                          <td style={{ padding: "12px 16px", color: "#A8C4B0", fontSize: 13 }}>
                            {item.minStock ?? 0} {item.unit}
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
            )}

            {leaks.length === 0 && (
              <div
                style={{
                  background: "#1C2D24",
                  border: "1px solid #2A3D30",
                  borderRadius: 12,
                  padding: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <CheckCircle size={20} color="#00C896" />
                <div style={{ color: "#A8C4B0", fontSize: 14 }}>
                  No leaks detected today. Profit looks clean — keep it that way.
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div
            className="lg:h-[100dvh]"
            style={{ height: 500, overflow: "hidden" }}
          >
            <SthappitChat
              orders={allOrders}
              rawMaterials={rawMaterials}
              businessName={state.session?.businessName ?? ""}
              leaks={leaks}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
