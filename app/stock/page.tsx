"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import Modal from "@/components/ui/Modal";
import { fmtRupee, HIDE_FRANCHISE, todayStr, dateStrIST, isLowStock } from "@/lib/utils";
import { UNIT_DEFS, getUnitDef, costPerUnitPaise, effectiveUnitCostPaise } from "@/lib/utils/units";
import { syncMenuCostsFromRecipes } from "@/lib/utils/recipeCost";
import { STOCK_UPDATED_EVENT } from "@/lib/utils/stockEngine";
import type { RawMaterial, FinishedGood, StockCategory, StockCategoryKind } from "@/lib/types";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Package,
  Boxes,
  Wine,
  Settings2,
  X,
} from "lucide-react";

const BAR_BIZ = ["cafe", "restaurant", "franchise"].filter(
  (t) => !HIDE_FRANCHISE || t !== "franchise"
);

type StockTab = "raw" | "finished" | "bar";

const CUSTOM_UNIT = "__custom__";

function EmptyState({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-300">
      <span className="text-5xl mb-3">{icon}</span>
      <p className="font-semibold text-gray-400">{label}</p>
      <p className="text-sm text-gray-300 mt-1">{sub}</p>
    </div>
  );
}

/** Unit dropdown backed by the canonical registry, with a Custom option
 *  that reveals a free-text input. Legacy/custom unit values on existing
 *  items are shown as the custom text so nothing ever renders blank. */
function UnitSelect({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  const isKnown = UNIT_DEFS.some((u) => u.id === value);
  const [customMode, setCustomMode] = useState(!isKnown && value !== "");
  return (
    <div className="space-y-2">
      <select
        className="bm-input"
        value={customMode ? CUSTOM_UNIT : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM_UNIT) {
            setCustomMode(true);
            onChange("");
          } else {
            setCustomMode(false);
            onChange(e.target.value);
          }
        }}
      >
        {UNIT_DEFS.map((u) => (
          <option key={u.id} value={u.id}>{u.label}</option>
        ))}
        <option value={CUSTOM_UNIT}>Custom…</option>
      </select>
      {customMode && (
        <input
          className="bm-input"
          placeholder="Custom unit e.g. scoop, can"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/** Category dropdown fed by the persisted stockCategories store, with an
 *  inline "+ New category" flow. Selecting nothing = Uncategorised. */
function CategorySelect({
  value,
  categories,
  onChange,
  onCreate,
}: {
  value: string;
  categories: StockCategory[];
  onChange: (name: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const NEW = "__new__";
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inList = value === "" || categories.some((c) => c.name === value);
  return (
    <div className="space-y-2">
      <select
        className="bm-input"
        value={adding ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setAdding(true);
            setDraft("");
          } else {
            setAdding(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Uncategorised</option>
        {categories.map((c) => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
        {!inList && value !== "" && <option value={value}>{value}</option>}
        <option value={NEW}>+ New category…</option>
      </select>
      {adding && (
        <div className="flex gap-2">
          <input
            className="bm-input flex-1"
            placeholder="Category name"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && draft.trim()) {
                await onCreate(draft.trim());
                onChange(draft.trim());
                setAdding(false);
              }
            }}
          />
          <button
            onClick={async () => {
              if (!draft.trim()) return;
              await onCreate(draft.trim());
              onChange(draft.trim());
              setAdding(false);
            }}
            disabled={!draft.trim()}
            className="px-4 h-11 rounded-xl bg-primary-500 text-white font-bold press shadow-sm disabled:opacity-40 shrink-0"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

/** Owner-only manager: view + remove categories for the active tab.
 *  Removing a category never touches items — they keep their name string. */
function ManageCategoriesModal({
  open,
  kind,
  categories,
  onClose,
  onDelete,
}: {
  open: boolean;
  kind: StockCategoryKind;
  categories: StockCategory[];
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const KIND_LABEL: Record<StockCategoryKind, string> = {
    raw: "Raw Material",
    finished: "Finished Good",
    bar: "Bar",
  };
  return (
    <Modal open={open} onClose={onClose} title={`${KIND_LABEL[kind]} Categories`}>
      <div className="px-5 pb-6 pt-2 space-y-2">
        {categories.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">
            No categories yet — add one from the item form.
          </p>
        )}
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
            <span className="flex-1 text-sm font-semibold text-gray-800">{c.name}</span>
            {c.isDefault && (
              <span className="text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full shrink-0">
                Default
              </span>
            )}
            <button
              onClick={() => onDelete(c.id)}
              className="text-gray-300 hover:text-red-400 press shrink-0 ml-1"
              aria-label={`Remove ${c.name}`}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <p className="text-xs text-gray-400 pt-2">
          Removing a category only removes it from the dropdown. Items already
          in it keep their category and stay grouped.
        </p>
      </div>
    </Modal>
  );
}

function RawMaterialModal({
  item,
  categories,
  onClose,
  onSave,
  onCreateCategory,
}: {
  item: Partial<RawMaterial> | null;
  categories: StockCategory[];
  onClose: () => void;
  onSave: (i: RawMaterial) => void;
  onCreateCategory: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "kg");
  const [stock, setStock] = useState(item?.currentStock != null ? String(item.currentStock) : "");
  const [minStock, setMinStock] = useState(item?.minStock != null ? String(item.minStock) : "");
  const [cost, setCost] = useState(item?.costPaise != null ? String(item.costPaise / 100) : "");
  // Dynamic pricing — last purchase (e.g. 5 kg for ₹450)
  const [pQty, setPQty] = useState(item?.purchaseQty != null ? String(item.purchaseQty) : "");
  const [pUnit, setPUnit] = useState(item?.purchaseUnit ?? item?.unit ?? "kg");
  const [pCost, setPCost] = useState(
    item?.purchaseCostPaise != null ? String(item.purchaseCostPaise / 100) : ""
  );

  const purchaseQtyNum = Number(pQty);
  const purchaseCostPaise = pCost !== "" ? Math.round(Number(pCost) * 100) : NaN;
  const hasPurchase = pQty !== "" && pCost !== "" && purchaseQtyNum > 0 && purchaseCostPaise >= 0;
  const derivedCost = hasPurchase && unit.trim()
    ? costPerUnitPaise(purchaseCostPaise, purchaseQtyNum, pUnit, unit)
    : null;
  const incompatible = hasPurchase && unit.trim() !== "" && derivedCost === null;

  const handleSave = () => {
    if (!name.trim() || !unit.trim()) return;
    onSave({
      id: item?.id ?? crypto.randomUUID(),
      name: name.trim(),
      category: category.trim() || undefined,
      unit: unit.trim(),
      currentStock: Number(stock) || 0,
      minStock: minStock ? Number(minStock) : undefined,
      // Derived per-unit cost wins whenever the purchase data converts;
      // otherwise the manual per-unit cost applies.
      costPaise:
        derivedCost !== null
          ? derivedCost
          : cost
            ? Math.round(Number(cost) * 100)
            : undefined,
      purchaseQty: hasPurchase ? purchaseQtyNum : undefined,
      purchaseUnit: hasPurchase ? pUnit : undefined,
      purchaseCostPaise: hasPurchase ? purchaseCostPaise : undefined,
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
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Category <span className="font-normal text-gray-400">optional</span></label>
          <CategorySelect value={category} categories={categories} onChange={setCategory} onCreate={onCreateCategory} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Stock Unit *</label>
            <UnitSelect value={unit} onChange={setUnit} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Current Stock</label>
            <input type="number" className="bm-input" placeholder="0" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Min Stock Alert</label>
          <input type="number" className="bm-input" placeholder="Optional" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </div>

        {/* Dynamic pricing from last purchase */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-gray-700">Last purchase <span className="font-normal text-gray-400">optional</span></p>
            <p className="text-xs text-gray-400">
              e.g. bought 5 Kg for ₹450 — the per-{getUnitDef(unit).label || "unit"} cost is calculated automatically.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Purchase Qty</label>
              <input type="number" className="bm-input" placeholder="e.g. 5" value={pQty} onChange={(e) => setPQty(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Purchase Unit</label>
              <UnitSelect value={pUnit} onChange={setPUnit} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Purchase Cost (&#8377;)</label>
            <input type="number" className="bm-input" placeholder="e.g. 450" value={pCost} onChange={(e) => setPCost(e.target.value)} />
          </div>
          {derivedCost !== null && (
            <p className="text-xs font-bold text-green-700 bg-green-50 rounded-xl px-3 py-2">
              Cost per {getUnitDef(unit).label}: {fmtRupee(derivedCost)}
            </p>
          )}
          {incompatible && (
            <p className="text-xs font-semibold text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
              {getUnitDef(pUnit).label} can&apos;t convert to {getUnitDef(unit).label} automatically —
              enter the cost per {getUnitDef(unit).label} manually below.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Cost per {getUnitDef(unit).label || "unit"} (&#8377;)
            {derivedCost !== null && <span className="font-normal text-gray-400"> auto-calculated</span>}
          </label>
          <input
            type="number"
            className="bm-input"
            placeholder="Optional"
            value={derivedCost !== null ? String(derivedCost / 100) : cost}
            disabled={derivedCost !== null}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
        <button onClick={handleSave} disabled={!name.trim() || !unit.trim()} className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md">
          {item?.id ? "Save Changes" : "Add Item"}
        </button>
      </div>
    </Modal>
  );
}

function FinishedGoodModal({
  item,
  categories,
  onClose,
  onSave,
  onCreateCategory,
}: {
  item: Partial<FinishedGood> | null;
  categories: StockCategory[];
  onClose: () => void;
  onSave: (i: FinishedGood) => void;
  onCreateCategory: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "piece");
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity) : "");
  const [cost, setCost] = useState(item?.costPricePaise != null ? String(item.costPricePaise / 100) : "");
  const [selling, setSelling] = useState(item?.sellingPricePaise != null ? String(item.sellingPricePaise / 100) : "");
  const [expiry, setExpiry] = useState(item?.expiryDate ?? "");
  const today = todayStr();

  const handleSave = () => {
    if (!name.trim() || !unit.trim()) return;
    onSave({
      id: item?.id ?? crypto.randomUUID(),
      name: name.trim(),
      category: category.trim() || undefined,
      unit: unit.trim(),
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
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Category <span className="font-normal text-gray-400">optional</span></label>
          <CategorySelect value={category} categories={categories} onChange={setCategory} onCreate={onCreateCategory} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Unit *</label>
            <UnitSelect value={unit} onChange={setUnit} />
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
        <button onClick={handleSave} disabled={!name.trim() || !unit.trim()} className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md">
          {item?.id ? "Save Changes" : "Add Item"}
        </button>
      </div>
    </Modal>
  );
}

function BarItemModal({
  item,
  categories,
  onClose,
  onSave,
  onCreateCategory,
}: {
  item: Partial<FinishedGood> | null;
  categories: StockCategory[];
  onClose: () => void;
  onSave: (i: FinishedGood) => void;
  onCreateCategory: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "bottle");
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity) : "");
  const [cost, setCost] = useState(item?.costPricePaise != null ? String(item.costPricePaise / 100) : "");
  const [expiry, setExpiry] = useState(item?.expiryDate ?? "");

  const handleSave = () => {
    if (!name.trim() || !unit.trim()) return;
    onSave({
      id: item?.id ?? crypto.randomUUID(),
      name: name.trim(),
      category: category.trim() || undefined,
      unit: unit.trim(),
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
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Category <span className="font-normal text-gray-400">optional</span></label>
          <CategorySelect value={category} categories={categories} onChange={setCategory} onCreate={onCreateCategory} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Unit</label>
            <UnitSelect value={unit} onChange={setUnit} />
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
        <button onClick={handleSave} disabled={!name.trim() || !unit.trim()} className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md">
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
  const { state, showToast, setActiveStockTab } = useApp();
  const { session } = state;
  const isOwner = session?.role === "owner";
  const uid = session?.businessId ?? "default";

  const ss = session?.stockSettings;
  const barEnabled = ss?.barEnabled ?? false;
  const showBarTab = barEnabled && BAR_BIZ.includes(session?.businessType ?? "");

  // Menu Items tab was removed (moved to /menu). Older sessions may still
  // have "menu" persisted as activeStockTab — fall back to "raw" so the
  // page always lands on a tab that actually exists here.
  const persistedTab = state.activeStockTab;
  const activeTab: StockTab =
    persistedTab === "raw" || persistedTab === "finished" || persistedTab === "bar"
      ? persistedTab
      : "raw";

  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<FinishedGood[]>([]);
  const [barItems, setBarItems] = useState<FinishedGood[]>([]);
  const [stockCats, setStockCats] = useState<StockCategory[]>([]);
  const [manageCats, setManageCats] = useState(false);

  const [editRaw, setEditRaw] = useState<Partial<RawMaterial> | null>(null);
  const [editFinished, setEditFinished] = useState<Partial<FinishedGood> | null>(null);
  const [editBar, setEditBar] = useState<Partial<FinishedGood> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/db").then(async (db) => {
      const [raws, fins, bars] = await Promise.all([
        db.dbGetAllRawMaterials(uid),
        db.dbGetAllFinishedGoods(uid),
        db.dbGetAllBarItems(uid),
      ]);
      if (cancelled) return;
      setRawMaterials(raws);
      setFinishedGoods(fins);
      setBarItems(bars);
      // One-time seed: system defaults + import of categories already used
      // on existing items, so previous user categories are preserved.
      try {
        await db.dbEnsureStockCategories(uid, {
          raw: raws.map((r) => r.category).filter(Boolean) as string[],
          finished: fins.map((f) => f.category).filter(Boolean) as string[],
          bar: bars.map((b) => b.category).filter(Boolean) as string[],
        });
      } catch {
        // seeding failure is non-fatal — dropdowns just start empty
      }
      const cats = await db.dbGetStockCategories(uid);
      if (!cancelled) setStockCats(cats);
    });
    return () => { cancelled = true; };
  }, [uid]);

  const kindForTab: StockCategoryKind = activeTab;
  const catsForTab = stockCats.filter((c) => c.kind === kindForTab);

  const createCategory = useCallback(
    async (kind: StockCategoryKind, name: string) => {
      try {
        const { dbAddStockCategory, dbGetStockCategories } = await import("@/lib/db");
        await dbAddStockCategory(uid, kind, name);
        setStockCats(await dbGetStockCategories(uid));
      } catch {
        showToast("Failed to add category", "error");
      }
    },
    [uid, showToast]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      try {
        const { dbDeleteStockCategory, dbGetStockCategories } = await import("@/lib/db");
        await dbDeleteStockCategory(uid, id);
        setStockCats(await dbGetStockCategories(uid));
        showToast("Category removed");
      } catch {
        showToast("Failed to remove category", "error");
      }
    },
    [uid, showToast]
  );

  /** Inventory Sprint 2 — Inventory → Cost → Menu Item.
   *  An ingredient's price or unit changing silently re-prices every menu item
   *  whose recipe uses it, and refreshes the POS stock badges. Never throws:
   *  syncMenuCostsFromRecipes swallows and logs its own failures, so a costing
   *  hiccup can never make a successful stock save look like a failure. */
  const propagateInventoryChange = useCallback(async () => {
    await syncMenuCostsFromRecipes(uid);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(STOCK_UPDATED_EVENT));
    }
  }, [uid]);

  const handleSaveRaw = async (item: RawMaterial) => {
    const { dbSaveRawMaterial, dbGetAllRawMaterials } = await import("@/lib/db");
    await dbSaveRawMaterial(item, uid);
    setRawMaterials(await dbGetAllRawMaterials(uid));
    showToast(editRaw?.id ? "Updated" : "Added");
    setEditRaw(null);
    await propagateInventoryChange();
  };

  const handleDeleteRaw = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { dbDeleteRawMaterial, dbGetAllRawMaterials } = await import("@/lib/db");
    await dbDeleteRawMaterial(id, uid);
    setRawMaterials(await dbGetAllRawMaterials(uid));
    showToast("Deleted");
    await propagateInventoryChange();
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

  const today = todayStr();

  const TABS: { id: StockTab; label: string; Icon: React.ElementType }[] = [
    { id: "raw",      label: "Raw Materials",  Icon: Package         },
    { id: "finished", label: "Finished Goods", Icon: Boxes           },
    ...(showBarTab ? [{ id: "bar" as StockTab, label: "Bar", Icon: Wine }] : []),
  ];

  const handleAddButton = () => {
    if (activeTab === "raw") setEditRaw({});
    else if (activeTab === "finished") setEditFinished({});
    else if (activeTab === "bar") setEditBar({});
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50">

        {/* Header */}
        <div className="bg-white px-4 lg:px-8 pt-12 lg:pt-6 pb-0 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-black text-gray-900">Inventory</h1>
            {isOwner && (
              <div className="flex gap-2">
                <button onClick={() => setManageCats(true)} className="flex items-center gap-1.5 bg-gray-100 text-gray-600 text-sm font-bold px-3 py-2 rounded-xl press" aria-label="Manage categories">
                  <Settings2 size={15} /> Categories
                </button>
                <button onClick={handleAddButton} className="flex items-center gap-1.5 bg-primary-500 text-white text-sm font-bold px-3 py-2 rounded-xl press shadow-sm">
                  <Plus size={15} /> Add
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

          {/* Raw Materials tab */}
          {activeTab === "raw" && (
            <>
              {rawMaterials.length === 0 ? (
                <EmptyState icon="🥬" label="No raw materials" sub="Track onion, milk, bread and more" />
              ) : (
                (() => {
                  const grouped = new Map<string, RawMaterial[]>();
                  rawMaterials.forEach((item) => {
                    const cat = item.category || "Uncategorised";
                    grouped.set(cat, [...(grouped.get(cat) ?? []), item]);
                  });
                  const cats = Array.from(grouped.keys()).sort((a, b) => a === "Uncategorised" ? 1 : b === "Uncategorised" ? -1 : a.localeCompare(b));
                  return cats.map((cat) => (
                    <div key={cat} className="space-y-2">
                      {cats.length > 1 && <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 pt-2">{cat}</p>}
                      {grouped.get(cat)!.map((item) => {
                        const isLow = isLowStock(item);
                        const unitCost = effectiveUnitCostPaise(item);
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
                                {unitCost != null && <span className="text-gray-400"> · {fmtRupee(unitCost)}/{item.unit}</span>}
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
                      })}
                    </div>
                  ));
                })()
              )}
            </>
          )}

          {/* Finished Goods tab */}
          {activeTab === "finished" && (
            <>
              {finishedGoods.length === 0 ? (
                <EmptyState icon="🎂" label="No finished goods" sub="Track ice cream, cakes, cold drinks etc" />
              ) : (
                (() => {
                  const grouped = new Map<string, FinishedGood[]>();
                  finishedGoods.forEach((item) => {
                    const cat = item.category || "Uncategorised";
                    grouped.set(cat, [...(grouped.get(cat) ?? []), item]);
                  });
                  const cats = Array.from(grouped.keys()).sort((a, b) => a === "Uncategorised" ? 1 : b === "Uncategorised" ? -1 : a.localeCompare(b));
                  return cats.map((cat) => (
                    <div key={cat} className="space-y-2">
                      {cats.length > 1 && <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 pt-2">{cat}</p>}
                      {grouped.get(cat)!.map((item) => {
                        const expired = item.expiryDate && item.expiryDate < today;
                        const expiringSoon = item.expiryDate && !expired && item.expiryDate <= dateStrIST(new Date(Date.now() + 3 * 86400000));
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
                      })}
                    </div>
                  ));
                })()
              )}
            </>
          )}

          {/* Bar tab */}
          {activeTab === "bar" && showBarTab && (
            <>
              {barItems.length === 0 ? (
                <EmptyState icon="🍾" label="No bar items" sub="Track whisky, beer, wine and spirits" />
              ) : (
                (() => {
                  const grouped = new Map<string, FinishedGood[]>();
                  barItems.forEach((item) => {
                    const cat = item.category || "Uncategorised";
                    grouped.set(cat, [...(grouped.get(cat) ?? []), item]);
                  });
                  const cats = Array.from(grouped.keys()).sort((a, b) => a === "Uncategorised" ? 1 : b === "Uncategorised" ? -1 : a.localeCompare(b));
                  return cats.map((cat) => (
                    <div key={cat} className="space-y-2">
                      {cats.length > 1 && <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 pt-2">{cat}</p>}
                      {grouped.get(cat)!.map((item) => {
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
                      })}
                    </div>
                  ));
                })()
              )}
            </>
          )}

          <div className="h-4" />
        </div>
      </div>

      <RawMaterialModal
        key={editRaw ? (editRaw.id ?? "new-raw") : "closed-raw"}
        item={editRaw}
        categories={stockCats.filter((c) => c.kind === "raw")}
        onClose={() => setEditRaw(null)}
        onSave={handleSaveRaw}
        onCreateCategory={(name) => createCategory("raw", name)}
      />
      <FinishedGoodModal
        key={editFinished ? (editFinished.id ?? "new-finished") : "closed-finished"}
        item={editFinished}
        categories={stockCats.filter((c) => c.kind === "finished")}
        onClose={() => setEditFinished(null)}
        onSave={handleSaveFinished}
        onCreateCategory={(name) => createCategory("finished", name)}
      />
      {showBarTab && (
        <BarItemModal
          key={editBar ? (editBar.id ?? "new-bar") : "closed-bar"}
          item={editBar}
          categories={stockCats.filter((c) => c.kind === "bar")}
          onClose={() => setEditBar(null)}
          onSave={handleSaveBar}
          onCreateCategory={(name) => createCategory("bar", name)}
        />
      )}
      <ManageCategoriesModal
        open={manageCats}
        kind={kindForTab}
        categories={catsForTab}
        onClose={() => setManageCats(false)}
        onDelete={deleteCategory}
      />
    </AppShell>
  );
}
