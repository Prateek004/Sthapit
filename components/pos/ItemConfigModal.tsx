"use client";
import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import QtyStepper from "@/components/ui/QtyStepper";
import { useApp } from "@/lib/store/AppContext";
import type { MenuItem, AddOn } from "@/lib/types";
import { fmtRupee, getItemPortions } from "@/lib/utils";
import { Plus, Minus } from "lucide-react";

interface Props {
  item: MenuItem | null;
  onClose: () => void;
}

export default function ItemConfigModal({ item, onClose }: Props) {
  const { state, addToCart, showToast } = useApp();
  const categories = state.categories;

  const [qty, setQty] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedPortion, setSelectedPortion] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  const [notes, setNotes] = useState("");

  const portions = item ? getItemPortions(item, categories) : [];

  useEffect(() => {
    if (!item) return;
    setQty(1);
    setSelectedSize(item.sizes?.[0]?.label ?? null);
    const pList = getItemPortions(item, categories);
    // Default to Full / Large (last portion) or first portion
    const defaultP = pList.find((x) => x.label === "Full" || x.label === "Large")?.label ?? pList[0]?.label ?? null;
    setSelectedPortion(defaultP);
    setSelectedAddOns([]);
    setNotes("");
  }, [item]);

  if (!item) return null;

  const sizePrice = item.sizes?.find((s) => s.label === selectedSize)?.pricePaise;
  const portionPrice = portions.find((p) => p.label === selectedPortion)?.pricePaise;
  const basePrice = sizePrice ?? portionPrice ?? item.pricePaise ?? 0;
  const addOnTotal = selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
  const unitPrice = basePrice + addOnTotal;
  const lineTotal = unitPrice * qty;

  const toggleAddOn = (ao: AddOn) => {
    setSelectedAddOns((prev) =>
      prev.some((a) => a.id === ao.id)
        ? prev.filter((a) => a.id !== ao.id)
        : [...prev, ao]
    );
  };

  const handleAdd = () => {
    addToCart({
      cartId: crypto.randomUUID(),
      menuItemId: item.id,
      name: item.name,
      unitPricePaise: unitPrice,
      qty,
      selectedSize: selectedSize ?? undefined,
      selectedPortion: selectedPortion ?? undefined,
      selectedAddOns: [...selectedAddOns],
      notes: notes.trim() || undefined,
    });
    showToast(`${item.name} added ✓`);
    onClose();
  };

  return (
    <Modal open={!!item} onClose={onClose} title={item.name}>
      <div className="px-5 pb-6 space-y-4 pt-1">
        {/* Veg / Non-veg + base price */}
        <div className="flex items-center gap-2">
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
          <span className="text-sm text-gray-500">
            {item.isVeg ? "Veg" : "Non-Veg"}
          </span>
          <span className="ml-auto text-base font-black text-gray-900">
            {fmtRupee(item.pricePaise)}
          </span>
        </div>

        {/* Sizes */}
        {item.sizes && item.sizes.length > 0 && (
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Size</p>
            <div className="flex gap-2 flex-wrap">
              {item.sizes.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setSelectedSize(s.label)}
                  className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all press ${
                    selectedSize === s.label
                      ? "border-primary-500 bg-primary-50 text-primary-600"
                      : "border-gray-200 text-gray-700"
                  }`}
                >
                  {s.label}
                  {s.pricePaise !== item.pricePaise && (
                    <span className="ml-1 text-xs opacity-60">
                      {fmtRupee(s.pricePaise)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Portions */}
        {portions.length > 0 && (
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Portion</p>
            <div className="flex gap-2 flex-wrap">
              {portions.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSelectedPortion(p.label)}
                  className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all press ${
                    selectedPortion === p.label
                      ? "border-primary-500 bg-primary-50 text-primary-600 font-extrabold shadow-2xs"
                      : "border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {p.label}
                  <span className="ml-1.5 text-xs opacity-75 font-bold">
                    ({fmtRupee(p.pricePaise)})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add-ons */}
        {item.addOns && item.addOns.length > 0 && (
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Add-ons</p>
            <div className="flex gap-2 flex-wrap">
              {item.addOns.map((ao) => {
                const on = selectedAddOns.some((a) => a.id === ao.id);
                return (
                  <button
                    key={ao.id}
                    onClick={() => toggleAddOn(ao)}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all press ${
                      on
                        ? "border-primary-500 bg-primary-50 text-primary-600"
                        : "border-gray-200 text-gray-700"
                    }`}
                  >
                    {ao.name}
                    {ao.pricePaise > 0 && (
                      <span className="ml-1 text-xs opacity-60">
                        +{fmtRupee(ao.pricePaise)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedAddOns.length > 0 && (
              <p className="text-xs text-primary-500 font-semibold mt-2">
                +{fmtRupee(addOnTotal)} add-ons selected
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <p className="text-sm font-bold text-gray-700 mb-2">
            Special Instructions
          </p>
          <textarea
            className="bm-input h-auto py-3 resize-none"
            rows={2}
            placeholder="e.g. Less spicy, no onion…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Qty + Add button */}
        <div className="flex items-center gap-3 pt-1">
          <QtyStepper
            value={qty}
            onChange={(newQty) => setQty(Math.max(1, newQty))}
            min={1}
            size="lg"
            minusBg="white"
            plusBg="#E8590C"
            minusColor="#374151"
            plusColor="white"
          />
          <button
            onClick={handleAdd}
            className="flex-1 h-12 bg-primary-500 text-white rounded-2xl font-bold flex items-center justify-between px-5 press shadow-md"
          >
            <span>Add to Cart</span>
            <span className="font-black">{fmtRupee(lineTotal)}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
