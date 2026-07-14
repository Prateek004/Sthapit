"use client";
import { useApp } from "@/lib/store/AppContext";
import type { MenuItem } from "@/lib/types";
import { fmtRupee } from "@/lib/utils";
import { useStockRemaining } from "@/lib/hooks/useStockBadges";
import { LOW_STOCK_BADGE_THRESHOLD } from "@/lib/utils/stockEngine";
import { Plus, Minus, CheckCircle2 } from "lucide-react";

interface Props {
  item: MenuItem;
  onConfigPress: (item: MenuItem) => void;
  compact?: boolean;
}

export default function MenuItemCard({
  item,
  onConfigPress,
  compact = false,
}: Props) {
  const { state, addToCart, updateCartQty, showToast } = useApp();

  // Sprint 3: remaining servable portions (null = untracked, no badge shown).
  // Cosmetic only — tiles stay tappable; the hard/soft gate is at checkout.
  const remaining = useStockRemaining(item, state.session?.businessId);
  const outOfStock = remaining !== null && remaining <= 0;
  const lowStock =
    remaining !== null && remaining > 0 && remaining <= LOW_STOCK_BADGE_THRESHOLD;

  // Total qty of this item across all cart entries (different customisations)
  const cartEntries = state.cart.filter((c) => c.menuItemId === item.id);
  const cartQty = cartEntries.reduce((s, c) => s + c.qty, 0);

  const hasOptions =
    (item.addOns && item.addOns.length > 0) ||
    (item.sizes && item.sizes.length > 0) ||
    (item.portionEnabled && item.portions && item.portions.length > 0);

  /**
   * Tap behaviour:
   * - Unavailable → toast, do NOT add to cart
   * - Has options  → always open config modal (user must choose size/add-ons)
   * - No options, already in cart → increment the single cart entry directly
   * - No options, not in cart → fast-add qty 1
   */
  const handlePress = () => {
    if (!item.isAvailable) {
      showToast("Item unavailable — mark available in Menu", "error");
      return;
    }

    if (hasOptions) {
      onConfigPress(item);
      return;
    }

    if (cartEntries.length === 1) {
      updateCartQty(cartEntries[0].cartId, cartEntries[0].qty + 1);
    } else {
      addToCart({
        cartId: crypto.randomUUID(),
        menuItemId: item.id,
        name: item.name,
        unitPricePaise: item.pricePaise,
        qty: 1,
        selectedAddOns: [],
      });
    }
  };

  /**
   * Minus button — decrement without opening modal.
   * stopPropagation so the parent card button doesn't also fire.
   */
  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartEntries.length !== 1) return;
    const entry = cartEntries[0];
    updateCartQty(entry.cartId, entry.qty - 1);
  };

  /**
   * Plus inside the stepper — stopPropagation so parent doesn't double-fire.
   */
  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    handlePress();
  };

  const isOwner = state.session?.role === "owner";

  // ── Compact card (POS grid) ───────────────────────────────────────────────
  // Entire tile is now a <button> so tapping anywhere adds the item.
  if (compact) {
    return (
      <button
        onClick={handlePress}
        className={`relative w-full rounded-xl border transition-all text-left press ${
          !item.isAvailable
            ? "opacity-40 border-gray-100 bg-gray-50"
            : cartQty > 0
            ? "border-primary-300 bg-primary-50"
            : "border-gray-100 bg-white"
        }`}
      >
        <div className="p-2.5 pb-1.5">
          <div className="flex items-center justify-between mb-1">
            <span
              className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center shrink-0 ${
                item.isVeg ? "border-green-600" : "border-red-500"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  item.isVeg ? "bg-green-600" : "bg-red-500"
                }`}
              />
            </span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                !item.isAvailable
                  ? "bg-gray-100 text-gray-500"
                  : outOfStock
                  ? "bg-red-100 text-red-600"
                  : lowStock
                  ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {!item.isAvailable
                ? "Out"
                : outOfStock
                ? "No stock"
                : lowStock
                ? `Only ${remaining} left`
                : "In Stock"}
            </span>
          </div>
          <p className={`text-xs font-bold leading-tight line-clamp-2 min-h-[2rem] ${!item.isAvailable ? "text-gray-400 line-through" : "text-gray-900"}`}>
            {item.name}
          </p>
          {hasOptions && (
            <p className="text-[9px] text-primary-400 font-semibold mt-0.5">
              Customisable
            </p>
          )}
        </div>

        <div className="flex items-center justify-between px-2.5 pb-2.5 pt-0">
          <span className="text-sm font-black text-gray-900">
            {fmtRupee(item.pricePaise)}
          </span>

          {/* Qty stepper for no-option items already in cart */}
          {!hasOptions && cartQty > 0 ? (
            <div
              className="flex items-center gap-1 bg-primary-500 rounded-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleDecrement}
                disabled={!item.isAvailable}
                className="w-6 h-6 flex items-center justify-center press"
              >
                <Minus size={10} className="text-white" />
              </button>
              <span className="text-white text-xs font-black w-4 text-center">
                {cartQty}
              </span>
              <button
                onClick={handleIncrement}
                disabled={!item.isAvailable}
                className="w-6 h-6 flex items-center justify-center press"
              >
                <Plus size={10} className="text-white" />
              </button>
            </div>
          ) : (
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
                cartQty > 0
                  ? "bg-primary-500 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {hasOptions && cartQty > 0 ? (
                <>
                  <CheckCircle2 size={11} />
                  <span>{cartQty}</span>
                </>
              ) : (
                <>
                  <Plus size={11} />
                  <span>{hasOptions ? "Choose" : "Add"}</span>
                </>
              )}
            </div>
          )}
        </div>
      </button>
    );
  }

  // ── Full card (desktop / non-compact) ──────────────────────────────────────
  return (
    <button
      onClick={handlePress}
      className={`relative w-full p-3 rounded-2xl border-2 text-left transition-all press ${
        !item.isAvailable
          ? "opacity-40 border-gray-100 bg-gray-50"
          : cartQty > 0
          ? "border-primary-300 bg-primary-50"
          : "border-gray-100 bg-white hover:border-gray-200"
      }`}
    >
      {/* Top row */}
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center shrink-0 ${
            item.isVeg ? "border-green-600" : "border-red-500"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              item.isVeg ? "bg-green-600" : "bg-red-500"
            }`}
          />
        </span>
        {!item.isAvailable && (
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">
            Unavailable
          </span>
        )}
        {item.isAvailable && (outOfStock || lowStock) && (
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              outOfStock ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
            }`}
          >
            {outOfStock ? "No stock" : `Only ${remaining} left`}
          </span>
        )}
        {hasOptions && item.isAvailable && (
          <span className="text-[9px] text-primary-400 font-bold ml-auto">
            Customisable
          </span>
        )}
      </div>

      {/* Name */}
      <p className={`text-sm font-bold leading-tight line-clamp-2 mb-2 min-h-[2.5rem] ${!item.isAvailable ? "text-gray-400 line-through" : "text-gray-900"}`}>
        {item.name}
      </p>

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-black text-gray-900">
            {fmtRupee(item.pricePaise)}
          </span>
          {isOwner && item.costPricePaise != null && item.costPricePaise > 0 && (
            <p className="text-[10px] text-gray-400">
              Cost: {fmtRupee(item.costPricePaise)}
            </p>
          )}
        </div>

        {/* Stepper for no-option items already in cart */}
        {!hasOptions && cartQty > 0 ? (
          <div
            className="flex items-center gap-1 bg-primary-500 rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleDecrement}
              disabled={!item.isAvailable}
              className="w-8 h-8 flex items-center justify-center press"
            >
              <Minus size={12} className="text-white" />
            </button>
            <span className="text-white text-sm font-black w-5 text-center">
              {cartQty}
            </span>
            <button
              onClick={handleIncrement}
              disabled={!item.isAvailable}
              className="w-8 h-8 flex items-center justify-center press"
            >
              <Plus size={12} className="text-white" />
            </button>
          </div>
        ) : (
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              cartQty > 0 ? "bg-primary-500" : "bg-gray-100"
            }`}
          >
            {cartQty > 0 ? (
              <span className="text-white text-xs font-black leading-none">
                {cartQty}
              </span>
            ) : (
              <Plus size={14} className="text-gray-500" />
            )}
          </div>
        )}
      </div>
    </button>
  );
}
