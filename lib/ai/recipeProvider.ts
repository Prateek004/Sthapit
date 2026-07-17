import type { BusinessType } from "@/lib/types";

/**
 * RECIPE AI — provider interface only.
 *
 * DESIGN CONTRACT
 * ─ No AI or external-search provider is configured in this build. Nothing
 *   here calls a network API, and nothing fabricates recipe data. When no
 *   real provider is plugged in, suggestRecipe() always resolves to `null`
 *   — an honest "not configured" signal the UI shows verbatim.
 * ─ This file exists so a real provider (an LLM call, a recipe-search API,
 *   whatever is chosen later) can be dropped in behind this interface with
 *   zero changes to the menu-creation flow or the review/confirm UI.
 * ─ A suggestion is NEVER saved on its own. The caller always routes it
 *   through a review screen the owner must explicitly confirm.
 */

export interface RecipeSuggestionIngredient {
  /** Ingredient name as it should appear in Inventory. */
  name: string;
  /** Suggested quantity used per ONE plate/unit sold. */
  qty: number;
  /** Suggested unit for that quantity (canonical id or custom text). */
  unit: string;
}

export interface RecipeSuggestion {
  menuItemName: string;
  /** Suggested menu category name (matched against existing categories by
   *  the caller — this module never creates or renames categories). */
  category?: string;
  ingredients: RecipeSuggestionIngredient[];
  /** How many plates/portions one prep batch yields, in `yieldUnit`. */
  yieldQty?: number;
  yieldUnit?: string;
  /** Short prose preparation steps, shown as-is for the owner to edit. */
  preparation?: string;
  /** Typical prep/cooking waste, as a percent of purchased quantity. */
  typicalWastePercent?: number;
}

export interface RecipeAIProvider {
  /** false = no real provider wired up; suggestRecipe() always returns null. */
  readonly isConfigured: boolean;
  /** Look up a suggested recipe for a menu item by name. Must never throw —
   *  callers treat a rejected promise the same as a real failure, but a
   *  provider should prefer resolving `null` when it has nothing to offer. */
  suggestRecipe(
    menuItemName: string,
    businessType?: BusinessType
  ): Promise<RecipeSuggestion | null>;
}

/** Default provider: always "not configured". This is not a stub with fake
 *  data — it is the correct, honest behavior until a real provider exists. */
class NotConfiguredRecipeProvider implements RecipeAIProvider {
  readonly isConfigured = false;
  async suggestRecipe(): Promise<RecipeSuggestion | null> {
    return null;
  }
}

let activeProvider: RecipeAIProvider = new NotConfiguredRecipeProvider();

/** Single accessor every caller uses — never construct a provider directly. */
export function getRecipeAIProvider(): RecipeAIProvider {
  return activeProvider;
}

/** Plug in a real provider later (e.g. at app bootstrap) without touching
 *  any UI that consumes getRecipeAIProvider(). */
export function setRecipeAIProvider(provider: RecipeAIProvider): void {
  activeProvider = provider;
}
