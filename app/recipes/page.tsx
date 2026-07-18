"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import {
  dbGetAllMenuItems,
  dbGetAllRawMaterials,
  dbGetAllRecipes,
  dbSaveRecipe,
  dbDeleteRecipe,
} from "@/lib/db";
import type { MenuItem, RawMaterial, Recipe, RecipeIngredient } from "@/lib/types";
import { fmtRupee } from "@/lib/utils";
import { UNIT_DEFS, areUnitsCompatible, getUnitDef, unitLabel } from "@/lib/utils/units";
import {
  computeRecipeCost,
  ingredientLineCostPaise,
  lineUnit,
  syncMenuCostsFromRecipes,
  unpricedMessage,
} from "@/lib/utils/recipeCost";
import { STOCK_UPDATED_EVENT } from "@/lib/utils/stockEngine";
import { Loader2, Lock, Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, Sparkles } from "lucide-react";

/**
 * G2 step 1 — Recipe editor: link each menu item to the raw materials one
 * plate consumes. Approximate values are fine and the UI says so; recipes
 * power the theoretical-consumption and reorder reports.
 *
 * Inventory Sprint 2 — the editor is now unit-aware and cost-live:
 *  ─ Each line carries its own unit (200 gram of an item stocked in Kg).
 *    Only units that actually convert to the material's stock unit are
 *    offered, so an unusable combination cannot be created by hand.
 *  ─ Every line shows its rupee cost, and the plate cost totals live —
 *    all of it derived from lib/utils/recipeCost.ts, the single costing
 *    authority. This screen computes nothing itself.
 *  ─ Saving pushes the derived cost onto the menu item (Recipe → Cost →
 *    Menu Item), which is what the Menu Matrix, Leak Engine, POS cost badge,
 *    Wastage valuation and Profit AI already read. One source of truth.
 *  ─ A recipe may have been created from an accepted AI suggestion, which
 *    carries yield / prep / waste metadata. A manual ingredient edit here
 *    PRESERVES that metadata rather than silently dropping it.
 */

const inputStyle: React.CSSProperties = {
  height: 38,
  padding: "0 10px",
  borderRadius: 10,
  border: "1.5px solid rgba(28,20,16,0.1)",
  fontSize: 13,
  color: "#1C1410",
  outline: "none",
  background: "#FAFAFA",
};

/** Units a recipe line may legally use for this material: everything in the
 *  canonical registry that converts to its stock unit. Container/custom units
 *  convert only to themselves, so those materials offer exactly one option —
 *  which is the honest answer, not a limitation. */
function unitOptionsFor(mat: RawMaterial | undefined): { id: string; label: string }[] {
  if (!mat) return [];
  const compatible = UNIT_DEFS.filter((u) => areUnitsCompatible(u.id, mat.unit));
  if (compatible.length > 0) return compatible.map((u) => ({ id: u.id, label: u.label }));
  const own = getUnitDef(mat.unit);
  return [{ id: own.id, label: own.label }];
}

export default function RecipesPage() {
  const { state, showToast } = useApp();
  const businessId = state.session?.businessId ?? "default";
  const isOwner = state.session?.role === "owner";

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [recipes, setRecipes] = useState<Map<string, Recipe>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeIngredient[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      dbGetAllMenuItems(businessId),
      dbGetAllRawMaterials(businessId),
      dbGetAllRecipes(businessId),
    ]).then(([menu, raws, recs]) => {
      if (cancelled) return;
      setMenuItems(menu);
      setRawMaterials(raws);
      setRecipes(new Map(recs.map((r) => [r.menuItemId, r])));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, isOwner]);

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((m) => (q ? m.name.toLowerCase().includes(q) : true));
  }, [menuItems, search]);

  const materialById = useMemo(
    () => new Map(rawMaterials.map((r) => [r.id, r])),
    [rawMaterials]
  );

  /** Live cost of the row set currently being edited. */
  const draftCost = useMemo(
    () =>
      computeRecipeCost(
        { id: "draft", menuItemId: "draft", ingredients: draft, updatedAt: "" },
        materialById
      ),
    [draft, materialById]
  );

  const openEditor = (menuItemId: string) => {
    if (openId === menuItemId) {
      setOpenId(null);
      return;
    }
    const existing = recipes.get(menuItemId);
    setDraft(existing ? existing.ingredients.map((i) => ({ ...i })) : []);
    setOpenId(menuItemId);
  };

  /** Switching the ingredient resets the line's unit to that material's stock
   *  unit — carrying "gram" over to an item stocked in "bottle" would create
   *  a line the engine cannot measure. */
  const setRowMaterial = useCallback(
    (idx: number, rawMaterialId: string) => {
      const mat = materialById.get(rawMaterialId);
      setDraft((d) =>
        d.map((r, i) =>
          i === idx
            ? { ...r, rawMaterialId, unit: mat ? getUnitDef(mat.unit).id : undefined }
            : r
        )
      );
    },
    [materialById]
  );

  const saveDraft = async (menuItemId: string) => {
    if (saving) return;
    const cleaned: RecipeIngredient[] = draft
      .filter((d) => d.rawMaterialId && d.qtyPerUnit > 0)
      .map((d) => {
        const mat = materialById.get(d.rawMaterialId);
        return {
          rawMaterialId: d.rawMaterialId,
          qtyPerUnit: d.qtyPerUnit,
          // Store the unit explicitly so the line keeps its meaning even if
          // the material's stock unit is later changed in Inventory.
          unit: getUnitDef(lineUnit(d, mat)).id,
        };
      });

    setSaving(true);
    try {
      if (cleaned.length === 0) {
        await dbDeleteRecipe(businessId, menuItemId);
        setRecipes((prev) => {
          const next = new Map(prev);
          next.delete(menuItemId);
          return next;
        });
        showToast("Recipe cleared");
      } else {
        // Preserve any AI-authored metadata (yield / prep / waste / source)
        // on an existing recipe — a manual ingredient edit must never wipe it.
        const prev = recipes.get(menuItemId);
        const recipe: Recipe = {
          ...prev,
          id: menuItemId,
          menuItemId,
          ingredients: cleaned,
          source: prev?.source ?? "manual",
          updatedAt: new Date().toISOString(),
        };
        await dbSaveRecipe(businessId, recipe);
        setRecipes((p) => new Map(p).set(menuItemId, recipe));

        // Recipe → Cost → Menu Item. Costing never blocks the save: the
        // recipe is already durable, and a costing hiccup must not look like
        // a failed save.
        const updated = await syncMenuCostsFromRecipes(businessId);
        if (updated > 0) {
          try {
            setMenuItems(await dbGetAllMenuItems(businessId));
          } catch {
            // stale cost badge only — the write itself already landed
          }
        }
        showToast(
          updated > 0 ? "Recipe saved · menu cost updated" : "Recipe saved"
        );
      }
      // POS tiles cache recipe + stock data — let them refresh immediately.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(STOCK_UPDATED_EVENT));
      }
      setOpenId(null);
    } catch {
      showToast("Failed to save recipe", "error");
    } finally {
      setSaving(false);
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

  const withRecipe = menuItems.filter((m) => recipes.has(m.id)).length;

  return (
    <AppShell>
      <div className="min-h-screen" style={{ background: "#F5F0EB" }}>
        <div style={{ background: "#1C1410", padding: "48px 24px 28px" }} className="lg:pt-8">
          <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>Recipes</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4, maxWidth: 560 }}>
            How much of each ingredient does one plate use? Approximate values are fine —
            recipes price your menu automatically and unlock the consumption &amp; reorder
            report. {withRecipe}/{menuItems.length} items have recipes.
          </div>
        </div>

        <div className="px-4 lg:px-8 py-5 space-y-3" style={{ maxWidth: 760 }}>
          {rawMaterials.length === 0 && (
            <div style={{ background: "#FFF8EC", border: "1px solid #E8D5A8", borderRadius: 12, padding: 14, fontSize: 13, color: "#7A4D00" }}>
              Add your ingredients in Stock first — recipes link menu items to those ingredients.
            </div>
          )}

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items…"
            style={{ ...inputStyle, width: "100%", height: 42, boxSizing: "border-box" }}
          />

          {filteredMenu.map((m) => {
            const has = recipes.has(m.id);
            const open = openId === m.id;
            const savedRecipe = has ? recipes.get(m.id) : undefined;
            const savedCost = savedRecipe
              ? computeRecipeCost(savedRecipe, materialById)
              : null;
            const margin =
              savedCost && savedCost.complete && m.pricePaise > 0
                ? Math.round(((m.pricePaise - savedCost.costPaise) / m.pricePaise) * 100)
                : null;

            return (
              <div key={m.id} style={{ background: "white", borderRadius: 14, border: "0.5px solid rgba(28,20,16,0.07)", overflow: "hidden" }}>
                <button
                  onClick={() => openEditor(m.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1410", display: "flex", alignItems: "center", gap: 6 }}>
                      {m.name}
                      {savedRecipe?.source === "ai_suggested" && (
                        <Sparkles size={12} color="#E8590C" aria-label="From AI suggestion" />
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: has ? "#3E9B5A" : "#9C8E87", marginTop: 2 }}>
                      {has
                        ? `${savedRecipe!.ingredients.length} ingredient(s) linked`
                        : "No recipe yet"}
                      {savedCost && savedCost.complete && (
                        <span style={{ color: "#5C4E47" }}>
                          {" · "}
                          {fmtRupee(savedCost.costPaise)}/plate
                          {margin !== null && ` · ${margin}% margin`}
                        </span>
                      )}
                      {savedCost && savedCost.hasLines && !savedCost.complete && (
                        <span style={{ color: "#B07D00" }}>
                          {" · "}cost incomplete
                        </span>
                      )}
                    </div>
                  </div>
                  {open ? <ChevronUp size={16} color="#9C8E87" /> : <ChevronDown size={16} color="#9C8E87" />}
                </button>

                {open && (
                  <div style={{ padding: "0 16px 16px", borderTop: "0.5px solid rgba(28,20,16,0.06)" }}>
                    {draft.map((row, idx) => {
                      const mat = materialById.get(row.rawMaterialId);
                      const options = unitOptionsFor(mat);
                      const rowUnit = getUnitDef(lineUnit(row, mat)).id;
                      const rowCost = ingredientLineCostPaise(row, mat);
                      return (
                        <div key={idx} style={{ marginTop: 10 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <select
                              value={row.rawMaterialId}
                              onChange={(e) => setRowMaterial(idx, e.target.value)}
                              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                            >
                              <option value="">— ingredient —</option>
                              {rawMaterials.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({unitLabel(r.unit)})
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={row.qtyPerUnit || ""}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setDraft((d) => d.map((r, i) => (i === idx ? { ...r, qtyPerUnit: v } : r)));
                              }}
                              placeholder="qty"
                              style={{ ...inputStyle, width: 80 }}
                            />
                            <select
                              value={rowUnit}
                              disabled={!mat || options.length <= 1}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDraft((d) => d.map((r, i) => (i === idx ? { ...r, unit: v } : r)));
                              }}
                              style={{ ...inputStyle, width: 92, flexShrink: 0, opacity: !mat || options.length <= 1 ? 0.6 : 1 }}
                            >
                              {options.length === 0 && <option value="">unit</option>}
                              {options.map((o) => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => setDraft((d) => d.filter((_, i) => i !== idx))}
                              aria-label="Remove ingredient"
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
                            >
                              <Trash2 size={15} color="#C4B5A9" />
                            </button>
                          </div>
                          {mat && row.qtyPerUnit > 0 && (
                            <div style={{ fontSize: 11, color: rowCost === null ? "#B07D00" : "#9C8E87", marginTop: 4, paddingLeft: 2 }}>
                              {rowCost === null
                                ? `No cost yet — set ${mat.name}'s purchase or cost per ${unitLabel(mat.unit)} in Inventory.`
                                : `${fmtRupee(rowCost)} per plate`}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {draftCost.hasLines && (
                      <div
                        style={{
                          marginTop: 14,
                          background: draftCost.complete ? "#F1F8F3" : "#FFF8EC",
                          border: `1px solid ${draftCost.complete ? "#CDE7D5" : "#E8D5A8"}`,
                          borderRadius: 12,
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#1C1410" }}>
                            Cost per plate
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: draftCost.complete ? "#2F7D48" : "#7A4D00" }}>
                            {fmtRupee(draftCost.costPaise)}
                            {!draftCost.complete && "+"}
                          </span>
                        </div>
                        {m.pricePaise > 0 && draftCost.complete && (
                          <div style={{ fontSize: 11, color: "#5C4E47", marginTop: 3 }}>
                            Sells at {fmtRupee(m.pricePaise)} · margin{" "}
                            {Math.round(((m.pricePaise - draftCost.costPaise) / m.pricePaise) * 100)}%
                            {draftCost.costPaise > m.pricePaise && " — you are losing money on this item"}
                          </div>
                        )}
                        {draftCost.unpriced.map((u) => (
                          <div
                            key={`${u.rawMaterialId}-${u.reason}`}
                            style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11, color: "#7A4D00", marginTop: 6 }}
                          >
                            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>{unpricedMessage(u, materialById.get(u.rawMaterialId)?.unit)}</span>
                          </div>
                        ))}
                        {!draftCost.complete && (
                          <div style={{ fontSize: 11, color: "#7A4D00", marginTop: 6 }}>
                            The menu cost stays as-is until every ingredient is priced — a
                            partial cost would show a margin that isn&apos;t real.
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                      <button
                        onClick={() => setDraft((d) => [...d, { rawMaterialId: "", qtyPerUnit: 0 }])}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1.5px solid rgba(28,20,16,0.1)",
                          background: "white",
                          color: "#5C4E47",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Plus size={13} /> Ingredient
                      </button>
                      <button
                        onClick={() => saveDraft(m.id)}
                        disabled={saving}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 10,
                          border: "none",
                          background: "#E8590C",
                          color: "white",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: saving ? "default" : "pointer",
                          opacity: saving ? 0.6 : 1,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {saving && <Loader2 size={12} className="animate-spin" />}
                        Save recipe
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ height: 24 }} />
        </div>
      </div>
    </AppShell>
  );
}
