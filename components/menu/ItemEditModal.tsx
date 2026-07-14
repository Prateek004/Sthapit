"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import { fmtRupee } from "@/lib/utils";
import type { MenuItem, MenuCategory, AddOn } from "@/lib/types";
import { Plus, X } from "lucide-react";

export default function ItemEditModal({
  item,
  categories,
  onClose,
  onSave,
}: {
  item: Partial<MenuItem> | null;
  categories: MenuCategory[];
  onClose: () => void;
  onSave: (i: MenuItem) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [catId, setCatId] = useState(item?.categoryId ?? categories[0]?.id ?? "");
  const [priceRupee, setPriceRupee] = useState(item?.pricePaise ? String(item.pricePaise / 100) : "");
  const [costRupee, setCostRupee] = useState(item?.costPricePaise ? String(item.costPricePaise / 100) : "");
  const [isVeg, setIsVeg] = useState(item?.isVeg ?? true);
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [portionEnabled, setPortionEnabled] = useState(item?.portionEnabled ?? false);
  const [portions, setPortions] = useState<{ label: string; pricePaise: number }[]>(
    item?.portions && item.portions.length > 0
      ? item.portions
      : [{ label: "Half", pricePaise: 0 }, { label: "Full", pricePaise: 0 }]
  );
  const [addOns, setAddOns] = useState<AddOn[]>(item?.addOns ?? []);
  const [aoName, setAoName] = useState("");
  const [aoPrice, setAoPrice] = useState("");
  // Sprint 3: manual pre-prepared stock pool. Empty string = tracking off.
  const [prepPool, setPrepPool] = useState(
    item?.manualStockOverride != null
      ? String(item.manualStockOverride.portionsAvailable)
      : ""
  );

  const updatePortion = (idx: number, field: "label" | "price", val: string) => {
    setPortions((prev) =>
      prev.map((p, i) =>
        i === idx
          ? { ...p, ...(field === "label" ? { label: val } : { pricePaise: Math.round(Number(val) * 100) || 0 }) }
          : p
      )
    );
  };
  const addPortion = () => setPortions((prev) => [...prev, { label: "", pricePaise: 0 }]);
  const removePortion = (idx: number) => setPortions((prev) => prev.filter((_, i) => i !== idx));

  const addAddOn = () => {
    const trimmed = aoName.trim();
    if (!trimmed) return;
    setAddOns((prev) => [...prev, { id: crypto.randomUUID(), name: trimmed, pricePaise: Math.round(Number(aoPrice) * 100) || 0 }]);
    setAoName("");
    setAoPrice("");
  };

  const isNew = !item?.id;

  const handleSave = () => {
    if (!name.trim() || !catId) return;
    // Sprint 3: empty input = tracking off (undefined). A value (including 0)
    // sets the pool; 0 means sold out — the POS shows "No stock" and warns at
    // checkout. Negative/garbage input clamps to 0.
    const poolRaw = prepPool.trim();
    const poolNum =
      poolRaw === "" ? null : Math.max(0, Math.floor(Number(poolRaw)) || 0);
    onSave({
      id: item?.id ?? crypto.randomUUID(),
      name: name.trim(),
      categoryId: catId,
      pricePaise: Math.round(Number(priceRupee) * 100) || 0,
      costPricePaise: costRupee ? Math.round(Number(costRupee) * 100) : undefined,
      isVeg,
      isAvailable,
      portionEnabled,
      portions: portionEnabled ? portions : [],
      addOns,
      sizes: item?.sizes ?? [],
      fastAdd: item?.fastAdd,
      manualStockOverride:
        poolNum === null
          ? undefined
          : {
              portionsAvailable: poolNum,
              updatedAt: new Date().toISOString(),
            },
    });
  };

  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? "Add Item" : "Edit Item"} fullScreen>
      <div className="px-4 pb-10 pt-2 space-y-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Item Name *</label>
          <input className="bm-input" placeholder="e.g. Masala Chai" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Category *</label>
          <select className="bm-input" value={catId} onChange={(e) => setCatId(e.target.value)}>
            <option value="">Select category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Selling Price (&#8377;) *</label>
          <input type="number" className="bm-input" placeholder="0" value={priceRupee} onChange={(e) => setPriceRupee(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Cost Price (&#8377;) <span className="font-normal text-gray-400">optional</span></label>
          <input type="number" className="bm-input" placeholder="0" value={costRupee} onChange={(e) => setCostRupee(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Type</label>
          <div className="flex gap-2">
            <button onClick={() => setIsVeg(true)} className={`flex-1 h-11 rounded-xl border-2 font-bold text-sm press transition-all ${isVeg ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"}`}>
              Veg
            </button>
            <button onClick={() => setIsVeg(false)} className={`flex-1 h-11 rounded-xl border-2 font-bold text-sm press transition-all ${!isVeg ? "border-red-500 bg-red-50 text-red-600" : "border-gray-200 text-gray-500"}`}>
              Non-Veg
            </button>
          </div>
        </div>
        <Toggle label="Available" value={isAvailable} onChange={setIsAvailable} />
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <Toggle label="Portion pricing" desc="e.g. Half / Full with different prices" value={portionEnabled} onChange={setPortionEnabled} />
          {portionEnabled && (
            <div className="space-y-2 pt-1">
              {portions.map((p, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input className="bm-input flex-1" placeholder="Label (e.g. Half)" value={p.label} onChange={(e) => updatePortion(idx, "label", e.target.value)} />
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">&#8377;</span>
                    <input type="number" className="bm-input pl-7" placeholder="0" value={p.pricePaise ? String(p.pricePaise / 100) : ""} onChange={(e) => updatePortion(idx, "price", e.target.value)} />
                  </div>
                  {portions.length > 2 && (
                    <button onClick={() => removePortion(idx)} className="text-gray-300 hover:text-red-400 press shrink-0">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addPortion} className="flex items-center gap-1 text-xs font-bold text-primary-500 press">
                <Plus size={13} /> Add portion
              </button>
            </div>
          )}
        </div>
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-gray-700">Add-ons</p>
            <p className="text-xs text-gray-400">Extra toppings, sauces, sides, etc.</p>
          </div>
          {addOns.length > 0 && (
            <div className="space-y-2">
              {addOns.map((ao) => (
                <div key={ao.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 shadow-sm">
                  <span className="flex-1 text-sm font-semibold text-gray-800">{ao.name}</span>
                  {ao.pricePaise > 0 ? (
                    <span className="text-xs text-gray-400 shrink-0">+{fmtRupee(ao.pricePaise)}</span>
                  ) : (
                    <span className="text-xs text-gray-300 shrink-0">Free</span>
                  )}
                  <button onClick={() => setAddOns((p) => p.filter((a) => a.id !== ao.id))} className="text-gray-300 hover:text-red-400 press shrink-0 ml-1">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <input className="bm-input" placeholder="Add-on name e.g. Extra Cheese" value={aoName} onChange={(e) => setAoName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAddOn()} />
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">&#8377;</span>
                <input type="number" className="bm-input pl-7" placeholder="0 for free" value={aoPrice} onChange={(e) => setAoPrice(e.target.value)} />
              </div>
              <button onClick={addAddOn} disabled={!aoName.trim()} className="px-4 h-11 rounded-xl bg-primary-500 text-white font-bold press shadow-sm disabled:opacity-40 shrink-0">
                Add
              </button>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-gray-700">Pre-prepared stock <span className="font-normal text-gray-400">optional</span></p>
            <p className="text-xs text-gray-400">
              Ready-to-serve portions (e.g. 12 pre-cut paneer portions). Counts down with each sale;
              the item auto-turns unavailable at 0. Leave blank to switch this off.
              Items with a pool skip the recipe-based stock check.
            </p>
          </div>
          <input
            type="number"
            min="0"
            step="1"
            className="bm-input"
            placeholder="e.g. 12 (blank = off)"
            value={prepPool}
            onChange={(e) => setPrepPool(e.target.value)}
          />
          {prepPool.trim() !== "" && Number(prepPool) === 0 && (
            <p className="text-xs font-semibold text-amber-600">
              Pool is 0 — this item will show &quot;No stock&quot; on the POS. Set a count and switch Available on to sell it again.
            </p>
          )}
        </div>
        <button onClick={handleSave} disabled={!name.trim() || !catId} className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md mt-2">
          {isNew ? "Add Item" : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}
