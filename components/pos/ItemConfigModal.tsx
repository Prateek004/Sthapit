"use client";
import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import { useApp } from "@/lib/store/AppContext";
import type { MenuItem, AddOn } from "@/lib/types";
import { fmtRupee } from "@/lib/utils";
import { Plus, Minus } from "lucide-react";

interface Props { item: MenuItem | null; onClose: () => void }

export default function ItemConfigModal({ item, onClose }: Props) {
  const { addToCart, showToast } = useApp();
  const [qty, setQty] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedPortion, setSelectedPortion] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!item) return;
    setQty(1);
    setSelectedSize(item.sizes?.[0]?.label ?? null);
    setSelectedPortion(item.portions?.[0]?.label ?? null);
    setSelectedAddOns([]);
    setNotes("");
  }, [item]);

  const sizePrice = item?.sizes?.find((s) => s.label === selectedSize)?.pricePaise;
  const portionPrice = item?.portions?.find((p) => p.label === selectedPortion)?.pricePaise;
  const basePrice = sizePrice ?? portionPrice ?? item?.pricePaise ?? 0;
  const addOnTotal = selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
  const unitPrice = basePrice + addOnTotal;
  const lineTotal = unitPrice * qty;

  const toggleAddOn = (ao: AddOn) => {
    setSelectedAddOns((prev) =>
      prev.some((a) => a.id === ao.id) ? prev.filter((a) => a.id !== ao.id) : [...prev, ao]
    );
  };

  const handleAdd = () => {
    if (!item) return;
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
    showToast(`${item.name} added`);
    onClose();
  };

  return (
    <Modal open={!!item} onClose={onClose} title={item?.name ?? ""}>
      {item && (
        <div className="px-5 pb-6 space-y-4 pt-1">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center shrink-0 ${item.isVeg ? "border-green-600" : "border-red-500"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-500"}`} />
            </span>
            <span className="text-sm text-gray-500">{item.isVeg ? "Veg" : "Non-Veg"}</span>
            <span className="ml-auto text-base font-black text-gray-900">{fmtRupee(item.pricePaise)}</span>
          </div>

          {item.sizes && item.sizes.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Size</p>
              <div className="flex gap-2 flex-wrap">
                {item.sizes.map((s) => (
                  <button key={s.label} onClick={() => setSelectedSize(s.label)}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all press ${selectedSize === s.label ? "border-primary-500 bg-primary-50 text-primary-600" : "border-gray-200 text-gray-700"}`}>
                    {s.label}
                    {s.pricePaise !== item.pricePaise && <span className="ml-1 text-xs opacity-60">{fmtRupee(s.pricePaise)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.portionEnabled && item.portions && item.portions.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Portion</p>
              <div className="flex gap-2 flex-wrap">
                {item.portions.map((p) => (
                  <button key={p.label} onClick={() => setSelectedPortion(p.label)}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all press ${selectedPortion === p.label ? "border-primary-500 bg-primary-50 text-primary-600" : "border-gray-200 text-gray-700"}`}>
                    {p.label}<span className="ml-1 text-xs opacity-60">{fmtRupee(p.pricePaise)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add-ons as pill toggles — same style as portions */}
          {item.addOns && item.addOns.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Add-ons</p>
              <div className="flex gap-2 flex-wrap">
                {item.addOns.map((ao) => {
                  const on = selectedAddOns.some((a) => a.id === ao.id);
                  return (
                    <button key={ao.id} onClick={() => toggleAddOn(ao)}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all press ${on ? "border-primary-500 bg-primary-50 text-primary-600" : "border-gray-200 text-gray-700"}`}>
                      {ao.name}
                      {ao.pricePaise > 0 && <span className="ml-1 text-xs opacity-60">+{fmtRupee(ao.pricePaise)}</span>}
                    </button>
                  );
                })}
              </div>
              {selectedAddOns.length > 0 && (
                <p className="text-xs text-primary-500 font-semibold mt-2">+{fmtRupee(addOnTotal)} add-ons selected</p>
              )}
            </div>
          )}

          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Special Instructions</p>
            <textarea className="bm-input h-auto py-3 resize-none" rows={2}
              placeholder="e.g. Less spicy, no onion…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <div className="flex items-center gap-2 bg-gray-100 rounded-2xl p-1">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center press">
                <Minus size={16} />
              </button>
              <span className="w-7 text-center font-black text-lg">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center press">
                <Plus size={16} className="text-white" />
              </button>
            </div>
            <button onClick={handleAdd} className="flex-1 h-12 bg-primary-500 text-white rounded-2xl font-bold flex items-center justify-between px-5 press shadow-md">
              <span>Add to Cart</span><span className="font-black">{fmtRupee(lineTotal)}</span>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
