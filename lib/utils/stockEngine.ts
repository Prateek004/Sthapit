import type { MenuItem, Recipe, RawMaterial, RecipeIngredient } from "@/lib/types";
import {
  dbAtomicDeductRawMaterials,
  dbSaveMenuItem,
  dbGetAllRecipes,
  dbGetAllMenuItems,
  dbGetAllRawMaterials,
} from "@/lib/db";
import { ingredientQtyInStockUnit } from "@/lib/utils/recipeCost";

/**
 * Inventory Sprint 1 — Real-Time POS Inventory Validation.
 * Inventory Sprint 2 — every quantity below is now UNIT-AWARE.
 *
 * Two independent stock signals feed a menu item's sellability:
 *   1. Recipe-based: qty of each raw material one plate needs × current
 *      stock of that raw material (from lib/utils/index.ts + Recipes page).
 *   2. Manual pre-prepared override: an owner-entered pool of ready servings
 *      (e.g. "12 pre-cut paneer portions") that bypasses the raw-material
 *      check entirely until it runs out — mirrors real kitchens where mise
 *      en place lets service continue after raw stock hits zero.
 *
 * A menu item with NEITHER a recipe NOR an override is "untracked" and is
 * always sellable — this module only ever restricts items the owner chose
 * to link to real inventory data.
 *
 * SPRINT 2 — UNIT CONTRACT
 * A recipe line may be written in any unit compatible with the material's
 * stock unit (200 gram against stock held in Kg). Conversion runs through
 * lib/utils/recipeCost.ts — the single costing/measuring authority.
 * When a line's unit CANNOT convert (200 "scoop" vs stock in "kg"), the line
 * is skipped rather than treated as zero: an unmeasurable line is data the
 * engine cannot interpret, and blocking a live bill over uninterpretable data
 * would be worse than the small oversell risk. The Recipes editor flags every
 * such line loudly so the owner fixes it at the source.
 */

export type LineItem = { menuItemId: string; name: string; qty: number };

/** Browser event fired after any deduction so open UIs (POS tiles) can
 *  refresh their stock badges without polling. */
export const STOCK_UPDATED_EVENT = "sth1r-stock-updated";

/** Tiles show an "Only N left" badge at or below this remaining count. */
export const LOW_STOCK_BADGE_THRESHOLD = 5;

export interface StockShortfall {
  menuItemId: string;
  name: string;
  requestedQty: number;
  /** Max units that can actually be served right now (0 or more). */
  availableQty: number;
  /** Name of the raw material that ran out first, when recipe-based. */
  limitingIngredient?: string;
}

/** Thrown by checkStock() callers when a shortfall exists and the acting
 *  user's role does not permit an override (cashiers). Owners never trigger
 *  this — see canOverride in checkStockForRole(). */
export class StockShortfallError extends Error {
  shortfalls: StockShortfall[];
  constructor(shortfalls: StockShortfall[]) {
    const first = shortfalls[0];
    super(
      first
        ? `Only ${first.availableQty} serving(s) of ${first.name} can be made from current stock`
        : "Insufficient stock"
    );
    this.name = "StockShortfallError";
    this.shortfalls = shortfalls;
  }
}

/**
 * How much of a material's STOCK UNIT one plate needs.
 * Returns null when the line must not constrain the sale (unconvertible unit,
 * or a non-positive quantity). When the material row itself is missing the
 * quantity is read as-is — preserving the pre-Sprint-2 behaviour where an
 * orphaned ingredient reads as zero stock and blocks the item.
 */
function requiredPerPlate(
  ing: RecipeIngredient,
  material: RawMaterial | undefined
): number | null {
  if (!Number.isFinite(ing.qtyPerUnit) || ing.qtyPerUnit <= 0) return null;
  if (!material) return ing.qtyPerUnit;
  const need = ingredientQtyInStockUnit(ing, material);
  if (need === null || need <= 0) return null;
  return need;
}

/** Max whole plates of `menuItemId` current raw-material stock can produce.
 *  Returns null when the item has no recipe at all (untracked → unlimited),
 *  or when no line in the recipe is measurable against stock. */
export function getMaxServablePortions(
  menuItemId: string,
  recipeByMenuItem: Map<string, Recipe>,
  materialById: Map<string, RawMaterial>
): number | null {
  const recipe = recipeByMenuItem.get(menuItemId);
  if (!recipe || recipe.ingredients.length === 0) return null;
  let max = Infinity;
  for (const ing of recipe.ingredients) {
    const material = materialById.get(ing.rawMaterialId);
    const need = requiredPerPlate(ing, material);
    if (need === null) continue;
    const stock = material?.currentStock ?? 0;
    const possible = Math.floor(stock / need);
    if (possible < max) max = possible;
  }
  return Number.isFinite(max) ? Math.max(0, max) : null;
}

/**
 * Checks a list of order/cart lines against current stock. Lines for the
 * same menu item (different add-ons/portions/notes) are summed first, since
 * they all draw on the same ingredient pool.
 */
export function checkStock(
  lines: LineItem[],
  recipes: Recipe[],
  rawMaterials: RawMaterial[],
  menuItems: MenuItem[]
): StockShortfall[] {
  const recipeByMenuItem = new Map(recipes.map((r) => [r.menuItemId, r]));
  const materialById = new Map(rawMaterials.map((m) => [m.id, m]));
  const menuById = new Map(menuItems.map((m) => [m.id, m]));

  const qtyByMenuItem = new Map<string, number>();
  const nameByMenuItem = new Map<string, string>();
  for (const l of lines) {
    qtyByMenuItem.set(l.menuItemId, (qtyByMenuItem.get(l.menuItemId) ?? 0) + l.qty);
    nameByMenuItem.set(l.menuItemId, l.name);
  }

  const shortfalls: StockShortfall[] = [];

  qtyByMenuItem.forEach((requestedQty, menuItemId) => {
    const menuItem = menuById.get(menuItemId);
    const name = nameByMenuItem.get(menuItemId) ?? menuItem?.name ?? "Item";
    const override = menuItem?.manualStockOverride;

    // Manual pre-prepared pool takes priority over the recipe check.
    if (override && override.portionsAvailable != null) {
      if (requestedQty > override.portionsAvailable) {
        shortfalls.push({
          menuItemId,
          name,
          requestedQty,
          availableQty: Math.max(0, override.portionsAvailable),
        });
      }
      return;
    }

    const maxServable = getMaxServablePortions(menuItemId, recipeByMenuItem, materialById);
    if (maxServable === null) return; // untracked — no recipe, always allowed
    if (requestedQty > maxServable) {
      const recipe = recipeByMenuItem.get(menuItemId)!;
      let limiting: string | undefined;
      let limitingLeft = Infinity;
      for (const ing of recipe.ingredients) {
        const mat = materialById.get(ing.rawMaterialId);
        const need = requiredPerPlate(ing, mat);
        if (need === null) continue;
        const possible = Math.floor((mat?.currentStock ?? 0) / need);
        if (possible < limitingLeft) {
          limitingLeft = possible;
          limiting = mat?.name;
        }
      }
      shortfalls.push({ menuItemId, name, requestedQty, availableQty: maxServable, limitingIngredient: limiting });
    }
  });

  return shortfalls;
}

/**
 * Applies the stock cost of a completed sale — call ONLY after the order
 * has been durably saved. Deduction problems are logged, never thrown: the
 * bill is already final and must never be rolled back over a stock-ledger
 * hiccup.
 *   1. Decrements raw materials per recipe (aggregated across all lines,
 *      each line converted into the material's own stock unit).
 *   2. Decrements any manual pre-prepared override pools, auto-disabling
 *      the item once its pool reaches 0.
 *
 * `rawMaterials` is optional purely for backward compatibility: without it,
 * recipe lines are read in the material's own unit — identical to pre-Sprint-2
 * behaviour. deductStockForOrder() always supplies it.
 */
export async function deductStockForSale(
  businessId: string,
  lines: LineItem[],
  recipes: Recipe[],
  menuItems: MenuItem[],
  rawMaterials: RawMaterial[] = []
): Promise<void> {
  const recipeByMenuItem = new Map(recipes.map((r) => [r.menuItemId, r]));
  const menuById = new Map(menuItems.map((m) => [m.id, m]));
  const materialById = new Map(rawMaterials.map((m) => [m.id, m]));

  const qtyByMenuItem = new Map<string, number>();
  for (const l of lines) {
    qtyByMenuItem.set(l.menuItemId, (qtyByMenuItem.get(l.menuItemId) ?? 0) + l.qty);
  }

  const deductions: Record<string, number> = {};
  qtyByMenuItem.forEach((qty, menuItemId) => {
    const recipe = recipeByMenuItem.get(menuItemId);
    if (!recipe) return;
    for (const ing of recipe.ingredients) {
      const material = materialById.get(ing.rawMaterialId);
      // No material row (legacy call site with no rawMaterials, or an orphaned
      // ingredient) → fall back to the raw quantity, exactly as before.
      const perPlate = material
        ? ingredientQtyInStockUnit(ing, material)
        : ing.qtyPerUnit;
      if (perPlate === null || !(perPlate > 0)) continue;
      deductions[ing.rawMaterialId] = (deductions[ing.rawMaterialId] ?? 0) + perPlate * qty;
    }
  });

  if (Object.keys(deductions).length > 0) {
    try {
      await dbAtomicDeductRawMaterials(businessId, deductions);
    } catch (err) {
      console.error("[stockEngine] raw material deduction failed", err);
    }
  }

  const overrideUpdates: Promise<void>[] = [];
  qtyByMenuItem.forEach((qty, menuItemId) => {
    const item = menuById.get(menuItemId);
    if (!item?.manualStockOverride) return;
    const remaining = Math.max(0, item.manualStockOverride.portionsAvailable - qty);
    overrideUpdates.push(
      dbSaveMenuItem(
        {
          ...item,
          manualStockOverride: { ...item.manualStockOverride, portionsAvailable: remaining },
          isAvailable: remaining > 0 ? item.isAvailable : false,
          updatedAt: new Date().toISOString(),
        },
        businessId
      ).catch((err) => {
        console.error("[stockEngine] override pool update failed", err);
      })
    );
  });
  await Promise.all(overrideUpdates);
}

/**
 * Convenience wrapper used by checkout flows (POS quick billing + table
 * settle). Loads the business's recipes, menu items and raw materials from
 * IDB itself, then runs deductStockForSale — so call sites stay one line and
 * there is exactly ONE deduction code path in the app. Fire-and-forget by
 * design: any failure is logged and swallowed, because the bill is already
 * durably saved and must never be affected by a stock-ledger hiccup.
 */
export async function deductStockForOrder(
  businessId: string,
  lines: LineItem[]
): Promise<void> {
  try {
    if (lines.length === 0) return;
    const [recipes, menuItems] = await Promise.all([
      dbGetAllRecipes(businessId),
      dbGetAllMenuItems(businessId),
    ]);
    // Nothing tracked → nothing to do (the common case for new businesses).
    if (recipes.length === 0 && !menuItems.some((m) => m.manualStockOverride)) return;
    // Materials are only needed for unit conversion on recipe lines — skip the
    // read entirely when there are no recipes to convert.
    const rawMaterials = recipes.length > 0 ? await dbGetAllRawMaterials(businessId) : [];
    await deductStockForSale(businessId, lines, recipes, menuItems, rawMaterials);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(STOCK_UPDATED_EVENT));
    }
  } catch (err) {
    console.error("[stockEngine] deductStockForOrder failed", err);
  }
}
