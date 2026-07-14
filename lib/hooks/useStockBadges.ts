"use client";

import { useEffect, useState } from "react";
import type { MenuItem, Recipe, RawMaterial } from "@/lib/types";
import {
  getMaxServablePortions,
  STOCK_UPDATED_EVENT,
} from "@/lib/utils/stockEngine";

/**
 * Inventory Sprint 3 — shared stock data for POS tile badges.
 *
 * One module-level cache is shared by ALL mounted tiles, so a 200-item grid
 * costs exactly one recipes read + one raw-materials read from IDB, not 200.
 * The cache refreshes when stockEngine fires STOCK_UPDATED_EVENT after a
 * deduction, so badges stay live as sales happen — no polling.
 *
 * Manual pre-prepared pools are intentionally NOT cached here: they live on
 * the MenuItem itself, which every tile already receives fresh from
 * AppContext state, so pool edits reflect instantly without a reload.
 */

interface StockCache {
  recipeByMenuItem: Map<string, Recipe>;
  materialById: Map<string, RawMaterial>;
}

let cache: StockCache | null = null;
let cacheUid: string | null = null;
let loading = false;
const subscribers = new Set<() => void>();

function notifyAll(): void {
  subscribers.forEach((fn) => fn());
}

async function refreshCache(businessId: string): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    const db = await import("@/lib/db");
    const [recipes, materials] = await Promise.all([
      db.dbGetAllRecipes(businessId),
      db.dbGetAllRawMaterials(businessId),
    ]);
    cache = {
      recipeByMenuItem: new Map(recipes.map((r) => [r.menuItemId, r])),
      materialById: new Map(materials.map((m) => [m.id, m])),
    };
    cacheUid = businessId;
  } catch {
    // Badge data is cosmetic — never let a read failure surface to the POS.
    cache = null;
    cacheUid = null;
  } finally {
    loading = false;
    notifyAll();
  }
}

/**
 * Remaining servable portions for one menu item, or null when the item is
 * untracked (no recipe AND no manual pool) — untracked items show no badge.
 *
 * Priority mirrors stockEngine.checkStock exactly:
 *   1. manualStockOverride pool (read live from the item prop)
 *   2. recipe-based max from cached raw-material stock
 */
export function useStockRemaining(
  item: MenuItem,
  businessId: string | undefined
): number | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!businessId) return;
    const bump = () => setTick((n) => n + 1);
    subscribers.add(bump);
    if (!cache || cacheUid !== businessId) {
      refreshCache(businessId);
    }
    const onStockUpdated = () => refreshCache(businessId);
    window.addEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
    return () => {
      subscribers.delete(bump);
      window.removeEventListener(STOCK_UPDATED_EVENT, onStockUpdated);
    };
  }, [businessId]);

  if (item.manualStockOverride) {
    return Math.max(0, item.manualStockOverride.portionsAvailable);
  }
  if (!cache || cacheUid !== businessId) return null;
  return getMaxServablePortions(
    item.id,
    cache.recipeByMenuItem,
    cache.materialById
  );
}
