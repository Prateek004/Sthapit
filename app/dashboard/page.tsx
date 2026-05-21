"use client";
import React, { useState, useEffect } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { fmtRupee, todayStr, PAY_LABEL } from "@/lib/utils";
import type { Order } from "@/lib/types";
import { Banknote, Smartphone, ShoppingBag, Bell } from "lucide-react";

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
      <circle cx="60" cy="60" r={r} fill="none" stroke="#F3EDE6" strokeWidth="18" />
      {arcs.map((arc, i) => (
        <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={arc.color}
          strokeWidth="18" strokeDasharray={arc.dasharray} strokeDashoffset={arc.dashoffset} />
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
          fill={i === values.length - 1 ? "#B24B2F" : "#EEC3AD"} />;
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
  const uid = state.session?.userId ?? "default";
  const [allOrders, setAllOrders] = useState<Order[]>([]);

  useEffect(() => {
    import("@/lib/db").then(({ dbGetAllOrders }) => dbGetAllOrders(uid).then(setAllOrders));
  }, [state.orders, uid]);

  const today = todayStr();
  const todayOrders = allOrders.filter((o) => o.createdAt.startsWith(today));
  const todaySales = todayOrders.reduce((s, o) => s + o.totalPaise, 0);
  const totalSales = allOrders.reduce((s, o) => s + o.totalPaise, 0);
  const totalOrders = allOrders.length;
  const avgOrder = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

  const byMethod = allOrders.reduce<Record<string, number>>((acc, o) => {
    acc[o.paymentMethod] = (acc[o.paymentMethod] ?? 0) + o.totalPaise;
    return acc;
  }, {});

  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  allOrders.forEach((o) => o.items.forEach((i) => {
    if (!itemMap[i.menuItemId]) itemMap[i.menuItemId] = { name: i.name, qty: 0, revenue: 0 };
    itemMap[i.menuItemId].qty += i.qty;
    itemMap[i.menuItemId].revenue += i.unitPricePaise * i.qty;
  }));

  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const last7 = allOrders.slice(-7).map((o) => Math.round(o.totalPaise / 100));
  const recentOrders = [...allOrders].reverse().slice(0, 5);

  const cash = byMethod["cash"] ?? 0;
  const upi = byMethod["upi"] ?? 0;
  const other = totalSales - cash - upi;
  const donutSegs = [
    { color: "#B24B2F", value: cash },
    { color: "#D97C5A", value: upi },
    { color: "#EEC3AD", value: other },
  ].filter((s) => s.value > 0);

  const todayFmt = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const bizName = state.session?.businessName ?? "Business";

  const ink = "#1C1410";
  const ink2 = "#5C4E47";
  const ink3 = "#9C8E87";
  const sand = "#FAF6F2";
  const sand2 = "#F3EDE6";
  const tc600 = "#B24B2F";
  const tc400 = "#D97C5A";
  const tc50 = "#FAF0EB";
  const green = "#3E9B5A";
  const greenBg = "#EAF5EA";

  const card: React.CSSProperties = {
    background: "white",
    borderRadius: 12,
    border: "0.5px solid rgba(28,20,16,0.08)",
    padding: 20,
  };

  return (
    <AppShell>
      <div style={{ background: sand, fontFamily: "inherit" }}>

        <div className="flex items-center justify-between px-4 sm:px-7 pt-12 lg:pt-7 pb-0">
          <div>
            <div style={{ fontSize: 20, fontWeight: 500, color: ink, letterSpacing: "-0.01em" }}>
              {greeting()}, {bizName}
            </div>
            <div style={{ fontSize: 12, color: ink3, marginTop: 2 }}>{todayFmt}</div>
          </div>
          <button style={{
            width: 34, height: 34, borderRadius: 8,
            border: "0.5px solid rgba(28,20,16,0.12)",
            background: "white", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bell size={15} color={ink2} />
          </button>
        </div>

        <div className="px-4 sm:px-7">

          <div style={{ paddingTop: 20 }}>
            <div style={{
              background: ink, borderRadius: 16,
              padding: "28px 24px 24px", position: "relative", overflow: "hidden",
            }}>
              <svg style={{ position: "absolute", right: -20, top: -20, opacity: 0.06 }}
                width="200" height="230" viewBox="0 0 200 230">
                <polygon points="100,10 185,55 185,175 100,220 15,175 15,55" fill="white" />
              </svg>
              <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
                TODAY&apos;S REVENUE
              </div>
              <div style={{ fontSize: 36, fontWeight: 300, color: "white", letterSpacing: "-0.02em", lineHeight: 1 }}>
                <span style={{ fontSize: 16, color: tc400, marginRight: 4 }}>&#8377;</span>
                {(todaySales / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                <span style={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }}>.00</span>
              </div>
              <div style={{ fontSize: 12, color: "#7BC47B", marginTop: 8 }}>
                {todayOrders.length} order{todayOrders.length !== 1 ? "s" : ""} today
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
                {[
                  ["All Orders", "/orders"],
                  ["Menu", "/menu"],
                  ["Stock", "/stock"],
                  ["Settings", "/settings"],
                ].map(([label, href], i) => (
                  <a key={label} href={href} style={{
                    flex: 1, minWidth: 70, padding: "10px 0", borderRadius: 8,
                    fontSize: 12, letterSpacing: "0.06em", textAlign: "center",
                    cursor: "pointer", textDecoration: "none",
                    border: `0.5px solid ${i === 0 ? tc600 : "rgba(255,255,255,0.12)"}`,
                    color: i === 0 ? "white" : "rgba(255,255,255,0.7)",
                    background: i === 0 ? tc600 : "rgba(255,255,255,0.06)",
                  }}>
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 mt-4">
            <div style={card}>
              <div style={{ fontSize: 11, color: ink3, letterSpacing: "0.04em", marginBottom: 6 }}>TOTAL REVENUE</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: ink, letterSpacing: "-0.02em" }}>{fmtRupee(totalSales)}</div>
              <div style={{ fontSize: 11, color: green, marginTop: 4 }}>{totalOrders} orders</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: ink3, letterSpacing: "0.04em", marginBottom: 6 }}>AVG ORDER</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: ink, letterSpacing: "-0.02em" }}>{fmtRupee(avgOrder)}</div>
              <div style={{ fontSize: 11, color: ink3, marginTop: 4 }}>per transaction</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: ink3, letterSpacing: "0.04em", marginBottom: 6 }}>TODAY ORDERS</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: ink, letterSpacing: "-0.02em" }}>{todayOrders.length}</div>
              <div style={{ fontSize: 11, color: ink3, marginTop: 4 }}>
                {new Date().toLocaleDateString("en-IN", { weekday: "short" })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: ink }}>Recent orders</span>
                <a href="/orders" style={{ fontSize: 11, color: tc600, textDecoration: "none" }}>View all</a>
              </div>
              {recentOrders.length === 0 && (
                <p style={{ fontSize: 13, color: ink3, textAlign: "center", padding: "16px 0" }}>No orders yet</p>
              )}
              {recentOrders.map((order, idx) => {
                const icon = order.paymentMethod === "upi"
                  ? <Smartphone size={14} color={green} />
                  : order.paymentMethod === "cash"
                  ? <Banknote size={14} color={tc600} />
                  : <ShoppingBag size={14} color="#7B52B8" />;
                const iconBg = order.paymentMethod === "upi" ? greenBg
                  : order.paymentMethod === "cash" ? tc50 : "#F5F0FA";
                return (
                  <div key={order.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                    borderBottom: idx < recentOrders.length - 1 ? "0.5px solid rgba(28,20,16,0.06)" : "none",
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, background: iconBg,
                      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {order.items.map((i) => i.name).join(", ")}
                      </div>
                      <div style={{ fontSize: 11, color: ink3, marginTop: 1 }}>
                        {dayLabel(order.createdAt)} &middot; {PAY_LABEL[order.paymentMethod] ?? order.paymentMethod}
                      </div>
                    </div>
                    <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 500, color: green, whiteSpace: "nowrap" }}>
                      +{fmtRupee(order.totalPaise)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 500, color: ink, marginBottom: 12 }}>Payment methods</div>
              <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 4px" }}>
                {donutSegs.length > 0 ? (
                  <DonutChart segments={donutSegs} />
                ) : (
                  <div style={{
                    width: 120, height: 120, borderRadius: "50%",
                    border: "18px solid #F3EDE6", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 11, color: ink3 }}>No data</span>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                {Object.entries(byMethod).map(([m, paise]) => {
                  const pct = totalSales > 0 ? Math.round((paise / totalSales) * 100) : 0;
                  const color = m === "cash" ? "#B24B2F" : m === "upi" ? "#D97C5A" : "#EEC3AD";
                  return (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <div style={{ fontSize: 12, color: ink2, flex: 1 }}>{PAY_LABEL[m] ?? m}</div>
                      <div style={{ width: 60, height: 3, background: sand2, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: 3, background: color, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 11, color: ink3, minWidth: 28, textAlign: "right" }}>{pct}%</div>
                    </div>
                  );
                })}
                {Object.keys(byMethod).length === 0 && (
                  <p style={{ fontSize: 12, color: ink3, textAlign: "center", padding: "8px 0" }}>No payment data yet</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 pb-8">
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 500, color: ink, marginBottom: 14 }}>Top items by revenue</div>
              {topItems.length === 0 && (
                <p style={{ fontSize: 12, color: ink3, textAlign: "center", padding: "12px 0" }}>No sales data yet</p>
              )}
              {topItems.map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                  borderBottom: i < topItems.length - 1 ? "0.5px solid rgba(28,20,16,0.06)" : "none",
                }}>
                  <span style={{ width: 20, fontSize: 11, fontWeight: 700, color: ink3 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: 11, color: ink3 }}>{item.qty} sold</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: tc600, whiteSpace: "nowrap" }}>
                    {fmtRupee(item.revenue)}
                  </span>
                </div>
              ))}
            </div>

            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 500, color: ink, marginBottom: 4 }}>Recent order values</div>
              <div style={{ fontSize: 11, color: ink3, marginBottom: 16 }}>Last {last7.length} orders</div>
              {last7.length > 0 ? (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <SparkBars values={last7} />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: ink3, textAlign: "center", padding: "12px 0" }}>No data yet</p>
              )}
              <div style={{
                marginTop: 20, paddingTop: 16,
                borderTop: "0.5px solid rgba(28,20,16,0.08)",
                display: "flex", justifyContent: "space-between",
              }}>
                <div>
                  <p style={{ fontSize: 10, color: ink3, letterSpacing: "0.1em" }}>LIFETIME</p>
                  <p style={{ fontSize: 16, fontWeight: 500, color: ink }}>{fmtRupee(totalSales)}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 10, color: ink3, letterSpacing: "0.1em" }}>ORDERS</p>
                  <p style={{ fontSize: 16, fontWeight: 500, color: ink }}>{totalOrders}</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
