"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { useApp } from "@/lib/store/AppContext";
import { getRecipeAIProvider, type RecipeSuggestion } from "@/lib/ai/recipeProvider";
import type { MenuItem, RawMaterial, Recipe, RecipeIngredient } from "@/lib/types";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

/**
 * RECIPE AI — review & confirm screen shown right after a new menu item is
 * created. Nothing here ever auto-saves: the provider only SUGGESTS, the
 * owner reviews every row, and Recipe/Inventory are written only on an
 * explicit "Confirm & Save" tap. "Ignore" closes with nothing written.
 *
 * When no real AI/search provider is configured (the shipped default), this
 * says so plainly instead of showing placeholder or fabricated data.
 */

interface DraftRow {
  key: string;
  name: string;
  qty: string;
  unit: string;
  /** Existing Inventory item this row is linked to, or null = will be
   *  created fresh in Inventory on confirm. */
  rawMaterialId: string | null;
}

const inputCls =
  "h-10 w-full rounded-xl border-[1.5px] border-black/10 bg-[#FAFAFA] px-3 text-[13px] text-[#1C1410] outline-none";

function toDraftRows(suggestion: RecipeSuggestion, existing: RawMaterial[]): DraftRow[] {
  const byName = new Map(existing.map((m) => [m.name.trim().toLowerCase(), m]));
  return suggestion.ingredients.map((ing, idx) => {
    const match = byName.get(ing.name.trim().toLowerCase());
    return {
      key: `${idx}_${ing.name}`,
      name: ing.name,
      qty: ing.qty > 0 ? String(ing.qty) : "",
      unit: ing.unit || match?.unit || "",
      rawMaterialId: match?.id ?? null,
    };
  });
}

export default function RecipeSuggestionModal({
  item,
  onClose,
}: {
  item: MenuItem;
  onClose: () => void;
}) {
  const { state, showToast, refreshMenuItemsFromDb } = useApp();
  const businessId = state.session?.businessId ?? "default";
  const businessType = state.session?.businessType;

  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [suggestion, setSuggestion] = useState<RecipeSuggestion | null>(null);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { dbGetAllRawMaterials } = await import("@/lib/db");
        const provider = getRecipeAIProvider();
        const [materials, result] = await Promise.all([
          dbGetAllRawMaterials(businessId),
          provider.suggestRecipe(item.name, businessType),
        ]);
        if (cancelled) return;
        setRawMaterials(materials);
        setConfigured(provider.isConfigured);
        setSuggestion(result);
        setRows(result ? toDraftRows(result, materials) : []);
      } catch (err) {
        console.error("[RecipeSuggestionModal] suggestRecipe failed", err);
        if (!cancelled) {
          setConfigured(false);
          setSuggestion(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const updateRow = (key: string, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { key: `new_${crypto.randomUUID()}`, name: "", qty: "", unit: "", rawMaterialId: null },
    ]);

  const validRows = rows.filter((r) => r.name.trim() && Number(r.qty) > 0 && r.unit.trim());

  const handleConfirm = async () => {
    if (validRows.length === 0 || saving) return;
    setSaving(true);
    try {
      const { dbSaveRawMaterial, dbSaveRecipe } = await import("@/lib/db");
      const { syncMenuCostsFromRecipes } = await import("@/lib/utils/recipeCost");
      const now = new Date().toISOString();
      const byName = new Map(rawMaterials.map((m) => [m.name.trim().toLowerCase(), m]));

      const ingredients: RecipeIngredient[] = [];
      for (const row of validRows) {
        let rawMaterialId = row.rawMaterialId;
        if (!rawMaterialId) {
          const key = row.name.trim().toLowerCase();
          const existing = byName.get(key);
          if (existing) {
            rawMaterialId = existing.id;
          } else {
            const fresh: RawMaterial = {
              id: crypto.randomUUID(),
              name: row.name.trim(),
              unit: row.unit.trim(),
              currentStock: 0,
              updatedAt: now,
            };
            await dbSaveRawMaterial(fresh, businessId);
            byName.set(key, fresh);
            rawMaterialId = fresh.id;
          }
        }
        ingredients.push({
          rawMaterialId,
          qtyPerUnit: Number(row.qty),
          unit: row.unit.trim(),
        });
      }

      const recipe: Recipe = {
        id: item.id,
        menuItemId: item.id,
        ingredients,
        yieldQty: suggestion?.yieldQty,
        yieldUnit: suggestion?.yieldUnit,
        preparationNotes: suggestion?.preparation,
        typicalWastePercent: suggestion?.typicalWastePercent,
        source: "ai_suggested",
        updatedAt: now,
      };
      await dbSaveRecipe(businessId, recipe);
      await syncMenuCostsFromRecipes(businessId);
      await refreshMenuItemsFromDb();

      showToast("Recipe saved from AI suggestion");
      onClose();
    } catch (err) {
      console.error("[RecipeSuggestionModal] confirm failed", err);
      showToast("Couldn't save the recipe — try again", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={`Recipe suggestion — ${item.name}`} onClose={onClose}>
      <div className="space-y-4 px-4 pb-8 pt-2">
        {loading && (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Looking up a suggested recipe…
          </div>
        )}

        {!loading && !configured && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-2xl bg-amber-50 border border-amber-200 p-4">
              <Sparkles size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[13px] text-amber-800">
                AI recipe suggestions aren&apos;t configured for this business yet, so nothing was
                fetched or guessed. You can add {item.name}&apos;s recipe manually anytime from
                the Recipes tab.
              </p>
            </div>
            <button onClick={onClose} className="w-full h-11 rounded-xl bg-gray-100 font-bold text-sm text-gray-700 press">
              Got it
            </button>
          </div>
        )}

        {!loading && configured && !suggestion && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-2xl bg-gray-50 border border-gray-200 p-4">
              <Sparkles size={16} className="text-gray-400 mt-0.5 shrink-0" />
              <p className="text-[13px] text-gray-600">
                No suggestion came back for {item.name}. You can add its recipe manually anytime
                from the Recipes tab.
              </p>
            </div>
            <button onClick={onClose} className="w-full h-11 rounded-xl bg-gray-100 font-bold text-sm text-gray-700 press">
              Got it
            </button>
          </div>
        )}

        {!loading && configured && suggestion && (
          <>
            {(suggestion.yieldQty || suggestion.preparation || suggestion.typicalWastePercent) && (
              <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3 space-y-1 text-[12px] text-gray-600">
                {suggestion.yieldQty && (
                  <div>
                    Suggested yield: <b>{suggestion.yieldQty} {suggestion.yieldUnit ?? ""}</b>
                  </div>
                )}
                {suggestion.typicalWastePercent != null && (
                  <div>Typical waste: <b>{suggestion.typicalWastePercent}%</b></div>
                )}
                {suggestion.preparation && <div>{suggestion.preparation}</div>}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500">Ingredients — edit anything before saving</p>
              {rows.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <input
                    className={`${inputCls} flex-[2]`}
                    placeholder="Ingredient"
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value, rawMaterialId: null })}
                  />
                  <input
                    className={`${inputCls} flex-1`}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Qty"
                    value={row.qty}
                    onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                  />
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="Unit"
                    value={row.unit}
                    onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                  />
                  <button onClick={() => removeRow(row.key)} className="shrink-0 text-gray-300 hover:text-red-400 press">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button onClick={addRow} className="flex items-center gap-1 text-xs font-bold text-primary-500 press">
                <Plus size={13} /> Add ingredient
              </button>
              <p className="text-[11px] text-gray-400">
                Ingredients not already in Inventory will be added automatically, with 0 stock and
                no cost until you set one — recipe cost only updates once every line has a cost.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="flex-1 h-11 rounded-xl bg-gray-100 font-bold text-sm text-gray-700 press">
                Ignore
              </button>
              <button
                onClick={handleConfirm}
                disabled={validRows.length === 0 || saving}
                className="flex-1 h-11 rounded-xl bg-primary-500 text-white font-bold text-sm press disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Confirm &amp; Save
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
