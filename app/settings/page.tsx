"use client";
import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { Cloud, CloudOff, LogOut, Trash2, Save, User, ChevronRight, Percent, Smartphone, Cpu, Database, Code, ShieldAlert } from "lucide-react";
import { isSupabaseEnabled } from "@/lib/supabase/client";
import { HIDE_FRANCHISE } from "@/lib/utils";
import type { StockSettings } from "@/lib/types";

const GST_OPTIONS = [0, 5, 12, 18];
const BAR_BIZ_TYPES = ["cafe", "restaurant", "franchise"].filter(
  (t) => !HIDE_FRANCHISE || t !== "franchise"
);
const OPEN_TABLE_BIZ_TYPES = ["cafe", "restaurant"];

export default function SettingsPage() {
  const { state, setSession, logout, showToast } = useApp();
  const router = useRouter();
  const { session } = state;
  const isOwner = session?.role === "owner";
  const showBarToggle = BAR_BIZ_TYPES.includes(session?.businessType ?? "");
  const showOpenTableToggle = OPEN_TABLE_BIZ_TYPES.includes(session?.businessType ?? "");

  const ss: StockSettings = session?.stockSettings ?? {
    tablesEnabled: false, kotEnabled: false, barEnabled: false,
    tableCount: 10, openTableBilling: false,
  };

  const [gst, setGst] = useState(session?.gstPercent ?? 5);
  const [upiId, setUpiId] = useState(session?.upiId ?? "");
  const [tablesEnabled, setTablesEnabled] = useState(ss.tablesEnabled);
  const [kotEnabled, setKotEnabled] = useState(ss.kotEnabled);
  const [barEnabled, setBarEnabled] = useState(ss.barEnabled);
  const [tableCount, setTableCount] = useState(ss.tableCount);
  const [openTableBilling, setOpenTableBilling] = useState(ss.openTableBilling ?? false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    setGst(session.gstPercent);
    setUpiId(session.upiId ?? "");
    const s = session.stockSettings;
    if (s) {
      setTablesEnabled(s.tablesEnabled);
      setKotEnabled(s.kotEnabled);
      setBarEnabled(s.barEnabled);
      setTableCount(s.tableCount);
      setOpenTableBilling(s.openTableBilling ?? false);
    }
  }, [session?.userId]);

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    const stockSettings: StockSettings = { tablesEnabled, kotEnabled, barEnabled, tableCount, openTableBilling };
    const updated = { ...session, gstPercent: gst, upiId: upiId.trim() || undefined, stockSettings };
    setSession(updated);
    if (isSupabaseEnabled()) {
      try {
        const sb = await import("@/lib/supabase/client").then((m) => m.getSupabase());
        if (sb) {
          const { data: { user } } = await sb.auth.getUser();
          if (user) {
            await sb.from("profiles").update({ gst_percent: gst, upi_id: upiId.trim() || null }).eq("id", user.id);
          }
        }
      } catch {}
    }
    showToast("Settings saved");
    setSaving(false);
  };

  const handleLogout = async () => { await logout(); router.replace("/auth"); };

  const handleReset = () => {
    if (!confirm("Reset ALL local data? This will clear your orders, menu, and session. Cannot be undone.")) return;
    try { localStorage.clear(); } catch {}
    try { indexedDB.deleteDatabase("vynn_db"); indexedDB.deleteDatabase("servezy_db"); } catch {}
    window.location.href = "/auth";
  };

  const initial = (session?.businessName ?? "V").charAt(0).toUpperCase();

  return (
    <AppShell>
      <div className="min-h-screen" style={{ background: "#F5F0EB" }}>

        {/* ── Hero header ── */}
        <div style={{ background: "#1C1410", paddingTop: 56, paddingBottom: 32, paddingLeft: 24, paddingRight: 24 }} className="lg:pt-8">
          <div className="flex items-center gap-4">
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#8B3018", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#F5DDD3", fontWeight: 700, flexShrink: 0 }}>
              {initial}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "white", letterSpacing: "-0.01em" }}>
                {session?.businessName ?? "Business"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, textTransform: "capitalize" }}>
                {session?.role ?? "owner"} &middot; {session?.businessType ?? ""}
              </div>
            </div>
          </div>

          {/* Account info pills */}
          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            {[
              { label: "Username", value: session?.username ?? "-" },
              { label: "Type", value: session?.businessType ?? "-" },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", border: "0.5px solid rgba(255,255,255,0.12)" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em" }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 500, marginTop: 1, textTransform: "capitalize" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 lg:px-8 py-5 space-y-3">

          {/* ── Billing ── */}
          <SectionHeader label="Billing" />
          <div style={{ background: "white", borderRadius: 16, overflow: "hidden", border: "0.5px solid rgba(28,20,16,0.07)" }}>
            {/* GST */}
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid rgba(28,20,16,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FEF3EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Percent size={15} color="#E8590C" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1C1410" }}>GST Rate</div>
                  <div style={{ fontSize: 11, color: "#9C8E87" }}>Applied to all orders</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {GST_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setGst(rate)}
                    style={{
                      height: 44, borderRadius: 10, border: `1.5px solid ${gst === rate ? "#E8590C" : "rgba(28,20,16,0.1)"}`,
                      background: gst === rate ? "#FEF3EE" : "white",
                      color: gst === rate ? "#E8590C" : "#5C4E47",
                      fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>

            {/* UPI */}
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#EAF5EA", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Smartphone size={15} color="#3E9B5A" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1C1410" }}>UPI ID</div>
                  <div style={{ fontSize: 11, color: "#9C8E87" }}>For QR code at checkout</div>
                </div>
              </div>
              <input
                style={{
                  width: "100%", height: 44, padding: "0 14px", borderRadius: 10,
                  border: "1.5px solid rgba(28,20,16,0.1)", fontSize: 14,
                  color: "#1C1410", outline: "none", background: "#FAFAFA",
                  boxSizing: "border-box",
                }}
                placeholder="e.g. 9876543210@upi"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                onFocus={(e) => (e.target.style.borderColor = "#E8590C")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(28,20,16,0.1)")}
              />
            </div>
          </div>

          {/* ── POS Features ── */}
          {isOwner && (
            <>
              <SectionHeader label="POS Features" />
              <div style={{ background: "white", borderRadius: 16, overflow: "hidden", border: "0.5px solid rgba(28,20,16,0.07)" }}>
                <PremiumToggle
                  label="Table Management"
                  desc="Enable table selection per order"
                  value={tablesEnabled}
                  onChange={setTablesEnabled}
                  accent="#E8590C"
                  iconBg="#FEF3EE"
                  icon={<span style={{ fontSize: 15 }}>🪑</span>}
                  divider
                />
                {tablesEnabled && (
                  <div style={{ padding: "4px 20px 16px", borderBottom: "0.5px solid rgba(28,20,16,0.06)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", marginBottom: 10 }}>NUMBER OF TABLES</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[5, 10, 15, 20, 25, 30].map((n) => (
                        <button
                          key={n}
                          onClick={() => setTableCount(n)}
                          style={{
                            width: 44, height: 44, borderRadius: 10,
                            border: `1.5px solid ${tableCount === n ? "#E8590C" : "rgba(28,20,16,0.1)"}`,
                            background: tableCount === n ? "#FEF3EE" : "white",
                            color: tableCount === n ? "#E8590C" : "#5C4E47",
                            fontWeight: 700, fontSize: 14, cursor: "pointer",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <PremiumToggle
                  label="KOT Printing"
                  desc="Kitchen Order Ticket with each order"
                  value={kotEnabled}
                  onChange={setKotEnabled}
                  accent="#7B52B8"
                  iconBg="#F5F0FA"
                  icon={<span style={{ fontSize: 15 }}>🖨️</span>}
                  divider
                />
                {showOpenTableToggle && (
                  <PremiumToggle
                    label="Open Table Billing"
                    desc="Keep running tab, bill at end"
                    value={openTableBilling}
                    onChange={setOpenTableBilling}
                    accent="#3E9B5A"
                    iconBg="#EAF5EA"
                    icon={<span style={{ fontSize: 15 }}>📋</span>}
                    divider={showBarToggle}
                  />
                )}
                {showBarToggle && (
                  <PremiumToggle
                    label="Bar Tab"
                    desc="Bar inventory in Stock section"
                    value={barEnabled}
                    onChange={setBarEnabled}
                    accent="#B24B2F"
                    iconBg="#FAF0EB"
                    icon={<span style={{ fontSize: 15 }}>🍾</span>}
                    divider={false}
                  />
                )}
              </div>
            </>
          )}

          {/* ── Cloud Sync ── */}
          <SectionHeader label="Sync" />
          <div style={{ background: "white", borderRadius: 16, padding: "16px 20px", border: "0.5px solid rgba(28,20,16,0.07)", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: isSupabaseEnabled() ? "#EAF5EA" : "#F3F3F3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {isSupabaseEnabled() ? <Cloud size={18} color="#3E9B5A" /> : <CloudOff size={18} color="#9C8E87" />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1C1410" }}>
                {isSupabaseEnabled() ? "Cloud Sync Active" : "Offline Only"}
              </div>
              <div style={{ fontSize: 11, color: "#9C8E87", marginTop: 1 }}>
                {isSupabaseEnabled() ? "Orders sync automatically" : "Add Supabase keys to enable sync"}
              </div>
            </div>
            {isSupabaseEnabled() && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3E9B5A", flexShrink: 0 }} />}
          </div>

          {/* ── About ── */}
          <SectionHeader label="About" />
          <div style={{ background: "white", borderRadius: 16, overflow: "hidden", border: "0.5px solid rgba(28,20,16,0.07)" }}>
            {[
              { icon: <Code size={14} color="#9C8E87" />, label: "Version", value: "v1.0.0" },
              { icon: <Database size={14} color="#9C8E87" />, label: "Storage", value: "IndexedDB" },
              { icon: <Cpu size={14} color="#9C8E87" />, label: "Framework", value: "Next.js 14" },
            ].map(({ icon, label, value }, i, arr) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: i < arr.length - 1 ? "0.5px solid rgba(28,20,16,0.05)" : "none" }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: "#F5F0EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {icon}
                </div>
                <span style={{ fontSize: 13, color: "#5C4E47", flex: 1 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1C1410" }}>{value}</span>
              </div>
            ))}
          </div>

          {/* ── Save button ── */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: "100%", height: 52, borderRadius: 14,
              background: saving ? "#F89E6A" : "#E8590C",
              color: "white", fontWeight: 700, fontSize: 15,
              border: "none", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 14px rgba(232,89,12,0.35)",
              transition: "all 0.15s",
            }}
          >
            <Save size={17} />
            {saving ? "Saving..." : "Save Settings"}
          </button>

          {/* ── Sign out ── */}
          <button
            onClick={handleLogout}
            style={{
              width: "100%", height: 48, borderRadius: 14,
              background: "white", color: "#5C4E47", fontWeight: 600, fontSize: 14,
              border: "1px solid rgba(28,20,16,0.1)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <LogOut size={16} />
            Sign Out
          </button>

          {/* ── Danger Zone ── */}
          <SectionHeader label="Danger Zone" />
          <div style={{ background: "white", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(220,38,38,0.15)" }}>
            <button
              onClick={handleReset}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Trash2 size={16} color="#DC2626" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#DC2626" }}>Reset All Local Data</div>
                <div style={{ fontSize: 11, color: "#9C8E87", marginTop: 1 }}>Clears orders, menu, and session</div>
              </div>
              <ChevronRight size={16} color="#DC2626" style={{ opacity: 0.5 }} />
            </button>
          </div>

          <div style={{ height: 16 }} />
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ paddingLeft: 4, paddingBottom: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.1em" }}>
        {label.toUpperCase()}
      </span>
    </div>
  );
}

function PremiumToggle({
  label, desc, value, onChange, accent, iconBg, icon, divider,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  accent: string;
  iconBg: string;
  icon: ReactNode;
  divider?: boolean;
}) {
  return (
    <div style={{ borderBottom: divider ? "0.5px solid rgba(28,20,16,0.06)" : "none" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", cursor: "pointer" }}
        onClick={() => onChange(!value)}
      >
        <div style={{ width: 36, height: 36, borderRadius: 9, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1C1410" }}>{label}</div>
          {desc && <div style={{ fontSize: 11, color: "#9C8E87", marginTop: 1 }}>{desc}</div>}
        </div>
        {/* Toggle pill */}
        <div
          style={{
            width: 44, height: 24, borderRadius: 12, position: "relative", flexShrink: 0,
            background: value ? accent : "rgba(28,20,16,0.12)",
            transition: "background 0.2s",
          }}
        >
          <div style={{
            position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%",
            background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            left: value ? 23 : 3, transition: "left 0.2s",
          }} />
        </div>
      </div>
    </div>
  );
}
