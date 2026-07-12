"use client";
import React, { useState, useEffect } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { fmtRupee, todayStr, dateStrIST, PAY_LABEL } from "@/lib/utils";
import type { Order } from "@/lib/types";
import { Banknote, Smartphone, ShoppingBag, Bell, Printer } from "lucide-react";

function DonutChart({ segments }: { segments: { color: string; value: number }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 46, circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((seg) => {
    const len = (seg.value / total) * circ;
    const arc = { color: seg.color, dasharray: `${len} ${circ - len}`, dashoffset: -offset };
    offset += len;
    return arc;
  });
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#F0E8DF" strokeWidth="18" />
      {arcs.map((arc, i) => (
        <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={arc.color}
          strokeWidth="18" strokeDasharray={arc.dasharray} strokeDashoffset={arc.dashoffset}
          strokeLinecap="round" />
      ))}
    </svg>
  );
}

function SparkBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 28, gap = 4, H = 48;
  const totalW = values.length * (w + gap) - gap;
  return (
    <svg width={totalW} height={H} viewBox={`0 0 ${totalW} ${H}`}>
      {values.map((v, i) => {
        const barH = Math.max(4, (v / max) * H);
        return <rect key={i} x={i * (w + gap)} y={H - barH} width={w} height={barH} rx="3"
          fill={i === values.length - 1 ? "#E8590C" : "#FAD4BA"} />;
      })}
    </svg>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function dayLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function DashboardPage() {
  const { state } = useApp();
  const uid = state.session?.businessId ?? "default";
  const [allOrders, setAllOrders] = useState<Order[]>([]);

  useEffect(() => {
    import("@/lib/db").then(({ dbGetAllOrders }) => dbGetAllOrders(uid).then(setAllOrders));
  }, [state.orders, uid]);

  const today = todayStr();
  const todayOrders = allOrders.filter((o) => dateStrIST(o.createdAt) === today);
  // P1-07: exclude voided orders from all revenue
  const todayValid = todayOrders.filter((o) => o.status !== "voided");
  const allValid   = allOrders.filter((o) => o.status !== "voided");
  const todaySales = todayValid.reduce((s, o) => s + o.totalPaise, 0);
  const totalSales = allValid.reduce((s, o) => s + o.totalPaise, 0);
  const totalOrders = allValid.length;
  const avgOrder = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

  // P0-10: shift summary data
  const todayCash  = todayValid.filter((o) => o.paymentMethod === "cash" || (o.paymentMethod === "split" && o.splitPayment))
    .reduce((s, o) => s + (o.paymentMethod === "split" ? (o.splitPayment?.cashPaise ?? 0) : o.totalPaise), 0);
  const todayUpi   = todayValid.filter((o) => o.paymentMethod === "upi" || (o.paymentMethod === "split" && o.splitPayment))
    .reduce((s, o) => s + (o.paymentMethod === "split" ? (o.splitPayment?.upiPaise ?? 0) : o.totalPaise), 0);
  const todayGst   = todayValid.reduce((s, o) => s + (o.gstPaise ?? 0), 0);
  const todayVoids = todayOrders.filter((o) => o.status === "voided").length;

  const byMethod = allValid.reduce<Record<string, number>>((acc, o) => {
    acc[o.paymentMethod] = (acc[o.paymentMethod] ?? 0) + o.totalPaise;
    return acc;
  }, {});

  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  allValid.forEach((o) => o.items.forEach((i) => {
    if (!itemMap[i.menuItemId]) itemMap[i.menuItemId] = { name: i.name, qty: 0, revenue: 0 };
    itemMap[i.menuItemId].qty += i.qty;
    itemMap[i.menuItemId].revenue += i.unitPricePaise * i.qty;
  }));

  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const last7 = allValid.slice(-7).map((o) => Math.round(o.totalPaise / 100));
  const recentOrders = [...allValid].reverse().slice(0, 5);

  const cash = byMethod["cash"] ?? 0;
  const upi = byMethod["upi"] ?? 0;
  const other = totalSales - cash - upi;
  const donutSegs = [
    { color: "#E8590C", value: cash },
    { color: "#F49668", value: upi },
    { color: "#FAD4BA", value: other },
  ].filter((s) => s.value > 0);

  const todayFmt = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const bizName = state.session?.businessName ?? "Business";

  /* ── Brand tokens (aligned with landing page design system) ── */
  const coal   = "#1A1208"; // headlines, primary text
  const smoke  = "#3D2E1E"; // secondary text
  const ash    = "#7A6456"; // tertiary / meta text
  const cream  = "#FEF9F4"; // page background
  const sand   = "#FDF6EE"; // raised neutral surface
  const ember  = "#F0E8DF"; // borders / dividers / chart base
  const fire   = "#E8590C"; // primary accent (saffron)
  const fireDark = "#B83E06";
  const fire50 = "#FEF0E8"; // tinted hover / soft chip
  const veg    = "#2D6A4F"; // positive / success

  const card: React.CSSProperties = {
    background: "white",
    borderRadius: 16,
    border: "1px solid rgba(26,18,8,0.05)",
    boxShadow: "0 2px 8px rgba(26,18,8,0.04)",
    padding: 20,
  };

  return (
    <AppShell>
      <div style={{ background: cream, fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── Greeting row ── */}
        <div className="flex items-center justify-between px-4 sm:px-7 pt-12 lg:pt-7 pb-0">
          <div>
            <div
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 22,
                fontWeight: 700,
                color: coal,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              {greeting()},{" "}
              <span style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontWeight: 400, color: fire }}>
                {bizName}
              </span>
            </div>
            <div style={{ fontSize: 12, color: ash, marginTop: 4, fontWeight: 500 }}>{todayFmt}</div>
          </div>
          <button
            aria-label="Notifications"
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: "1px solid " + ember,
              background: "white", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <Bell size={15} color={smoke} />
          </button>
        </div>

        <div className="px-4 sm:px-7">

          {/* ── Hero revenue card ── */}
          <div style={{ paddingTop: 20 }}>
            <div style={{
              background: coal, borderRadius: 20,
              padding: "28px 24px 24px", position: "relative", overflow: "hidden",
            }}>
              {/* Subtle saffron radial glow — matches landing's hero treatment */}
              <div
                aria-hidden
                style={{
                  position: "absolute", right: -60, top: -60,
                  width: 220, height: 220, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(232,89,12,0.18) 0%, transparent 70%)",
                  pointerEvents: "none",
                }}
              />
              <svg style={{ position: "absolute", right: -20, top: -20, opacity: 0.05 }}
                width="200" height="230" viewBox="0 0 200 230" aria-hidden>
                <polygon points="100,10 185,55 185,175 100,220 15,175 15,55" fill="white" />
              </svg>
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  color: "rgba(255,255,255,0.45)",
                  marginBottom: 10,
                  position: "relative",
                }}
              >
                TODAY&apos;S REVENUE
              </div>
              <div
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 40,
                  fontWeight: 700,
                  color: "white",
                  letterSpacing: "-0.025em",
                  lineHeight: 1,
                  position: "relative",
                }}
              >
                <span style={{ fontSize: 18, color: fire, marginRight: 4, fontWeight: 600 }}>&#8377;</span>
                {(todaySales / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                <span style={{ fontSize: 20, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>.00</span>
              </div>
              <div style={{ fontSize: 12, color: "#7BC47B", marginTop: 10, fontWeight: 500, position: "relative" }}>
                {todayOrders.length} order{todayOrders.length !== 1 ? "s" : ""} today
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap", position: "relative" }}>
                {[
                  ["All Orders", "/orders"],
                  ["Menu", "/menu"],
                  ["Stock", "/stock"],
                  ["Settings", "/settings"],
                ].map(([label, href], i) => (
                  <a key={label} href={href} style={{
                    padding: "8px 14px", fontSize: 12, fontWeight: 600,
                    borderRadius: 8, textDecoration: "none",
                    fontFamily: "'DM Sans', sans-serif",
                    border: `1px solid ${i === 0 ? fire : "rgba(255,255,255,0.12)"}`,
                    color: i === 0 ? "white" : "rgba(255,255,255,0.75)",
                    background: i === 0 ? fire : "rgba(255,255,255,0.06)",
                    transition: "background 0.15s, border-color 0.15s",
                  }}>
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* ── KPI tiles ── */}
          <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 mt-4">
            <div style={card}>
              <div style={{ fontSize: 10, color: ash, letterSpacing: "0.12em", marginBottom: 8, fontWeight: 600 }}>TOTAL REVENUE</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: coal, letterSpacing: "-0.02em" }}>{fmtRupee(totalSales)}</div>
              <div style={{ fontSize: 11, color: veg, marginTop: 4, fontWeight: 500 }}>{totalOrders} orders</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 10, color: ash, letterSpacing: "0.12em", marginBottom: 8, fontWeight: 600 }}>AVG ORDER</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: coal, letterSpacing: "-0.02em" }}>{fmtRupee(avgOrder)}</div>
              <div style={{ fontSize: 11, color: ash, marginTop: 4, fontWeight: 500 }}>per transaction</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 10, color: ash, letterSpacing: "0.12em", marginBottom: 8, fontWeight: 600 }}>TODAY ORDERS</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: coal, letterSpacing: "-0.02em" }}>{todayOrders.length}</div>
              <div style={{ fontSize: 11, color: ash, marginTop: 4, fontWeight: 500 }}>
                {new Date().toLocaleDateString("en-IN", { weekday: "short" })}
              </div>
            </div>
          </div>

          {/* ── Recent orders + Payment methods ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: coal, letterSpacing: "-0.01em" }}>Recent orders</span>
                <a href="/orders" style={{ fontSize: 11, color: fireDark, textDecoration: "none", fontWeight: 600 }}>View all →</a>
              </div>
              {recentOrders.length === 0 && (
                <p style={{ fontSize: 13, color: ash, textAlign: "center", padding: "20px 0" }}>No orders yet</p>
              )}
              {recentOrders.map((order, idx) => {
                const icon = order.paymentMethod === "upi"
                  ? <Smartphone size={14} color={veg} />
                  : order.paymentMethod === "cash"
                  ? <Banknote size={14} color={fireDark} />
                  : <ShoppingBag size={14} color="#7B52B8" />;
                const iconBg = order.paymentMethod === "upi" ? "#EAF5EA"
                  : order.paymentMethod === "cash" ? fire50 : "#F5F0FA";
                return (
                  <div key={order.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                    borderBottom: idx < recentOrders.length - 1 ? `1px solid ${ember}` : "none",
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, background: iconBg,
                      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: coal, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {order.items.map((i) => i.name).join(", ")}
                      </div>
                      <div style={{ fontSize: 11, color: ash, marginTop: 2 }}>
                        {dayLabel(order.createdAt)} &middot; {PAY_LABEL[order.paymentMethod] ?? order.paymentMethod}
                      </div>
                    </div>
                    <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: veg, whiteSpace: "nowrap" }}>
                      +{fmtRupee(order.totalPaise)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={card}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: coal, letterSpacing: "-0.01em", marginBottom: 12 }}>Payment methods</div>
              <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 4px" }}>
                {donutSegs.length > 0 ? (
                  <DonutChart segments={donutSegs} />
                ) : (
                  <div style={{
                    width: 120, height: 120, borderRadius: "50%",
                    border: `18px solid ${ember}`, display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 11, color: ash }}>No data</span>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                {Object.entries(byMethod).map(([m, paise]) => {
                  const pct = totalSales > 0 ? Math.round((paise / totalSales) * 100) : 0;
                  const color = m === "cash" ? fire : m === "upi" ? "#F49668" : "#FAD4BA";
                  return (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <div style={{ fontSize: 12, color: smoke, flex: 1, fontWeight: 500 }}>{PAY_LABEL[m] ?? m}</div>
                      <div style={{ width: 60, height: 4, background: ember, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: 4, background: color, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 11, color: ash, minWidth: 28, textAlign: "right", fontWeight: 600 }}>{pct}%</div>
                    </div>
                  );
                })}
                {Object.keys(byMethod).length === 0 && (
                  <p style={{ fontSize: 12, color: ash, textAlign: "center", padding: "8px 0" }}>No payment data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Top items + Recent values ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 pb-8">
            <div style={card}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: coal, letterSpacing: "-0.01em", marginBottom: 14 }}>Top items by revenue</div>
              {topItems.length === 0 && (
                <p style={{ fontSize: 12, color: ash, textAlign: "center", padding: "16px 0" }}>No sales data yet</p>
              )}
              {topItems.map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                  borderBottom: i < topItems.length - 1 ? `1px solid ${ember}` : "none",
                }}>
                  <span style={{ width: 20, fontSize: 11, fontWeight: 700, color: ash, fontFamily: "'Syne', sans-serif" }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: coal, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: 11, color: ash, marginTop: 1 }}>{item.qty} sold</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: fireDark, whiteSpace: "nowrap", fontFamily: "'Syne', sans-serif" }}>
                    {fmtRupee(item.revenue)}
                  </span>
                </div>
              ))}
            </div>

            <div style={card}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: coal, letterSpacing: "-0.01em", marginBottom: 4 }}>Recent order values</div>
              <div style={{ fontSize: 11, color: ash, marginBottom: 16, fontWeight: 500 }}>Last {last7.length} orders</div>
              {last7.length > 0 ? (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <SparkBars values={last7} />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: ash, textAlign: "center", padding: "16px 0" }}>No data yet</p>
              )}
              <div style={{
                marginTop: 20, paddingTop: 16,
                borderTop: `1px solid ${ember}`,
                display: "flex", justifyContent: "space-between",
              }}>
                <div>
                  <p style={{ fontSize: 10, color: ash, letterSpacing: "0.12em", fontWeight: 600 }}>LIFETIME</p>
                  <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: coal, letterSpacing: "-0.02em", marginTop: 2 }}>{fmtRupee(totalSales)}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 10, color: ash, letterSpacing: "0.12em", fontWeight: 600 }}>ORDERS</p>
                  <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: coal, letterSpacing: "-0.02em", marginTop: 2 }}>{totalOrders}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── P0-10: Shift Close / End of Day ── */}
          <div style={{ ...card, marginTop: 16, marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: coal, letterSpacing: "-0.01em" }}>
                  End of Day Summary
                </div>
                <div style={{ fontSize: 11, color: ash, marginTop: 2 }}>{todayFmt}</div>
              </div>
              <button
                onClick={() => {
                  const lines = [
                    `${bizName}`,
                    `End of Day — ${todayFmt}`,
                    `─────────────────────────`,
                    `Orders today : ${todayValid.length}`,
                    todayVoids > 0 ? `Voided       : ${todayVoids}` : null,
                    ``,
                    `Cash         : ${(todayCash / 100).toFixed(2)}`,
                    `UPI          : ${(todayUpi / 100).toFixed(2)}`,
                    `GST collected: ${(todayGst / 100).toFixed(2)}`,
                    `─────────────────────────`,
                    `TOTAL        : ${(todaySales / 100).toFixed(2)}`,
                    ``,
                    `Printed ${new Date().toLocaleTimeString("en-IN")}`,
                  ].filter((l): l is string => l !== null);
                  const w = window.open("", "_blank", "width=320,height=500");
                  if (!w) return;
                  w.document.write(
                    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>End of Day</title>` +
                    `<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:13px;padding:12mm;white-space:pre;line-height:1.6}</style>` +
                    `</head><body>${lines.join("\n")}</body></html>`
                  );
                  w.document.close();
                  w.focus();
                  setTimeout(() => { w.print(); }, 400);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: fire, color: "white",
                  fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <Printer size={13} />
                Print Z Report
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              {[
                { label: "Orders", value: String(todayValid.length), sub: todayVoids > 0 ? `${todayVoids} voided` : "all completed" },
                { label: "Total Revenue", value: fmtRupee(todaySales), sub: "excl. voided" },
                { label: "Cash collected", value: fmtRupee(todayCash), sub: "" },
                { label: "UPI collected", value: fmtRupee(todayUpi), sub: "" },
                { label: "GST collected", value: fmtRupee(todayGst), sub: "to remit" },
                { label: "Net (excl. GST)", value: fmtRupee(Math.max(0, todaySales - todayGst)), sub: "" },
              ].map((row, i) => (
                <div key={i} style={{
                  background: i === 1 ? fire50 : sand,
                  borderRadius: 10, padding: "10px 12px",
                }}>
                  <p style={{ fontSize: 10, color: i === 1 ? fire : ash, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>{row.label}</p>
                  <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: i === 1 ? fire : coal, marginTop: 2 }}>{row.value}</p>
                  {row.sub && <p style={{ fontSize: 10, color: ash, marginTop: 1 }}>{row.sub}</p>}
                </div>
              ))}
            </div>

            {todayValid.length === 0 && (
              <p style={{ fontSize: 12, color: ash, textAlign: "center", padding: "8px 0" }}>No orders yet today</p>
            )}
          </div>

        </div>
      </div>
    </AppShell>
  );
}
