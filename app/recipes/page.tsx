"use client";
import React, { useState, useEffect, useMemo } from "react";
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
import { Loader2, Lock, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

/**
 * G2 step 1 — Recipe editor: link each menu item to the raw materials one
 * plate consumes. Approximate values are fine and the UI says so; recipes
 * power the theoretical-consumption and reorder reports.
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

  const openEditor = (menuItemId: string) => {
    if (openId === menuItemId) {
      setOpenId(null);
      return;
    }
    const existing = recipes.get(menuItemId);
    setDraft(existing ? existing.ingredients.map((i) => ({ ...i })) : []);
    setOpenId(menuItemId);
  };

  const saveDraft = async (menuItemId: string) => {
    const cleaned = draft.filter((d) => d.rawMaterialId && d.qtyPerUnit > 0);
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
        const recipe: Recipe = {
          id: menuItemId,
          menuItemId,
          ingredients: cleaned,
          updatedAt: new Date().toISOString(),
        };
        await dbSaveRecipe(businessId, recipe);
        setRecipes((prev) => new Map(prev).set(menuItemId, recipe));
        showToast("Recipe saved");
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
            recipes unlock the consumption &amp; reorder report. {withRecipe}/{menuItems.length} items have recipes.
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
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1410" }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: has ? "#3E9B5A" : "#9C8E87", marginTop: 2 }}>
                      {has
                        ? `${recipes.get(m.id)!.ingredients.length} ingredient(s) linked`
                        : "No recipe yet"}
                    </div>
                  </div>
                  {open ? <ChevronUp size={16} color="#9C8E87" /> : <ChevronDown size={16} color="#9C8E87" />}
                </button>

                {open && (
                  <div style={{ padding: "0 16px 16px", borderTop: "0.5px solid rgba(28,20,16,0.06)" }}>
                    {draft.map((row, idx) => {
                      const mat = materialById.get(row.rawMaterialId);
                      return (
                        <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                          <select
                            value={row.rawMaterialId}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDraft((d) => d.map((r, i) => (i === idx ? { ...r, rawMaterialId: v } : r)));
                            }}
                            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                          >
                            <option value="">— ingredient —</option>
                            {rawMaterials.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.unit})
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
                            style={{ ...inputStyle, width: 90 }}
                          />
                          <span style={{ fontSize: 11, color: "#9C8E87", width: 40, flexShrink: 0 }}>
                            {mat?.unit ?? ""}/plate
                          </span>
                          <button
                            onClick={() => setDraft((d) => d.filter((_, i) => i !== idx))}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
                          >
                            <Trash2 size={15} color="#C4B5A9" />
                          </button>
                        </div>
                      );
                    })}

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
                          cursor: "pointer",
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
