import type { MenuItem, RawMaterial, Recipe, RecipeIngredient } from "@/lib/types";
import { convertQty, costOfQtyPaise, unitLabel } from "@/lib/utils/units";

/**
 * Inventory Sprint 2 — Unit-aware recipe costing + the Recipe→Cost→Menu link.
 *
 * DESIGN CONTRACT
 * ─ THE single place that answers two questions:
 *     1. "How much stock (in the material's own unit) does one plate use?"
 *     2. "What does one plate cost?"
 *   stockEngine, the Recipes editor, and the consumption report all call these
 *   — no screen re-implements the maths.
 * ─ A recipe line may be written in ANY unit compatible with the material's
 *   stock unit (200 gram of an item stocked in Kg). ing.unit is optional:
 *   when absent the line is read in the material's own unit, which is exactly
 *   how every recipe saved before this sprint was written → zero migration.
 * ─ Money stays INTEGER PAISE. Cost is derived from the purchase (5kg = ₹450)
 *   at full float precision and rounded ONCE, so 200g of a ₹450/5kg item is
 *   exactly ₹18.00 — never 200 × round(₹0.09).
 * ─ A menu item's costPricePaise becomes a PROJECTION of its recipe once a
 *   recipe exists — recipe is the source of truth, costPricePaise is the
 *   cache every existing reader (MenuMatrix, LeakEngine, POS tiles, Wastage,
 *   Profit AI) already reads. Items with no recipe keep their manual cost,
 *   untouched, forever.
 */

/** Why a recipe line could not be priced or measured. */
export type UnpricedReason = "missing" | "unit" | "cost";

export interface UnpricedLine {
  rawMaterialId: string;
  /** Material name when known, else a stable placeholder. */
  name: string;
  reason: UnpricedReason;
}

export interface RecipeCost {
  /** Cost of ONE plate, integer paise. Only counts lines that resolved. */
  costPaise: number;
  /** Lines that contributed nothing — the owner is shown these, never a lie. */
  unpriced: UnpricedLine[];
  /** true when every line resolved to a real cost. */
  complete: boolean;
  /** true when the recipe has at least one usable line. */
  hasLines: boolean;
}

/** The unit a recipe line is written in. Falls back to the material's own
 *  stock unit — the pre-Sprint-2 contract, so legacy recipes read correctly. */
export function lineUnit(
  ing: Pick<RecipeIngredient, "unit">,
  material: Pick<RawMaterial, "unit"> | undefined
): string {
  const explicit = ing.unit?.trim();
  if (explicit) return explicit;
  return material?.unit ?? "";
}

/**
 * How much of `material`'s STOCK UNIT one plate consumes.
 * Returns null when the line's unit cannot convert to the stock unit
 * (e.g. line in "bottle", stock in "ml" — a bottle's volume is owner data,
 * never a constant). Callers must decide what null means; this never guesses.
 */
export function ingredientQtyInStockUnit(
  ing: RecipeIngredient,
  material: Pick<RawMaterial, "unit"> | undefined
): number | null {
  if (!material) return null;
  if (!Number.isFinite(ing.qtyPerUnit) || ing.qtyPerUnit < 0) return null;
  return convertQty(ing.qtyPerUnit, lineUnit(ing, material), material.unit);
}

/**
 * Cost of ONE recipe line, integer paise.
 * Prefers exact purchase-derived pricing (5 kg = ₹450 → 200 g = ₹18.00) and
 * falls back to the stored per-unit costPaise snapshot. Returns null when the
 * material is unknown, the unit can't convert, or no cost is known at all.
 */
export function ingredientLineCostPaise(
  ing: RecipeIngredient,
  material: RawMaterial | undefined
): number | null {
  if (!material) return null;
  const unit = lineUnit(ing, material);

  // Exact path: derive straight from the purchase, one rounding at the end.
  if (
    material.purchaseCostPaise != null &&
    material.purchaseQty != null &&
    material.purchaseQty > 0 &&
    material.purchaseUnit
  ) {
    const exact = costOfQtyPaise(
      material.purchaseCostPaise,
      material.purchaseQty,
      material.purchaseUnit,
      ing.qtyPerUnit,
      unit
    );
    if (exact !== null) return exact;
  }

  // Snapshot path: per-stock-unit cost × qty converted into the stock unit.
  const qty = ingredientQtyInStockUnit(ing, material);
  if (qty === null) return null;
  if (material.costPaise == null) return null;
  return Math.round(material.costPaise * qty);
}

/** Diagnose a line that produced no cost, so the UI can say WHY. */
function diagnose(
  ing: RecipeIngredient,
  material: RawMaterial | undefined
): UnpricedReason {
  if (!material) return "missing";
  if (ingredientQtyInStockUnit(ing, material) === null) return "unit";
  return "cost";
}

/** Cost of one plate from a recipe. Never throws. */
export function computeRecipeCost(
  recipe: Recipe | undefined,
  materialById: Map<string, RawMaterial>
): RecipeCost {
  const lines = (recipe?.ingredients ?? []).filter(
    (i) => i.rawMaterialId && i.qtyPerUnit > 0
  );
  if (lines.length === 0) {
    return { costPaise: 0, unpriced: [], complete: false, hasLines: false };
  }

  let costPaise = 0;
  const unpriced: UnpricedLine[] = [];

  for (const ing of lines) {
    const material = materialById.get(ing.rawMaterialId);
    const line = ingredientLineCostPaise(ing, material);
    if (line === null) {
      unpriced.push({
        rawMaterialId: ing.rawMaterialId,
        name: material?.name ?? "Deleted ingredient",
        reason: diagnose(ing, material),
      });
      continue;
    }
    costPaise += line;
  }

  return {
    costPaise,
    unpriced,
    complete: unpriced.length === 0,
    hasLines: true,
  };
}

/** Human sentence for an unpriced line — used verbatim by the Recipes editor. */
export function unpricedMessage(u: UnpricedLine, stockUnit?: string): string {
  if (u.reason === "missing") {
    return `${u.name} — this ingredient no longer exists in Inventory.`;
  }
  if (u.reason === "unit") {
    return `${u.name} — this unit can't convert to ${unitLabel(stockUnit ?? "")}. Use a compatible unit, or set the cost per ${unitLabel(stockUnit ?? "")} in Inventory.`;
  }
  return `${u.name} — no cost set in Inventory yet.`;
}

/**
 * THE Recipe → Cost → Menu Item link.
 *
 * Recomputes costPricePaise for every menu item that has a recipe and writes
 * back ONLY the items whose value actually changed. Everything downstream —
 * Menu Matrix, Leak Engine, POS cost badge, Wastage valuation, Profit AI —
 * reads costPricePaise already, so they all become recipe-accurate without a
 * single line of change in any of them.
 *
 * SAFETY RULES
 * ─ Items with NO recipe are never touched (manual cost stays the owner's).
 * ─ A recipe that is not fully priced is never written — a partial cost is a
 *   wrong cost, and a wrong margin is worse than a missing one.
 * ─ Never throws. A costing hiccup must never break a save, a bill, or a page.
 *
 * @returns how many menu items were updated (0 on any failure).
 */
export async function syncMenuCostsFromRecipes(businessId: string): Promise<number> {
  try {
    const {
      dbGetAllRecipes,
      dbGetAllRawMaterials,
      dbGetAllMenuItems,
      dbSaveMenuItem,
    } = await import("@/lib/db");

    const [recipes, materials, menuItems] = await Promise.all([
      dbGetAllRecipes(businessId),
      dbGetAllRawMaterials(businessId),
      dbGetAllMenuItems(businessId),
    ]);
    if (recipes.length === 0) return 0;

    const materialById = new Map(materials.map((m) => [m.id, m]));
    const recipeByMenuItem = new Map(recipes.map((r) => [r.menuItemId, r]));

    const writes: Promise<void>[] = [];
    let updated = 0;

    for (const item of menuItems) {
      const recipe = recipeByMenuItem.get(item.id);
      if (!recipe) continue;
      const cost = computeRecipeCost(recipe, materialById);
      if (!cost.hasLines || !cost.complete) continue;
      if (item.costPricePaise === cost.costPaise) continue;

      const next: MenuItem = {
        ...item,
        costPricePaise: cost.costPaise,
        updatedAt: new Date().toISOString(),
      };
      updated += 1;
      writes.push(
        dbSaveMenuItem(next, businessId).catch((err) => {
          console.error("[recipeCost] menu cost write failed", item.id, err);
        })
      );
    }

    await Promise.all(writes);
    return updated;
  } catch (err) {
    console.error("[recipeCost] syncMenuCostsFromRecipes failed", err);
    return 0;
  }
}
