"use client";
import React, { useState, useEffect } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { detectLeaks, Leak } from "@/components/ai/LeakEngine";
import SthappitChat from "@/components/ai/SthappitChat";
import LeaksPanel from "@/components/ai/LeaksPanel";
import InventoryTable from "@/components/ai/InventoryTable";
import BillingTable from "@/components/ai/BillingTable";
import { fmtRupee, todayStr } from "@/lib/utils";
import { dbGetAllOrders, dbGetAllRawMaterials, dbGetAllMenuItems, dbGetWastage } from "@/lib/db";
import { useRouter } from "next/navigation";
import MenuMatrix from "@/components/ai/MenuMatrix";
import { buildDaySummaryText, shareDaySummaryOnWhatsApp } from "@/components/ai/daySummary";
import { AlertTriangle, Leaf, ListChecks, MessageCircle, LayoutGrid, Share2 } from "lucide-react";
import type { Order, RawMaterial, MenuItem } from "@/lib/types";

type ModuleTab = "leaks" | "menu" | "inventory" | "billing" | "chat";

const MODULES: { id: ModuleTab; label: string; Icon: typeof AlertTriangle }[] = [
  { id: "leaks", label: "Profit Leaks", Icon: AlertTriangle },
  { id: "menu", label: "Menu Matrix", Icon: LayoutGrid },
  { id: "inventory", label: "Inventory", Icon: Leaf },
  { id: "billing", label: "Billing", Icon: ListChecks },
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function AiDashboardPage() {
  const { state } = useApp();
  const router = useRouter();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [todayVoided, setTodayVoided] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [leaks, setLeaks] = useState<Leak[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState<ModuleTab>("leaks");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const uid = state.session?.businessId ?? "default";
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [orders, materials, menu, waste] = await Promise.all([
        dbGetAllOrders(uid),
        dbGetAllRawMaterials(uid),
        dbGetAllMenuItems(uid),
        dbGetWastage(uid, sevenDaysAgo),
      ]);
      if (cancelled) return;
      const today = todayStr();
      const todayOrders = orders.filter(
        (o) => o.createdAt.startsWith(today) && o.status !== "voided"
      );
      const todayVoids = orders.filter(
        (o) => o.createdAt.startsWith(today) && o.status === "voided"
      );
      const cutoff = Date.now() - THIRTY_DAYS_MS;
      const recent = orders.filter(
        (o) => o.status !== "voided" && Date.parse(o.createdAt) >= cutoff
      );
      setAllOrders(todayOrders);
      setTodayVoided(todayVoids);
      setRecentOrders(recent);
      setMenuItems(menu);
      setRawMaterials(materials);
      setLeaks(detectLeaks(orders, materials, menu, waste));
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

  // Real gross margin from today's orders, computed only over items that have
  // cost-price data. Never shows a made-up number — "\u2014" until costs exist.
  const costById = new Map(
    menuItems
      .filter((m) => (m.costPricePaise ?? 0) > 0)
      .map((m) => [m.id, m.costPricePaise as number])
  );
  let marginRevenuePaise = 0;
  let marginCostPaise = 0;
  let coveredUnits = 0;
  let totalUnits = 0;
  for (const o of allOrders) {
    for (const it of o.items) {
      totalUnits += it.qty;
      const cost = costById.get(it.menuItemId);
      if (cost === undefined) continue;
      coveredUnits += it.qty;
      marginRevenuePaise += it.unitPricePaise * it.qty;
      marginCostPaise += cost * it.qty;
    }
  }
  const grossMarginPct =
    marginRevenuePaise > 0
      ? Math.round(((marginRevenuePaise - marginCostPaise) / marginRevenuePaise) * 100)
      : null;
  const costCoveragePct =
    totalUnits > 0 ? Math.round((coveredUnits / totalUnits) * 100) : 0;
  const lowStockItems = rawMaterials.filter(
    (r) => (r.minStock ?? 0) > 0 && r.currentStock <= (r.minStock ?? 0) * 1.5
  );

  // F4 v1 (manual): compose today's summary from real data and share via WhatsApp.
  const handleShareSummary = () => {
    const text = buildDaySummaryText({
      businessName: state.session?.businessName ?? "My Business",
      orders: allOrders,
      voidedCount: todayVoided.length,
      voidedPaise: todayVoided.reduce((s, o) => s + o.totalPaise, 0),
      leaks,
      grossMarginPct,
    });
    shareDaySummaryOnWhatsApp(text);
  };

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

  const businessId = state.session?.businessId ?? "default";

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
          className="grid grid-cols-1 lg:grid-cols-[180px_1fr_380px]"
          style={{ minHeight: "100dvh" }}
        >
          {/* MODULE SIDEBAR — desktop only, mobile gets a horizontal tab row instead */}
          <div
            className="hidden lg:flex lg:flex-col lg:h-[100dvh]"
            style={{
              borderRight: "1px solid #1C2D24",
              padding: "24px 0",
            }}
          >
            <div style={{ padding: "0 20px 12px", fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              // MODULES
            </div>
            {MODULES.map(({ id, label, Icon }) => {
              const active = activeModule === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveModule(id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 20px",
                    fontSize: 13,
                    fontWeight: active ? 700 : 400,
                    color: active ? "#00C896" : "#6B8F7A",
                    background: active ? "rgba(0,200,150,0.08)" : "transparent",
                    border: "none",
                    borderLeft: active ? "2px solid #00C896" : "2px solid transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              );
            })}
            <div style={{ borderTop: "1px solid #1C2D24", margin: "12px 20px" }} />
            <button
              onClick={() => setActiveModule("chat")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: activeModule === "chat" ? 700 : 400,
                color: activeModule === "chat" ? "#00C896" : "#6B8F7A",
                background: activeModule === "chat" ? "rgba(0,200,150,0.08)" : "transparent",
                border: "none",
                borderLeft: activeModule === "chat" ? "2px solid #00C896" : "2px solid transparent",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <MessageCircle size={16} />
              <span>Ask STHAPPIT</span>
            </button>
          </div>

          {/* CENTER COLUMN */}
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
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, color: "white" }}>
                    {state.session?.businessName ?? ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#4A6A58" }}>Karol Bagh, Delhi · North Indian</div>
                </div>
                <button
                  onClick={handleShareSummary}
                  title="Share today's summary on WhatsApp"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#0D2B1A",
                    border: "1px solid #00C896",
                    color: "#00C896",
                    fontWeight: 700,
                    fontSize: 12,
                    padding: "10px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Share2 size={14} />
                  WhatsApp Summary
                </button>
              </div>
            </div>

            {/* MOBILE MODULE TABS — replaces sidebar below lg breakpoint */}
            <div className="flex lg:hidden" style={{ gap: 8, overflowX: "auto" }}>
              {[...MODULES, { id: "chat" as ModuleTab, label: "Ask STHAPPIT", Icon: MessageCircle }].map(
                ({ id, label, Icon }) => {
                  const active = activeModule === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveModule(id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: active ? 700 : 400,
                        color: active ? "#0A1A0F" : "#6B8F7A",
                        background: active ? "#00C896" : "#1C2D24",
                        border: "1px solid",
                        borderColor: active ? "#00C896" : "#2A3D30",
                        borderRadius: 999,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        fontFamily: "inherit",
                      }}
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  );
                }
              )}
            </div>

            {/* SECTION B — KPI bar — always visible regardless of active module */}
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
                  GROSS MARGIN
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 28, color: "#00C896", marginTop: 6 }}>
                  {grossMarginPct === null ? "\u2014" : `${grossMarginPct}%`}
                </div>
                <div style={{ fontSize: 11, color: "#4A6A58", marginTop: 4 }}>
                  {grossMarginPct === null
                    ? "add cost prices in Menu"
                    : `based on ${costCoveragePct}% of items sold`}
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

            {/* ACTIVE MODULE CONTENT */}
            {activeModule === "leaks" && <LeaksPanel leaks={leaks} businessId={businessId} />}
            {activeModule === "menu" && (
              <MenuMatrix orders={recentOrders} menuItems={menuItems} />
            )}
            {activeModule === "inventory" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <button
                  onClick={() => router.push("/wastage")}
                  style={{
                    alignSelf: "flex-start",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#0D2B1A",
                    border: "1px solid #00C896",
                    color: "#00C896",
                    fontWeight: 700,
                    fontSize: 12,
                    padding: "10px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  + Log Wastage
                </button>
                <InventoryTable items={lowStockItems} />
              </div>
            )}
            {activeModule === "billing" && <BillingTable orders={allOrders} leaks={leaks} />}
            {activeModule === "chat" && (
              <div className="lg:hidden" style={{ height: 500, overflow: "hidden", borderRadius: 12 }}>
                <SthappitChat
                  orders={allOrders}
                  rawMaterials={rawMaterials}
                  businessName={state.session?.businessName ?? ""}
                  leaks={leaks}
                />
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — chat always visible on desktop */}
          <div className="hidden lg:block lg:h-[100dvh]" style={{ overflow: "hidden" }}>
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
