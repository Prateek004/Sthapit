// Inventory Sprint — Unit registry + conversion + dynamic pricing.
//
// DESIGN CONTRACT
// ─ Every conversion is family-based: mass (base g), volume (base ml),
//   count (base piece). No business-value conversions are hardcoded —
//   the only constants here are physical/definitional (1 kg = 1000 g,
//   1 litre = 1000 ml, 1 dozen = 12 pieces).
// ─ Container-style units (packet, bottle, tray, box) and custom units are
//   their own identity: they convert only to themselves, because how much a
//   "packet" holds is business data the owner owns, not a constant.
// ─ Money stays INTEGER PAISE everywhere (project-wide invariant). Per-unit
//   cost is computed at full float precision internally and rounded to the
//   nearest paise only at the boundary.

export type UnitFamily = "mass" | "volume" | "count" | "unit";

interface UnitDef {
  /** Canonical id stored on items (lowercase). */
  id: string;
  label: string;
  family: UnitFamily;
  /** How many family-base units one of this unit equals (g / ml / piece).
   *  For family "unit" (containers & custom), factor is always 1 → identity. */
  factor: number;
}

/** Canonical unit registry. Order = dropdown display order. */
export const UNIT_DEFS: UnitDef[] = [
  { id: "piece",  label: "Piece",  family: "count",  factor: 1    },
  { id: "gram",   label: "Gram",   family: "mass",   factor: 1    },
  { id: "kg",     label: "Kg",     family: "mass",   factor: 1000 },
  { id: "litre",  label: "Litre",  family: "volume", factor: 1000 },
  { id: "ml",     label: "ML",     family: "volume", factor: 1    },
  { id: "packet", label: "Packet", family: "unit",   factor: 1    },
  { id: "bottle", label: "Bottle", family: "unit",   factor: 1    },
  { id: "dozen",  label: "Dozen",  family: "count",  factor: 12   },
  { id: "tray",   label: "Tray",   family: "unit",   factor: 1    },
  { id: "box",    label: "Box",    family: "unit",   factor: 1    },
];

/** Dropdown ids in canonical order. "custom" is appended by UIs that allow
 *  a free-text unit — a custom unit becomes its own identity unit. */
export const UNIT_IDS: string[] = UNIT_DEFS.map((u) => u.id);

/** Legacy aliases → canonical ids, so items saved before this module
 *  (units like "g", "pack", "can") keep converting correctly. */
const UNIT_ALIASES: Record<string, string> = {
  g: "gram",
  gm: "gram",
  grams: "gram",
  kgs: "kg",
  kilogram: "kg",
  l: "litre",
  ltr: "litre",
  liter: "litre",
  pcs: "piece",
  pc: "piece",
  pieces: "piece",
  pack: "packet",
  packets: "packet",
  bottles: "bottle",
  boxes: "box",
  trays: "tray",
};

function normalizeUnitId(unit: string): string {
  const key = unit.trim().toLowerCase();
  return UNIT_ALIASES[key] ?? key;
}

/** Resolve a unit string (canonical, alias, or custom) to a definition.
 *  Unknown strings become identity units in their own family — so custom
 *  units ("scoop", "can", "roll") always work, just without cross-unit
 *  conversion. */
export function getUnitDef(unit: string): UnitDef {
  const id = normalizeUnitId(unit);
  const known = UNIT_DEFS.find((u) => u.id === id);
  if (known) return known;
  return { id, label: unit.trim() || "Unit", family: "unit", factor: 1 };
}

/** Human label for any unit string (canonical, legacy alias, or custom). */
export function unitLabel(unit: string): string {
  return getUnitDef(unit).label;
}

/** True when two units can be converted into each other. Identity units
 *  ("unit" family, incl. custom) are compatible only with themselves. */
export function areUnitsCompatible(a: string, b: string): boolean {
  const da = getUnitDef(a);
  const db = getUnitDef(b);
  if (da.family === "unit" || db.family === "unit") return da.id === db.id;
  return da.family === db.family;
}

/**
 * Convert a quantity between compatible units.
 * Returns null when the units are incompatible (caller decides how to
 * surface that — never silently guesses).
 *
 *   convertQty(4, "dozen", "piece") → 48
 *   convertQty(250, "gram", "kg")   → 0.25
 *   convertQty(1, "bottle", "ml")   → null (owner-defined, not a constant)
 */
export function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
  if (!Number.isFinite(qty)) return null;
  const from = getUnitDef(fromUnit);
  const to = getUnitDef(toUnit);
  if (from.id === to.id) return qty;
  if (!areUnitsCompatible(fromUnit, toUnit)) return null;
  return (qty * from.factor) / to.factor;
}

/**
 * DYNAMIC PRICING — cost of ONE targetUnit given a purchase.
 * Full float precision internally; integer paise out.
 *
 *   costPerUnitPaise(45000, 5, "kg", "kg")      → 9000   (₹450/5kg → ₹90/kg)
 *   costPerUnitPaise(45000, 5, "kg", "gram")    → 9      (₹0.09/g)
 *   costPerUnitPaise(4800,  4, "dozen", "piece")→ 100    (₹48/4dz → ₹1/banana)
 *
 * Returns null when purchase data is unusable or units are incompatible.
 */
export function costPerUnitPaise(
  purchaseCostPaise: number,
  purchaseQty: number,
  purchaseUnit: string,
  targetUnit: string
): number | null {
  if (!Number.isFinite(purchaseCostPaise) || purchaseCostPaise < 0) return null;
  if (!Number.isFinite(purchaseQty) || purchaseQty <= 0) return null;
  const qtyInTarget = convertQty(purchaseQty, purchaseUnit, targetUnit);
  if (qtyInTarget === null || qtyInTarget <= 0) return null;
  return Math.round(purchaseCostPaise / qtyInTarget);
}

/**
 * DYNAMIC PRICING — cost of an arbitrary quantity, e.g. what a recipe line
 * consumes. Rounds once, at the end, so 250 g of a ₹90/kg item is exactly
 * 2250 paise (₹22.50) rather than 250 × round(9.0).
 */
export function costOfQtyPaise(
  purchaseCostPaise: number,
  purchaseQty: number,
  purchaseUnit: string,
  qty: number,
  qtyUnit: string
): number | null {
  if (!Number.isFinite(purchaseCostPaise) || purchaseCostPaise < 0) return null;
  if (!Number.isFinite(purchaseQty) || purchaseQty <= 0) return null;
  if (!Number.isFinite(qty) || qty < 0) return null;
  const qtyInPurchaseUnit = convertQty(qty, qtyUnit, purchaseUnit);
  if (qtyInPurchaseUnit === null) return null;
  return Math.round((purchaseCostPaise * qtyInPurchaseUnit) / purchaseQty);
}

/**
 * Effective per-stock-unit cost for a raw material, preferring exact
 * purchase-derived pricing over the stored (rounded) costPaise snapshot.
 * Single source of truth used by Inventory, Recipe costing, and Reports.
 */
export function effectiveUnitCostPaise(item: {
  unit: string;
  costPaise?: number;
  purchaseQty?: number;
  purchaseUnit?: string;
  purchaseCostPaise?: number;
}): number | null {
  if (
    item.purchaseCostPaise != null &&
    item.purchaseQty != null &&
    item.purchaseQty > 0 &&
    item.purchaseUnit
  ) {
    const derived = costPerUnitPaise(
      item.purchaseCostPaise,
      item.purchaseQty,
      item.purchaseUnit,
      item.unit
    );
    if (derived !== null) return derived;
  }
  return item.costPaise ?? null;
}
