"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import Modal from "@/components/ui/Modal";
import { fmtRupee, HIDE_FRANCHISE } from "@/lib/utils";
import type { RawMaterial, FinishedGood, MenuItem, MenuCategory, AddOn } from "@/lib/types";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Package,
  Boxes,
  Wine,
  UtensilsCrossed,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  X,
} from "lucide-react";

const UNITS = ["kg", "g", "litre", "ml", "piece", "dozen", "bottle", "pack", "box"];
const BAR_BIZ = ["cafe", "restaurant", "franchise"].filter(
  (t) => !HIDE_FRANCHISE || t !== "franchise"
);

type StockTab = "menu" | "raw" | "finished" | "bar";

function EmptyState({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-300">
      <span className="text-5xl mb-3">{icon}</span>
      <p className="font-semibold text-gray-400">{label}</p>
      <p className="text-sm text-gray-300 mt-1">{sub}</p>
    </div>
  );
}

function Toggle({
  label,
  desc,
  value,
  onChange,
  disabled,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        {desc && <p className="text-xs text-gray-400">{desc}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`shrink-0 w-11 h-6 rounded-full relative transition-colors press ${value ? "bg-primary-500" : "bg-gray-200"}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

function ItemEditModal({
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
        <button onClick={handleSave} disabled={!name.trim() || !catId} className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md mt-2">
          {isNew ? "Add Item" : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}

function CatEditModal({
  cat,
  onClose,
  onSave,
}: {
  cat: Partial<MenuCategory> | null;
  onClose: () => void;
  onSave: (c: MenuCategory) => void;
}) {
  const [name, setName] = useState(cat?.name ?? "");
  const isNew = !cat?.id;
  return (
    <Modal open={!!cat} onClose={onClose} title={isNew ? "Add Category" : "Edit Category"}>
      <div className="px-5 pb-6 pt-2 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Category Name</label>
          <input className="bm-input" placeholder="e.g. Main Course" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <button
          onClick={() => onSave({ id: cat?.id ?? crypto.randomUUID(), name: name.trim(), sortOrder: cat?.sortOrder ?? 0 })}
          disabled={!name.trim()}
          className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md"
        >
          {isNew ? "Add Category" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function RawMaterialModal({
  item,
  onClose,
  onSave,
}: {
  item: Partial<RawMaterial> | null;
  onClose: () => void;
  onSave: (i: RawMaterial) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "kg");
  const [stock, setStock] = useState(item?.currentStock != null ? String(item.currentStock) : "");
  const [minStock, setMinStock] = useState(item?.minStock != null ? String(item.minStock) : "");
  const [cost, setCost] = useState(item?.costPaise != null ? String(item.costPaise / 100) : "");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: item?.id ?? crypto.randomUUID(),
      name: name.trim(),
      unit,
      currentStock: Number(stock) || 0,
      minStock: minStock ? Number(minStock) : undefined,
      costPaise: cost ? Math.round(Number(cost) * 100) : undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Modal open={!!item} onClose={onClose} title={item?.id ? "Edit Raw Material" : "Add Raw Material"}>
      <div className="px-5 pb-6 pt-2 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Item Name *</label>
          <input className="bm-input" placeholder="e.g. Onion, Milk, Bread" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Unit *</label>
            <select className="bm-input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Current Stock</label>
            <input type="number" className="bm-input" placeholder="0" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Min Stock Alert</label>
            <input type="number" className="bm-input" placeholder="Optional" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Cost per unit (&#8377;)</label>
            <input type="number" className="bm-input" placeholder="Optional" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        </div>
        <button onClick={handleSave} disabled={!name.trim()} className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md">
          {item?.id ? "Save Changes" : "Add Item"}
        </button>
      </div>
    </Modal>
  );
}

function FinishedGoodModal({
  item,
  onClose,
  onSave,
}: {
  item: Partial<FinishedGood> | null;
  onClose: () => void;
  onSave: (i: FinishedGood) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "piece");
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity) : "");
  const [cost, setCost] = useState(item?.costPricePaise != null ? String(item.costPricePaise / 100) : "");
  const [selling, setSelling] = useState(item?.sellingPricePaise != null ? String(item.sellingPricePaise / 100) : "");
  const [expiry, setExpiry] = useState(item?.expiryDate ?? "");
  const today = new Date().toISOString().slice(0, 10);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: item?.id ?? crypto.randomUUID(),
      name: name.trim(),
      unit,
      quantity: Number(qty) || 0,
      costPricePaise: cost ? Math.round(Number(cost) * 100) : undefined,
      sellingPricePaise: selling ? Math.round(Number(selling) * 100) : undefined,
      expiryDate: expiry || undefined,
      purchasedAt: item?.purchasedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isInBilling: item?.isInBilling,
      billingMenuItemId: item?.billingMenuItemId,
    });
  };

  return (
    <Modal open={!!item} onClose={onClose} title={item?.id ? "Edit Finished Good" : "Add Finished Good"}>
      <div className="px-5 pb-6 pt-2 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Item Name *</label>
          <input className="bm-input" placeholder="e.g. Ice Cream, Cake, Cold Drink" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Unit *</label>
            <select className="bm-input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Quantity</label>
            <input type="number" className="bm-input" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Cost Price (&#8377;)</label>
            <input type="number" className="bm-input" placeholder="Optional" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Selling Price (&#8377;)</label>
            <input type="number" className="bm-input" placeholder="Optional" value={selling} onChange={(e) => setSelling(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Expiry Date <span className="font-normal text-gray-400">optional</span></label>
          <input type="date" className="bm-input" min={today} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>
        <button onClick={handleSave} disabled={!name.trim()} className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md">
          {item?.id ? "Save Changes" : "Add Item"}
        </button>
      </div>
    </Modal>
  );
}

function BarItemModal({
  item,
  onClose,
  onSave,
}: {
  item: Partial<FinishedGood> | null;
  onClose: () => void;
  onSave: (i: FinishedGood) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "bottle");
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity) : "");
  const [cost, setCost] = useState(item?.costPricePaise != null ? String(item.costPricePaise / 100) : "");
  const [expiry, setExpiry] = useState(item?.expiryDate ?? "");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: item?.id ?? crypto.randomUUID(),
      name: name.trim(),
      unit,
      quantity: Number(qty) || 0,
      costPricePaise: cost ? Math.round(Number(cost) * 100) : undefined,
      expiryDate: expiry || undefined,
      purchasedAt: item?.purchasedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Modal open={!!item} onClose={onClose} title={item?.id ? "Edit Bar Item" : "Add Bar Item"}>
      <div className="px-5 pb-6 pt-2 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Item Name *</label>
          <input className="bm-input" placeholder="e.g. Whisky, Beer, Wine" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Unit</label>
            <select className="bm-input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {["bottle", "can", "litre", "ml", "pack"].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Quantity</label>
            <input type="number" className="bm-input" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Cost Price (&#8377;) <span className="font-normal text-gray-400">optional</span></label>
          <input type="number" className="bm-input" placeholder="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Expiry Date <span className="font-normal text-gray-400">optional</span></label>
          <input type="date" className="bm-input" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>
        <button onClick={handleSave} disabled={!name.trim()} className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md">
          {item?.id ? "Save Changes" : "Add Item"}
        </button>
      </div>
    </Modal>
  );
}

function BillingToggle({
  item,
  isOwner,
  uid,
  onToggle,
}: {
  item: FinishedGood;
  isOwner: boolean;
  uid: string;
  onToggle: (updated: FinishedGood[]) => void;
}) {
  const { state, upsertMenuItem, upsertCategory, deleteMenuItem, showToast } = useApp();

  const handleOn = useCallback(async () => {
    try {
      let stockCatId: string;
      const existing = state.categories.find((c) => c.name === "Stock Items");
      if (!existing) {
        stockCatId = crypto.randomUUID();
        await upsertCategory({ id: stockCatId, name: "Stock Items", sortOrder: 999 });
      } else {
        stockCatId = existing.id;
      }
      const menuItemId = item.billingMenuItemId ?? crypto.randomUUID();
      await upsertMenuItem({
        id: menuItemId,
        name: item.name,
        categoryId: stockCatId,
        pricePaise: item.sellingPricePaise ?? 0,
        isVeg: true,
        isAvailable: true,
        addOns: [],
        portionEnabled: false,
        portions: [],
        sizes: [],
        fastAdd: true,
      });
      const updated: FinishedGood = { ...item, isInBilling: true, billingMenuItemId: menuItemId, updatedAt: new Date().toISOString() };
      const { dbSaveFinishedGood, dbGetAllFinishedGoods } = await import("@/lib/db");
      await dbSaveFinishedGood(updated, uid);
      onToggle(await dbGetAllFinishedGoods(uid));
      showToast("Added to billing");
    } catch {
      showToast("Failed to add to billing", "error");
    }
  }, [item, uid, state.categories, upsertCategory, upsertMenuItem, onToggle, showToast]);

  const handleOff = useCallback(async () => {
    try {
      if (item.billingMenuItemId) await deleteMenuItem(item.billingMenuItemId);
      const updated: FinishedGood = { ...item, isInBilling: false, billingMenuItemId: undefined, updatedAt: new Date().toISOString() };
      const { dbSaveFinishedGood, dbGetAllFinishedGoods } = await import("@/lib/db");
      await dbSaveFinishedGood(updated, uid);
      onToggle(await dbGetAllFinishedGoods(uid));
      showToast("Removed from billing");
    } catch {
      showToast("Failed to remove from billing", "error");
    }
  }, [item, uid, deleteMenuItem, onToggle, showToast]);

  const value = item.isInBilling ?? false;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={value ? handleOff : handleOn}
        disabled={!isOwner}
        className={`w-11 h-6 rounded-full relative transition-colors press ${!isOwner ? "opacity-40 pointer-events-none" : ""} ${value ? "bg-primary-500" : "bg-gray-200"}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? "left-6" : "left-1"}`} />
      </button>
      <span className="text-[10px] text-gray-400 text-center mt-0.5">Billing</span>
    </div>
  );
}

export default function StockPage() {
  const { state, upsertMenuItem, deleteMenuItem, upsertCategory, deleteCategory, showToast, setActiveStockTab } = useApp();
  const { session, menuItems, categories } = state;
  const isOwner = session?.role === "owner";
  const uid = session?.userId ?? "default";

  const ss = session?.stockSettings;
  const barEnabled = ss?.barEnabled ?? false;
  const showBarTab = barEnabled && BAR_BIZ.includes(session?.businessType ?? "");

  const activeTab = state.activeStockTab as StockTab;

  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<FinishedGood[]>([]);
  const [barItems, setBarItems] = useState<FinishedGood[]>([]);

  const [editRaw, setEditRaw] = useState<Partial<RawMaterial> | null>(null);
  const [editFinished, setEditFinished] = useState<Partial<FinishedGood> | null>(null);
  const [editBar, setEditBar] = useState<Partial<FinishedGood> | null>(null);
  const [editItem, setEditItem] = useState<Partial<MenuItem> | null>(null);
  const [editCat, setEditCat] = useState<Partial<MenuCategory> | null>(null);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(categories.map((c) => c.id)));

  useEffect(() => {
    import("@/lib/db").then(({ dbGetAllRawMaterials, dbGetAllFinishedGoods, dbGetAllBarItems }) => {
      dbGetAllRawMaterials(uid).then(setRawMaterials);
      dbGetAllFinishedGoods(uid).then(setFinishedGoods);
      dbGetAllBarItems(uid).then(setBarItems);
    });
  }, [uid]);

  const toggleCat = (id: string) =>
    setExpandedCats((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const openNewItem = (categoryId: string) =>
    setEditItem({ categoryId, isVeg: true, isAvailable: true, addOns: [], pricePaise: 0, portionEnabled: false, portions: [], sizes: [] });

  const openNewCat = () => setEditCat({ name: "", sortOrder: categories.length });

  const handleSaveItem = async (item: MenuItem) => {
    await upsertMenuItem(item);
    showToast(editItem?.id ? "Item updated" : "Item added");
    setEditItem(null);
  };

  const handleDeleteItem = async (id: string) => {
    if (!isOwner) return;
    if (!confirm("Delete this item?")) return;
    await deleteMenuItem(id);
    showToast("Item deleted");
  };

  const handleSaveCat = async (cat: MenuCategory) => {
    await upsertCategory(cat);
    showToast(editCat?.id ? "Category updated" : "Category added");
    setEditCat(null);
  };

  const handleDeleteCat = async (id: string) => {
    if (!isOwner) return;
    if (!confirm("Delete this category and all its items?")) return;
    const catItems = menuItems.filter((i) => i.categoryId === id);
    for (const item of catItems) await deleteMenuItem(item.id);
    await deleteCategory(id);
    showToast("Category deleted");
  };

  const handleSaveRaw = async (item: RawMaterial) => {
    const { dbSaveRawMaterial, dbGetAllRawMaterials } = await import("@/lib/db");
    await dbSaveRawMaterial(item, uid);
    setRawMaterials(await dbGetAllRawMaterials(uid));
    showToast(editRaw?.id ? "Updated" : "Added");
    setEditRaw(null);
  };

  const handleDeleteRaw = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { dbDeleteRawMaterial, dbGetAllRawMaterials } = await import("@/lib/db");
    await dbDeleteRawMaterial(id, uid);
    setRawMaterials(await dbGetAllRawMaterials(uid));
    showToast("Deleted");
  };

  const handleSaveFinished = async (item: FinishedGood) => {
    const { dbSaveFinishedGood, dbGetAllFinishedGoods } = await import("@/lib/db");
    await dbSaveFinishedGood(item, uid);
    setFinishedGoods(await dbGetAllFinishedGoods(uid));
    showToast(editFinished?.id ? "Updated" : "Added");
    setEditFinished(null);
  };

  const handleDeleteFinished = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { dbDeleteFinishedGood, dbGetAllFinishedGoods } = await import("@/lib/db");
    await dbDeleteFinishedGood(id, uid);
    setFinishedGoods(await dbGetAllFinishedGoods(uid));
    showToast("Deleted");
  };

  const handleSaveBar = async (item: FinishedGood) => {
    const { dbSaveBarItem, dbGetAllBarItems } = await import("@/lib/db");
    await dbSaveBarItem(item, uid);
    setBarItems(await dbGetAllBarItems(uid));
    showToast(editBar?.id ? "Updated" : "Added");
    setEditBar(null);
  };

  const handleDeleteBar = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { dbDeleteBarItem, dbGetAllBarItems } = await import("@/lib/db");
    await dbDeleteBarItem(id, uid);
    setBarItems(await dbGetAllBarItems(uid));
    showToast("Deleted");
  };

  const today = new Date().toISOString().slice(0, 10);

  const TABS: { id: StockTab; label: string; Icon: React.ElementType }[] = [
    { id: "menu",     label: "Menu Items",     Icon: UtensilsCrossed },
    { id: "raw",      label: "Raw Materials",  Icon: Package         },
    { id: "finished", label: "Finished Goods", Icon: Boxes           },
    ...(showBarTab ? [{ id: "bar" as StockTab, label: "Bar", Icon: Wine }] : []),
  ];

  const handleAddButton = () => {
    if (activeTab === "menu") openNewItem(categories[0]?.id ?? "");
    else if (activeTab === "raw") setEditRaw({});
    else if (activeTab === "finished") setEditFinished({});
    else if (activeTab === "bar") setEditBar({});
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50">

        {/* Header */}
        <div className="bg-white px-4 lg:px-8 pt-12 lg:pt-6 pb-0 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-black text-gray-900">Stock</h1>
            {isOwner && (
              <div className="flex gap-2">
                {activeTab === "menu" && (
                  <button onClick={openNewCat} className="flex items-center gap-1 text-sm font-bold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-xl press">
                    <FolderPlus size={15} /> Category
                  </button>
                )}
                <button onClick={handleAddButton} className="flex items-center gap-1.5 bg-primary-500 text-white text-sm font-bold px-3 py-2 rounded-xl press shadow-sm">
                  <Plus size={15} /> {activeTab === "menu" ? "Item" : "Add"}
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveStockTab(id)}
                className={`flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all press ${activeTab === id ? "bg-primary-500 text-white shadow-sm" : "bg-gray-100 text-gray-600"}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 lg:px-8 py-4 space-y-3 w-full">

          {/* Menu tab */}
          {activeTab === "menu" && (
            <>
              {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                  <span className="text-5xl mb-3">🍽️</span>
                  <p className="font-semibold text-gray-400">No menu yet</p>
                  {isOwner && <p className="text-sm text-gray-300 mt-1">Add a category to get started</p>}
                </div>
              ) : (
                categories.map((cat) => {
                  const items = menuItems.filter((i) => i.categoryId === cat.id);
                  const open = expandedCats.has(cat.id);
                  return (
                    <div key={cat.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <div className="flex items-center px-4 py-3">
                        <button onClick={() => toggleCat(cat.id)} className="flex items-center gap-2 flex-1 min-w-0 press">
                          {open ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                          <span className="font-bold text-gray-900 truncate">{cat.name}</span>
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">{items.length}</span>
                        </button>
                        {isOwner && (
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            <button onClick={() => setEditCat(cat)} className="text-gray-400 hover:text-gray-600 press p-1"><Pencil size={14} /></button>
                            <button onClick={() => handleDeleteCat(cat.id)} className="text-red-400 hover:text-red-500 press p-1"><Trash2 size={14} /></button>
                            <button onClick={() => openNewItem(cat.id)} className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center press shadow-sm ml-1">
                              <Plus size={14} className="text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                      {open && (
                        <div className="border-t border-gray-50">
                          {items.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-4">No items yet</p>
                          ) : (
                            items.map((item) => (
                              <div key={item.id} className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0 gap-3">
                                <span className={`w-3 h-3 rounded-sm border-2 shrink-0 flex items-center justify-center ${item.isVeg ? "border-green-600" : "border-red-500"}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-500"}`} />
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-bold truncate ${!item.isAvailable ? "text-gray-400 line-through" : "text-gray-900"}`}>{item.name}</p>
                                  <p className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                                    <span>{fmtRupee(item.pricePaise)}</span>
                                    {isOwner && item.costPricePaise ? <span className="text-gray-400">Cost: {fmtRupee(item.costPricePaise)}</span> : null}
                                    {item.portionEnabled && item.portions && item.portions.length > 0 && (
                                      <span className="text-indigo-400">{item.portions.map((p) => p.label).join(" / ")}</span>
                                    )}
                                    {item.addOns && item.addOns.length > 0 && (
                                      <span className="text-amber-500">{item.addOns.length} add-on{item.addOns.length > 1 ? "s" : ""}</span>
                                    )}
                                  </p>
                                </div>
                                {isOwner && (
                                  <>
                                    <button onClick={() => setEditItem(item)} className="text-gray-400 hover:text-gray-600 press p-1"><Pencil size={14} /></button>
                                    <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 hover:text-red-500 press p-1"><Trash2 size={14} /></button>
                                  </>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* Raw Materials tab */}
          {activeTab === "raw" && (
            <>
              {rawMaterials.length === 0 ? (
                <EmptyState icon="🥬" label="No raw materials" sub="Track onion, milk, bread and more" />
              ) : (
                rawMaterials.map((item) => {
                  const isLow = item.minStock != null && item.currentStock <= item.minStock;
                  return (
                    <div key={item.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 truncate">{item.name}</p>
                          {isLow && <AlertTriangle size={14} className="text-orange-400 shrink-0" />}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {item.currentStock} {item.unit}
                          {item.minStock != null && <span className="text-gray-400"> · min {item.minStock}</span>}
                          {item.costPaise != null && <span className="text-gray-400"> · {fmtRupee(item.costPaise)}/{item.unit}</span>}
                        </p>
                      </div>
                      {isOwner && (
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => setEditRaw(item)} className="text-gray-400 press p-1"><Pencil size={15} /></button>
                          <button onClick={() => handleDeleteRaw(item.id)} className="text-red-400 press p-1"><Trash2 size={15} /></button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* Finished Goods tab */}
          {activeTab === "finished" && (
            <>
              {finishedGoods.length === 0 ? (
                <EmptyState icon="🎂" label="No finished goods" sub="Track ice cream, cakes, cold drinks etc" />
              ) : (
                finishedGoods.map((item) => {
                  const expired = item.expiryDate && item.expiryDate < today;
                  const expiringSoon = item.expiryDate && !expired && item.expiryDate <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
                  return (
                    <div key={item.id} className={`bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 ${expired ? "border-2 border-red-200" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900 truncate">{item.name}</p>
                          {expired && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full shrink-0">Expired</span>}
                          {expiringSoon && !expired && <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full shrink-0">Expiring soon</span>}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {item.quantity} {item.unit}
                          {item.costPricePaise != null && <span className="text-gray-400"> · Cost {fmtRupee(item.costPricePaise)}</span>}
                          {item.sellingPricePaise != null && <span className="text-gray-400"> · Sell {fmtRupee(item.sellingPricePaise)}</span>}
                        </p>
                        {item.expiryDate && (
                          <p className={`text-xs mt-0.5 font-semibold ${expired ? "text-red-500" : expiringSoon ? "text-orange-500" : "text-gray-400"}`}>
                            Expires {item.expiryDate}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <BillingToggle item={item} isOwner={isOwner} uid={uid} onToggle={setFinishedGoods} />
                        {isOwner && (
                          <>
                            <button onClick={() => setEditFinished(item)} className="text-gray-400 press p-1"><Pencil size={15} /></button>
                            <button onClick={() => handleDeleteFinished(item.id)} className="text-red-400 press p-1"><Trash2 size={15} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* Bar tab */}
          {activeTab === "bar" && showBarTab && (
            <>
              {barItems.length === 0 ? (
                <EmptyState icon="🍾" label="No bar items" sub="Track whisky, beer, wine and spirits" />
              ) : (
                barItems.map((item) => {
                  const expired = item.expiryDate && item.expiryDate < today;
                  return (
                    <div key={item.id} className={`bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 ${expired ? "border-2 border-red-200" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 truncate">{item.name}</p>
                          {expired && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full shrink-0">Expired</span>}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {item.quantity} {item.unit}
                          {item.costPricePaise != null && <span className="text-gray-400"> · {fmtRupee(item.costPricePaise)}</span>}
                        </p>
                        {item.expiryDate && (
                          <p className={`text-xs mt-0.5 font-semibold ${expired ? "text-red-500" : "text-gray-400"}`}>
                            Expires {item.expiryDate}
                          </p>
                        )}
                      </div>
                      {isOwner && (
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => setEditBar(item)} className="text-gray-400 press p-1"><Pencil size={15} /></button>
                          <button onClick={() => handleDeleteBar(item.id)} className="text-red-400 press p-1"><Trash2 size={15} /></button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          <div className="h-4" />
        </div>
      </div>

      <ItemEditModal
        key={editItem ? (editItem.id ?? "new-item") : "closed-item"}
        item={editItem}
        categories={categories}
        onClose={() => setEditItem(null)}
        onSave={handleSaveItem}
      />
      <CatEditModal
        key={editCat ? (editCat.id ?? "new-cat") : "closed-cat"}
        cat={editCat}
        onClose={() => setEditCat(null)}
        onSave={handleSaveCat}
      />
      <RawMaterialModal item={editRaw} onClose={() => setEditRaw(null)} onSave={handleSaveRaw} />
      <FinishedGoodModal item={editFinished} onClose={() => setEditFinished(null)} onSave={handleSaveFinished} />
      {showBarTab && <BarItemModal item={editBar} onClose={() => setEditBar(null)} onSave={handleSaveBar} />}
    </AppShell>
  );
}
