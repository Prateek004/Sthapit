"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { fmtRupee } from "@/lib/utils";
import {
  dbGetAllMenuItems,
  dbGetAllRawMaterials,
  dbAddWastage,
  dbGetWastage,
  dbDeleteWastage,
} from "@/lib/db";
import type { MenuItem, RawMaterial, WastageEntry, WastageReason } from "@/lib/types";
import { Trash2, Minus, Plus, Loader2 } from "lucide-react";

/**
 * G4 Wastage Tracker — 3-tap logging: pick item → qty → reason → Save.
 * Never mandatory. Value is auto-computed from cost data when it exists
 * (menu costPricePaise, raw-material costPaise per unit) and can always
 * be overridden manually. Feeds the food_waste leak rule (Confirmed).
 */

const REASONS: { id: WastageReason; label: string; emoji: string }[] = [
  { id: "spoiled", label: "Spoiled", emoji: "🦠" },
  { id: "overcooked", label: "Overcooked", emoji: "🔥" },
  { id: "returned", label: "Returned", emoji: "↩️" },
  { id: "prep_waste", label: "Prep waste", emoji: "🔪" },
  { id: "other", label: "Other", emoji: "❓" },
];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type PickSource = "menu" | "raw";

export default function WastagePage() {
  const { state, showToast } = useApp();
  const businessId = state.session?.businessId ?? "default";

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [entries, setEntries] = useState<WastageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // entry form state
  const [source, setSource] = useState<PickSource>("menu");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<WastageReason>("spoiled");
  const [valueOverride, setValueOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
      const [menu, raws, waste] = await Promise.all([
        dbGetAllMenuItems(businessId),
        dbGetAllRawMaterials(businessId),
        dbGetWastage(businessId, since),
      ]);
      if (cancelled) return;
      setMenuItems(menu);
      setRawMaterials(raws);
      setEntries(waste);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const pickList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (source === "menu") {
      return menuItems
        .filter((m) => (q ? m.name.toLowerCase().includes(q) : true))
        .map((m) => ({
          id: m.id,
          name: m.name,
          unit: "plate",
          unitCostPaise: m.costPricePaise ?? 0,
        }));
    }
    return rawMaterials
      .filter((r) => (q ? r.name.toLowerCase().includes(q) : true))
      .map((r) => ({
        id: r.id,
        name: r.name,
        unit: r.unit || "unit",
        unitCostPaise: r.costPaise ?? 0,
      }));
  }, [source, search, menuItems, rawMaterials]);

  const selected = pickList.find((p) => p.id === selectedId) ?? null;
  const autoValuePaise = selected ? selected.unitCostPaise * qty : 0;
  const overridePaise = Math.round((parseFloat(valueOverride) || 0) * 100);
  const finalValuePaise = valueOverride !== "" ? overridePaise : autoValuePaise;

  const weekTotalPaise = entries.reduce((s, e) => s + e.valuePaise, 0);

  const resetForm = () => {
    setSelectedId(null);
    setQty(1);
    setReason("spoiled");
    setValueOverride("");
    setSearch("");
  };

  const handleSave = async () => {
    if (!selected || saving) return;
    if (finalValuePaise <= 0) {
      showToast("Enter the rupee value lost — no cost price on record for this item", "error");
      return;
    }
    setSaving(true);
    const entry: WastageEntry = {
      id: crypto.randomUUID(),
      itemName: selected.name,
      menuItemId: source === "menu" ? selected.id : undefined,
      rawMaterialId: source === "raw" ? selected.id : undefined,
      qty,
      unit: selected.unit,
      valuePaise: finalValuePaise,
      reason,
      createdAt: new Date().toISOString(),
    };
    try {
      await dbAddWastage(businessId, entry);
      setEntries((prev) => [entry, ...prev]);
      showToast(`Logged: ${selected.name} × ${qty} (${fmtRupee(finalValuePaise)})`);
      resetForm();
    } catch {
      showToast("Failed to save — try again", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbDeleteWastage(businessId, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F0EB" }}>
          <Loader2 size={28} className="animate-spin" style={{ color: "#E8590C" }} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen" style={{ background: "#F5F0EB" }}>
        {/* Header */}
        <div style={{ background: "#1C1410", padding: "48px 24px 28px" }} className="lg:pt-8">
          <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>Wastage Log</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
            3 taps: item · quantity · reason. Every entry sharpens your profit-leak detection.
          </div>
          <div
            style={{
              marginTop: 16,
              display: "inline-flex",
              flexDirection: "column",
              background: "rgba(255,255,255,0.08)",
              border: "0.5px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: "8px 14px",
            }}
          >
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>
              WASTED · LAST 7 DAYS
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#F5DDD3" }}>
              {fmtRupee(weekTotalPaise)}
            </span>
          </div>
        </div>

        <div className="px-4 lg:px-8 py-5 space-y-4" style={{ maxWidth: 720 }}>
          {/* ── Entry card ── */}
          <div style={{ background: "white", borderRadius: 16, border: "0.5px solid rgba(28,20,16,0.07)", padding: 18 }}>
            {/* TAP 1 — pick item */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", marginBottom: 8 }}>
              1 · WHAT WAS WASTED
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {(
                [
                  { id: "menu" as PickSource, label: "Menu item" },
                  { id: "raw" as PickSource, label: "Ingredient" },
                ]
              ).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => {
                    setSource(id);
                    setSelectedId(null);
                    setSearch("");
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: `1.5px solid ${source === id ? "#E8590C" : "rgba(28,20,16,0.1)"}`,
                    background: source === id ? "#FEF3EE" : "white",
                    color: source === id ? "#E8590C" : "#5C4E47",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={source === "menu" ? "Search menu items…" : "Search ingredients…"}
              style={{
                width: "100%",
                height: 40,
                padding: "0 12px",
                borderRadius: 10,
                border: "1.5px solid rgba(28,20,16,0.1)",
                fontSize: 14,
                color: "#1C1410",
                outline: "none",
                background: "#FAFAFA",
                boxSizing: "border-box",
                marginBottom: 10,
              }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 150, overflowY: "auto" }}>
              {pickList.length === 0 && (
                <span style={{ fontSize: 12, color: "#9C8E87" }}>
                  {source === "menu" ? "No menu items found." : "No ingredients found — add them in Stock."}
                </span>
              )}
              {pickList.slice(0, 40).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1.5px solid ${selectedId === p.id ? "#E8590C" : "rgba(28,20,16,0.1)"}`,
                    background: selectedId === p.id ? "#E8590C" : "white",
                    color: selectedId === p.id ? "white" : "#5C4E47",
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* TAP 2 — qty */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", margin: "16px 0 8px" }}>
              2 · HOW MUCH {selected ? `(${selected.unit})` : ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                style={{ width: 40, height: 40, borderRadius: 10, border: "1.5px solid rgba(28,20,16,0.1)", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Minus size={16} color="#5C4E47" />
              </button>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#1C1410", minWidth: 40, textAlign: "center" }}>
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => q + 1)}
                style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: "#E8590C", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Plus size={16} color="white" />
              </button>
            </div>

            {/* TAP 3 — reason */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", margin: "16px 0 8px" }}>
              3 · WHY
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: `1.5px solid ${reason === r.id ? "#B83E06" : "rgba(28,20,16,0.1)"}`,
                    background: reason === r.id ? "#FEF0E8" : "white",
                    color: reason === r.id ? "#B83E06" : "#5C4E47",
                  }}
                >
                  {r.emoji} {r.label}
                </button>
              ))}
            </div>

            {/* Value */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", margin: "16px 0 8px" }}>
              VALUE LOST
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                type="number"
                min="0"
                value={valueOverride}
                onChange={(e) => setValueOverride(e.target.value)}
                placeholder={
                  autoValuePaise > 0
                    ? `auto: ${fmtRupee(autoValuePaise)}`
                    : "₹ value (no cost on record)"
                }
                style={{
                  width: 180,
                  height: 40,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1.5px solid rgba(28,20,16,0.1)",
                  fontSize: 14,
                  color: "#1C1410",
                  outline: "none",
                  background: "#FAFAFA",
                }}
              />
              <span style={{ fontSize: 12, color: "#9C8E87" }}>
                {valueOverride !== ""
                  ? `logging ${fmtRupee(finalValuePaise)}`
                  : autoValuePaise > 0
                  ? "computed from cost price — override if wrong"
                  : "enter the ₹ lost"}
              </span>
            </div>

            <button
              onClick={handleSave}
              disabled={!selected || saving || finalValuePaise <= 0}
              style={{
                width: "100%",
                height: 48,
                marginTop: 18,
                borderRadius: 12,
                border: "none",
                cursor: !selected || finalValuePaise <= 0 ? "default" : "pointer",
                background: !selected || finalValuePaise <= 0 ? "#F0E8DF" : "#E8590C",
                color: !selected || finalValuePaise <= 0 ? "#A89684" : "white",
                fontWeight: 700,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {selected
                ? `Log ${selected.name} × ${qty}${finalValuePaise > 0 ? ` · ${fmtRupee(finalValuePaise)}` : ""}`
                : "Pick an item to log"}
            </button>
          </div>

          {/* ── Last 7 days list ── */}
          <div style={{ background: "white", borderRadius: 16, border: "0.5px solid rgba(28,20,16,0.07)", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "0.5px solid rgba(28,20,16,0.06)", fontSize: 12, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em" }}>
              LAST 7 DAYS · {entries.length} ENTRIES
            </div>
            {entries.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: "#9C8E87" }}>
                Nothing logged yet. Even 3 days of logging gives the leak engine a waste baseline.
              </div>
            ) : (
              entries.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 18px",
                    borderBottom: i === entries.length - 1 ? "none" : "0.5px solid rgba(28,20,16,0.05)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1C1410" }}>
                      {e.itemName} × {e.qty}
                      {e.unit && e.unit !== "plate" ? ` ${e.unit}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "#9C8E87", marginTop: 2, textTransform: "capitalize" }}>
                      {e.reason.replace("_", " ")} ·{" "}
                      {new Date(e.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {new Date(e.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#B83E06", flexShrink: 0 }}>
                    {fmtRupee(e.valuePaise)}
                  </span>
                  <button
                    onClick={() => handleDelete(e.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
                  >
                    <Trash2 size={15} color="#C4B5A9" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={{ height: 24 }} />
        </div>
      </div>
    </AppShell>
  );
}
