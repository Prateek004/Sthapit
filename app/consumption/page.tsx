"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { dbGetAllOrders, dbGetAllRawMaterials, dbGetAllRecipes } from "@/lib/db";
import type { Order, RawMaterial, Recipe } from "@/lib/types";
import { Loader2, Lock, AlertTriangle, Info } from "lucide-react";

/**
 * G2 step 2 + G3 v1 — Theoretical Consumption & Reorder.
 *
 * theoretical use of ingredient X = Σ over recipes (plates sold × qty per plate)
 * daily rate = theoretical use / days in window
 * days of stock left = current stock / daily rate
 *
 * Honest scope: this is THEORETICAL consumption from your recipes — actual
 * usage can differ through waste, portion drift, or theft. True variance
 * reporting needs periodic physical stock counts, which this screen tells
 * you plainly. Reorder flags use a fixed 3-day lead-time buffer (v1).
 */

const WINDOW_DAYS = 7;
const LEAD_TIME_DAYS = 3;

interface ConsumptionRow {
  material: RawMaterial;
  weeklyUse: number;
  dailyRate: number;
  daysLeft: number | null; // null when dailyRate is 0
}

export default function ConsumptionPage() {
  const { state } = useApp();
  const businessId = state.session?.businessId ?? "default";
  const isOwner = state.session?.role === "owner";

  const [orders, setOrders] = useState<Order[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      dbGetAllOrders(businessId),
      dbGetAllRawMaterials(businessId),
      dbGetAllRecipes(businessId),
    ]).then(([o, m, r]) => {
      if (cancelled) return;
      setOrders(o);
      setMaterials(m);
      setRecipes(r);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, isOwner]);

  const { rows, uncovered, soldPlates } = useMemo(() => {
    const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const windowOrders = orders.filter(
      (o) => o.status !== "voided" && Date.parse(o.createdAt) >= cutoff
    );

    // plates sold per menu item in the window
    const soldByMenuItem = new Map<string, number>();
    let soldPlates = 0;
    for (const o of windowOrders) {
      for (const it of o.items) {
        soldByMenuItem.set(
          it.menuItemId,
          (soldByMenuItem.get(it.menuItemId) ?? 0) + it.qty
        );
        soldPlates += it.qty;
      }
    }

    // theoretical use per raw material
    const usePerMaterial = new Map<string, number>();
    const coveredMenuItems = new Set<string>();
    for (const rec of recipes) {
      const plates = soldByMenuItem.get(rec.menuItemId) ?? 0;
      if (plates <= 0) continue;
      coveredMenuItems.add(rec.menuItemId);
      for (const ing of rec.ingredients) {
        usePerMaterial.set(
          ing.rawMaterialId,
          (usePerMaterial.get(ing.rawMaterialId) ?? 0) + plates * ing.qtyPerUnit
        );
      }
    }

    const rows: ConsumptionRow[] = materials
      .map((material) => {
        const weeklyUse = usePerMaterial.get(material.id) ?? 0;
        const dailyRate = weeklyUse / WINDOW_DAYS;
        const daysLeft =
          dailyRate > 0 ? material.currentStock / dailyRate : null;
        return { material, weeklyUse, dailyRate, daysLeft };
      })
      .filter((r) => r.weeklyUse > 0)
      .sort((a, b) => {
        const da = a.daysLeft ?? Infinity;
        const db = b.daysLeft ?? Infinity;
        return da - db;
      });

    // plates sold on items WITHOUT a recipe — coverage honesty
    let uncoveredPlates = 0;
    const recipeIds = new Set(recipes.map((r) => r.menuItemId));
    soldByMenuItem.forEach((qty, id) => {
      if (!recipeIds.has(id)) uncoveredPlates += qty;
    });
    const uncovered =
      soldPlates > 0 ? Math.round((uncoveredPlates / soldPlates) * 100) : 0;

    return { rows, uncovered, soldPlates };
  }, [orders, materials, recipes]);

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F0EB" }}>
          <Loader2 size={28} className="animate-spin" style={{ color: "#E8590C" }} />
        </div>
      </AppShell>
    );
  }

  if (!isOwner) {
    return (
      <AppShell>
        <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: "#F5F0EB", color: "#5C4E47" }}>
          <Lock size={28} color="#A89684" />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Owner-only screen</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen" style={{ background: "#F5F0EB" }}>
        <div style={{ background: "#1C1410", padding: "48px 24px 28px" }} className="lg:pt-8">
          <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>
            Consumption &amp; Reorder
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4, maxWidth: 560 }}>
            Theoretical usage from your recipes × last {WINDOW_DAYS} days of sales.
            Actual usage can differ (waste, portion drift) — physical stock counts are
            the ground truth this report can&apos;t replace.
          </div>
        </div>

        <div className="px-4 lg:px-8 py-5 space-y-3" style={{ maxWidth: 760 }}>
          {recipes.length === 0 ? (
            <div style={{ background: "white", borderRadius: 16, border: "0.5px solid rgba(28,20,16,0.07)", padding: 24, display: "flex", gap: 12 }}>
              <Info size={18} color="#B07D00" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: "#5C4E47", lineHeight: 1.6 }}>
                No recipes yet — open <b>Recipes</b> and link your top-selling menu items to
                their ingredients (approximate quantities are fine). This report activates
                immediately after.
              </div>
            </div>
          ) : (
            <>
              {uncovered > 0 && (
                <div style={{ background: "#FFF8EC", border: "1px solid #E8D5A8", borderRadius: 12, padding: 14, fontSize: 12, color: "#7A4D00" }}>
                  Coverage: {100 - uncovered}% of the {soldPlates} plates sold this week have
                  recipes. The other {uncovered}% aren&apos;t counted — add their recipes for a
                  fuller picture.
                </div>
              )}

              {rows.length === 0 ? (
                <div style={{ background: "white", borderRadius: 16, border: "0.5px solid rgba(28,20,16,0.07)", padding: 24, fontSize: 13, color: "#5C4E47" }}>
                  No sales this week on menu items that have recipes.
                </div>
              ) : (
                rows.map(({ material, weeklyUse, dailyRate, daysLeft }) => {
                  const reorder = daysLeft !== null && daysLeft <= LEAD_TIME_DAYS;
                  return (
                    <div
                      key={material.id}
                      style={{
                        background: "white",
                        borderRadius: 14,
                        border: `1px solid ${reorder ? "#E8B4B4" : "rgba(28,20,16,0.07)"}`,
                        padding: 16,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1410", display: "flex", alignItems: "center", gap: 8 }}>
                            {reorder && <AlertTriangle size={14} color="#C0392B" />}
                            {material.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#9C8E87", marginTop: 2 }}>
                            using ~{Math.round(weeklyUse * 10) / 10} {material.unit}/week
                            {" · "}~{Math.round(dailyRate * 10) / 10} {material.unit}/day
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: "#9C8E87", letterSpacing: "0.08em" }}>
                            STOCK LASTS
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: reorder ? "#C0392B" : "#1C1410" }}>
                            {daysLeft === null ? "—" : `${Math.floor(daysLeft * 10) / 10} days`}
                          </div>
                          <div style={{ fontSize: 11, color: "#9C8E87" }}>
                            {material.currentStock} {material.unit} on hand
                          </div>
                        </div>
                      </div>
                      {reorder && (
                        <div style={{ marginTop: 10, background: "#FDEEEE", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#C0392B", fontWeight: 600 }}>
                          Reorder now — at the current pace this runs out within {LEAD_TIME_DAYS} days.
                          Suggested order: ~{Math.ceil(dailyRate * WINDOW_DAYS)} {material.unit} (one week of use).
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              <div style={{ fontSize: 11, color: "#9C8E87", padding: "4px 2px" }}>
                Days-left assumes the Stock page quantities are current — update them after
                deliveries. Reorder flag = under {LEAD_TIME_DAYS} days of stock (fixed buffer, v1).
              </div>
            </>
          )}
          <div style={{ height: 24 }} />
        </div>
      </div>
    </AppShell>
  );
}
