"use client";
import { useApp } from "@/lib/store/AppContext";
import type { MenuItem } from "@/lib/types";
import { fmtRupee } from "@/lib/utils";
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
  const { state, addToCart, updateCartQty } = useApp();

  // Total qty of this item across all cart entries (different customisations)
  const cartEntries = state.cart.filter((c) => c.menuItemId === item.id);
  const cartQty = cartEntries.reduce((s, c) => s + c.qty, 0);

  const hasOptions =
    (item.addOns && item.addOns.length > 0) ||
    (item.sizes && item.sizes.length > 0) ||
    (item.portionEnabled && item.portions && item.portions.length > 0);

  /**
   * Tap behaviour:
   * - Unavailable → do nothing
   * - Has options  → always open config modal (user must choose size/add-ons)
   * - No options, already in cart → increment the single cart entry directly
   * - No options, not in cart → fast-add qty 1
   */
  const handlePress = () => {
    if (!item.isAvailable) return;

    if (hasOptions) {
      onConfigPress(item);
      return;
    }

    if (cartEntries.length === 1) {
      // Increment existing entry — no modal needed
      updateCartQty(cartEntries[0].cartId, cartEntries[0].qty + 1);
    } else {
      // Fast-add
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
   * Only visible when item is already in cart and has no options.
   */
  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartEntries.length !== 1) return;
    const entry = cartEntries[0];
    updateCartQty(entry.cartId, entry.qty - 1);
  };

  const isOwner = state.session?.role === "owner";

  if (compact) {
    return (
      <div
        className={`relative w-full rounded-xl border transition-all ${
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
                item.isAvailable
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {item.isAvailable ? "In Stock" : "Out"}
            </span>
          </div>
          <p className="text-xs font-bold text-gray-900 leading-tight line-clamp-2 min-h-[2rem]">
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
            <div className="flex items-center gap-1 bg-primary-500 rounded-lg overflow-hidden">
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
                onClick={handlePress}
                disabled={!item.isAvailable}
                className="w-6 h-6 flex items-center justify-center press"
              >
                <Plus size={10} className="text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={handlePress}
              disabled={!item.isAvailable}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all press ${
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
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Full card (desktop / non-compact) ──────────────────────────────────────
  return (
    <div
      className={`relative w-full p-3 rounded-2xl border-2 text-left transition-all ${
        !item.isAvailable
          ? "opacity-40 border-gray-100 bg-gray-50 cursor-not-allowed"
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
        {hasOptions && item.isAvailable && (
          <span className="text-[9px] text-primary-400 font-bold ml-auto">
            Customisable
          </span>
        )}
      </div>

      {/* Name */}
      <p
        className="text-sm font-bold text-gray-900 leading-tight line-clamp-2 mb-2 min-h-[2.5rem] cursor-pointer"
        onClick={handlePress}
      >
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
          <div className="flex items-center gap-1 bg-primary-500 rounded-xl overflow-hidden">
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
              onClick={handlePress}
              disabled={!item.isAvailable}
              className="w-8 h-8 flex items-center justify-center press"
            >
              <Plus size={12} className="text-white" />
            </button>
          </div>
        ) : (
          <button
            onClick={handlePress}
            disabled={!item.isAvailable}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors press ${
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
          </button>
        )}
      </div>
    </div>
  );
}
