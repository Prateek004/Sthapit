"use client";
import { useApp } from "@/lib/store/AppContext";
import type { MenuItem } from "@/lib/types";
import { fmtRupee } from "@/lib/utils";
import { Plus, CheckCircle2 } from "lucide-react";

interface Props {
  item: MenuItem;
  onConfigPress: (item: MenuItem) => void;
  compact?: boolean;
}

export default function MenuItemCard({ item, onConfigPress, compact = false }: Props) {
  const { state, addToCart } = useApp();

  const cartQty = state.cart
    .filter((c) => c.menuItemId === item.id)
    .reduce((s, c) => s + c.qty, 0);

  // ALWAYS open config modal if item has add-ons, sizes, or portions
  const hasOptions =
    (item.addOns && item.addOns.length > 0) ||
    (item.sizes && item.sizes.length > 0) ||
    (item.portionEnabled && item.portions && item.portions.length > 0);

  const handlePress = () => {
    if (!item.isAvailable) return;
    if (hasOptions) {
      // Always open modal when item has any options
      onConfigPress(item);
    } else {
      // Fast add only when truly no options at all
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

  const isOwner = state.session?.role === "owner";

  if (compact) {
    return (
      <div className={`relative w-full rounded-xl border transition-all ${!item.isAvailable ? "opacity-40 border-gray-100 bg-gray-50" : cartQty > 0 ? "border-primary-300 bg-primary-50" : "border-gray-100 bg-white"}`}>
        <div className="p-2.5 pb-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center shrink-0 ${item.isVeg ? "border-green-600" : "border-red-500"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-500"}`} />
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.isAvailable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {item.isAvailable ? "In Stock" : "Out"}
            </span>
          </div>
          <p className="text-xs font-bold text-gray-900 leading-tight line-clamp-2 min-h-[2rem]">{item.name}</p>
          {hasOptions && (
            <p className="text-[9px] text-primary-400 font-semibold mt-0.5">Customisable</p>
          )}
        </div>
        <div className="flex items-center justify-between px-2.5 pb-2.5 pt-0">
          <span className="text-sm font-black text-gray-900">{fmtRupee(item.pricePaise)}</span>
          <button
            onClick={handlePress}
            disabled={!item.isAvailable}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all press ${cartQty > 0 ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-700"}`}>
            {cartQty > 0
              ? <><CheckCircle2 size={11} /><span>{cartQty}</span></>
              : <><Plus size={11} /><span>{hasOptions ? "Choose" : "Add"}</span></>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handlePress}
      disabled={!item.isAvailable}
      className={`relative w-full p-3 rounded-2xl border-2 text-left transition-all press ${!item.isAvailable ? "opacity-40 border-gray-100 bg-gray-50 cursor-not-allowed" : cartQty > 0 ? "border-primary-300 bg-primary-50" : "border-gray-100 bg-white hover:border-gray-200"}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center shrink-0 ${item.isVeg ? "border-green-600" : "border-red-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-500"}`} />
        </span>
        {!item.isAvailable && <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">Unavailable</span>}
        {hasOptions && item.isAvailable && (
          <span className="text-[9px] text-primary-400 font-bold ml-auto">Customisable</span>
        )}
      </div>
      <p className="text-sm font-bold text-gray-900 leading-tight line-clamp-2 mb-2 min-h-[2.5rem]">{item.name}</p>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-black text-gray-900">{fmtRupee(item.pricePaise)}</span>
          {isOwner && item.costPricePaise != null && item.costPricePaise > 0 && (
            <p className="text-[10px] text-gray-400">Cost: {fmtRupee(item.costPricePaise)}</p>
          )}
        </div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${cartQty > 0 ? "bg-primary-500" : "bg-gray-100"}`}>
          {cartQty > 0
            ? <span className="text-white text-xs font-black leading-none">{cartQty}</span>
            : <Plus size={14} className="text-gray-500" />}
        </div>
      </div>
    </button>
  );
}
