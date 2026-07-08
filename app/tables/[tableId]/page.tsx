"use client";

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { useRouter, useParams } from "next/navigation";
import { useApp } from "@/lib/store/AppContext";
import { useTableStore, useTableOrder } from "@/lib/store/tableStore";
import AppShell from "@/components/ui/AppShell";
import type { MenuItem, AddOn, Order, PaymentMethod } from "@/lib/types";
import {
  fmtRupee,
  calcDiscount,
  calcGST,
  generateBillNumber,
  toP,
  QUICK_CASH,
  fmtDate,
} from "@/lib/utils";
import {
  ArrowLeft,
  Search,
  X,
  Plus,
  Minus,
  Trash2,
  Tag,
  BookmarkCheck,
  Loader2,
  CheckCircle2,
  Printer,
  MessageCircle,
  QrCode,
  Banknote,
  Smartphone,
} from "lucide-react";

// ── Table name helper ─────────────────────────────────────────────────────────

function tableNameFromId(tableId: string): { name: string; number: number } {
  // tableId format: "t<number>" e.g. "t3"
  const num = parseInt(tableId.replace("t", ""), 10);
  if (!isNaN(num)) return { name: `Table ${num}`, number: num };
  return { name: tableId, number: 0 };
}

// ── Menu panel ────────────────────────────────────────────────────────────────

interface MenuPanelProps {
  categories: ReturnType<typeof useApp>["state"]["categories"];
  items: MenuItem[];
  onItemPress: (item: MenuItem) => void;
}

function MenuPanel({ categories, items, onItemPress }: MenuPanelProps) {
  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (!item.isAvailable) return false;
        const catOk = activeCat === "all" || item.categoryId === activeCat;
        const searchOk =
          !search || item.name.toLowerCase().includes(search.toLowerCase());
        return catOk && searchOk;
      }),
    [items, activeCat, search]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F5F0EB" }}>
      {/* Search */}
      <div className="px-3 pt-3 pb-2 shrink-0" style={{ background: "white" }}>
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#A89684" }}
          />
          <input
            className="w-full h-10 pl-9 pr-9 rounded-xl text-sm font-medium outline-none transition-all"
            style={{
              background: "#F5F0EB",
              border: "1.5px solid transparent",
              color: "#1A1208",
            }}
            placeholder="Search menu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = "#E8590C")}
            onBlur={(e) => (e.target.style.borderColor = "transparent")}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 press"
              style={{ color: "#A89684" }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pt-2">
          <CategoryPill
            label="All"
            active={activeCat === "all"}
            onClick={() => setActiveCat("all")}
          />
          {categories.map((c) => (
            <CategoryPill
              key={c.id}
              label={c.name}
              active={activeCat === c.id}
              onClick={() => setActiveCat(c.id)}
            />
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40" style={{ color: "#E5DBCC" }}>
            <span className="text-4xl mb-2">🍽️</span>
            <p className="text-sm font-semibold" style={{ color: "#A89684" }}>
              No items
            </p>
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {filtered.map((item) => (
              <MenuItemTile key={item.id} item={item} onPress={() => onItemPress(item)} />
            ))}
          </div>
        )}
        <div className="h-4" />
      </div>
    </div>
  );
}

function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all press"
      style={{
        background: active ? "#E8590C" : "white",
        color: active ? "white" : "#7A6456",
        border: active ? "1.5px solid #E8590C" : "1.5px solid #F0E8DF",
      }}
    >
      {label}
    </button>
  );
}

function MenuItemTile({
  item,
  onPress,
}: {
  item: MenuItem;
  onPress: () => void;
}) {
  return (
    <button
      onClick={onPress}
      className="press flex flex-col rounded-xl overflow-hidden text-left"
      style={{
        background: "white",
        border: "1px solid #F0E8DF",
        boxShadow: "0 1px 3px rgba(26,18,8,0.04)",
        padding: "10px 10px 8px",
      }}
    >
      <div className="flex items-center gap-1 mb-1.5">
        <span
          className="w-3 h-3 rounded-sm border flex-shrink-0"
          style={{
            borderColor: item.isVeg ? "#2D6A4F" : "#C0392B",
            background: "transparent",
          }}
        >
          <span
            className="block w-1.5 h-1.5 rounded-full m-auto mt-0.5"
            style={{ background: item.isVeg ? "#2D6A4F" : "#C0392B" }}
          />
        </span>
      </div>
      <p
        className="text-xs font-bold leading-tight line-clamp-2 flex-1"
        style={{ color: "#1A1208" }}
      >
        {item.name}
      </p>
      <p className="text-xs font-black mt-1.5" style={{ color: "#E8590C" }}>
        {fmtRupee(item.pricePaise)}
      </p>
    </button>
  );
}

// ── Item config modal ─────────────────────────────────────────────────────────

interface ItemConfigProps {
  item: MenuItem | null;
  onClose: () => void;
  onConfirm: (
    item: MenuItem,
    addOns: AddOn[],
    size?: string,
    portion?: string,
    notes?: string
  ) => void;
}

function ItemConfigSheet({ item, onClose, onConfirm }: ItemConfigProps) {
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  const [selectedSize, setSelectedSize] = useState<string | undefined>();
  const [selectedPortion, setSelectedPortion] = useState<string | undefined>();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (item) {
      setSelectedAddOns([]);
      setSelectedSize(item.sizes?.[0]?.label);
      setSelectedPortion(item.portions?.[0]?.label);
      setNotes("");
    }
  }, [item?.id]);

  if (!item) return null;

  const hasOptions =
    (item.sizes && item.sizes.length > 0) ||
    (item.portions && item.portions.length > 0) ||
    item.addOns.length > 0;

  const handleFastAdd = () => {
    onConfirm(item, [], undefined, undefined, undefined);
    onClose();
  };

  const handleConfirm = () => {
    onConfirm(item, selectedAddOns, selectedSize, selectedPortion, notes || undefined);
    onClose();
  };

  if (!hasOptions) {
    // Fast-add: no config needed
    handleFastAdd();
    return null;
  }

  const effectivePrice = selectedSize
    ? (item.sizes?.find((s) => s.label === selectedSize)?.pricePaise ?? item.pricePaise)
    : selectedPortion
    ? (item.portions?.find((p) => p.label === selectedPortion)?.pricePaise ?? item.pricePaise)
    : item.pricePaise;

  const addOnTotal = selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
  const lineTotal = effectivePrice + addOnTotal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(26,18,8,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl overflow-hidden"
        style={{ background: "white", maxHeight: "85dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F0E8DF" }}>
          <div>
            <p className="font-black text-gray-900">{item.name}</p>
            <p className="text-xs font-semibold" style={{ color: "#7A6456" }}>
              {fmtRupee(lineTotal)}
            </p>
          </div>
          <button onClick={onClose} className="press p-1" style={{ color: "#A89684" }}>
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "60dvh" }}>
          <div className="px-5 py-4 space-y-5">
            {/* Sizes */}
            {item.sizes && item.sizes.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#7A6456" }}>
                  Size
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.sizes.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setSelectedSize(s.label)}
                      className="px-3 py-1.5 rounded-xl text-sm font-bold border-2 press transition-all"
                      style={{
                        borderColor: selectedSize === s.label ? "#E8590C" : "#F0E8DF",
                        background: selectedSize === s.label ? "#FEF0E8" : "white",
                        color: selectedSize === s.label ? "#E8590C" : "#7A6456",
                      }}
                    >
                      {s.label} · {fmtRupee(s.pricePaise)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Portions */}
            {item.portions && item.portions.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#7A6456" }}>
                  Portion
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.portions.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setSelectedPortion(p.label)}
                      className="px-3 py-1.5 rounded-xl text-sm font-bold border-2 press transition-all"
                      style={{
                        borderColor: selectedPortion === p.label ? "#E8590C" : "#F0E8DF",
                        background: selectedPortion === p.label ? "#FEF0E8" : "white",
                        color: selectedPortion === p.label ? "#E8590C" : "#7A6456",
                      }}
                    >
                      {p.label} · {fmtRupee(p.pricePaise)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add-ons */}
            {item.addOns.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#7A6456" }}>
                  Add-ons
                </p>
                <div className="space-y-1.5">
                  {item.addOns.map((ao) => {
                    const checked = selectedAddOns.some((a) => a.id === ao.id);
                    return (
                      <label
                        key={ao.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer border-2 transition-all"
                        style={{
                          borderColor: checked ? "#E8590C" : "#F0E8DF",
                          background: checked ? "#FEF0E8" : "white",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedAddOns((prev) =>
                              checked
                                ? prev.filter((a) => a.id !== ao.id)
                                : [...prev, ao]
                            )
                          }
                          className="w-4 h-4 accent-primary-500 shrink-0"
                        />
                        <span className="text-sm font-semibold flex-1" style={{ color: "#1A1208" }}>
                          {ao.name}
                        </span>
                        <span className="text-sm font-bold" style={{ color: "#E8590C" }}>
                          +{fmtRupee(ao.pricePaise)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#7A6456" }}>
                Notes (optional)
              </p>
              <input
                type="text"
                className="w-full h-10 px-3 rounded-xl text-sm font-medium outline-none border-2 transition-all"
                style={{ borderColor: "#F0E8DF", background: "#FEF9F4" }}
                placeholder="e.g. No onions, extra spicy…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onFocus={(e) => (e.target.style.borderColor = "#E8590C")}
                onBlur={(e) => (e.target.style.borderColor = "#F0E8DF")}
              />
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-3 border-t" style={{ borderColor: "#F0E8DF" }}>
          <button
            onClick={handleConfirm}
            className="w-full h-13 rounded-2xl font-bold text-base press shadow-md flex items-center justify-center gap-2"
            style={{ background: "#E8590C", color: "white", height: 52 }}
          >
            <Plus size={18} />
            Add · {fmtRupee(lineTotal)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cart panel ────────────────────────────────────────────────────────────────

interface CartPanelProps {
  tableId: string;
  tableName: string;
  tableNumber: number;
  gstPercent: number;
  onCheckout: () => void;
  onHold: () => Promise<void>;
  holding: boolean;
  // FIX #16: callback so the parent page can track discount type for CheckoutSheet
  onDiscountTypeChange?: (type: "flat" | "percent", percentValue: number) => void;
}

function TableCartPanel({
  tableId,
  tableName,
  tableNumber,
  gstPercent,
  onCheckout,
  onHold,
  holding,
  onDiscountTypeChange,
}: CartPanelProps) {
  const { updateItemQty, removeItem, setDiscount } = useTableStore();
  const { state: guardState, showToast: guardToast } = useApp();
  const order = useTableOrder(tableId);
  const [discountType, setDiscountType] = useState<"flat" | "percent">("flat");
  const [discountInput, setDiscountInput] = useState("");

  const items = order?.items ?? [];
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const subtotalPaise = order?.subtotalPaise ?? 0;
  const taxPaise = order?.taxPaise ?? 0;
  const discountPaise = order?.discountPaise ?? 0;
  const totalPaise = order?.totalPaise ?? 0;

  // Sync discount input to order state
  const discountInputRef = useRef(discountInput);
  discountInputRef.current = discountInput;

  useEffect(() => {
    const val = parseFloat(discountInput) || 0;
    const paise = calcDiscount(subtotalPaise, discountType, val);
    // Debounce: only persist after 400ms of no typing
    const timer = setTimeout(() => {
      setDiscount(tableId, paise);
      // FIX #16: bubble discount type to parent so CheckoutSheet records it correctly
      onDiscountTypeChange?.(discountType, discountType === "percent" ? val : 0);
    }, 400);
    return () => clearTimeout(timer);
  }, [discountInput, discountType, subtotalPaise, tableId, onDiscountTypeChange]);

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col h-full items-center justify-center"
        style={{ background: "white" }}
      >
        <span className="text-5xl mb-3">🛒</span>
        <p className="font-bold text-sm" style={{ color: "#A89684" }}>
          No items yet
        </p>
        <p className="text-xs mt-1" style={{ color: "#E5DBCC" }}>
          Tap items on the left to add
        </p>
      </div>
    );
  }

  const discountCapped = discountPaise >= subtotalPaise && (parseFloat(discountInput) || 0) > 0;

  // P1 GUARDRAIL: owner-set max discount as % of subtotal (Settings -> Billing).
  // Cashiers are hard-blocked above the limit; owners get a warning but can proceed.
  const maxDiscountPercent = guardState.session?.stockSettings?.maxDiscountPercent ?? 0;
  const discountPctOfSubtotal = subtotalPaise > 0 ? (discountPaise / subtotalPaise) * 100 : 0;
  const overGuardrail = maxDiscountPercent > 0 && discountPctOfSubtotal > maxDiscountPercent;
  const guardrailBlocked = overGuardrail && guardState.session?.role === "cashier";

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "white" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0 border-b"
        style={{ borderColor: "#F0E8DF" }}
      >
        <span className="font-bold text-sm" style={{ color: "#1A1208" }}>
          {tableName} · {itemCount} item{itemCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {items.map((item) => {
          const ao = item.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
          const lineTotal = (item.unitPricePaise + ao) * item.qty;
          return (
            <div
              key={item.cartId}
              className="rounded-xl p-3"
              style={{ background: "#FEF9F4", border: "1px solid #F0E8DF" }}
            >
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "#1A1208" }}>
                    {item.name}
                  </p>
                  {item.selectedSize && (
                    <p className="text-xs" style={{ color: "#7A6456" }}>
                      {item.selectedSize}
                    </p>
                  )}
                  {item.selectedPortion && (
                    <p className="text-xs" style={{ color: "#7A6456" }}>
                      {item.selectedPortion}
                    </p>
                  )}
                  {item.selectedAddOns.length > 0 && (
                    <p className="text-xs" style={{ color: "#A89684" }}>
                      + {item.selectedAddOns.map((a) => a.name).join(", ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs italic mt-0.5" style={{ color: "#E8590C" }}>
                      &quot;{item.notes}&quot;
                    </p>
                  )}
                </div>
                <button
                  onClick={() => removeItem(tableId, item.cartId)}
                  className="press shrink-0"
                  style={{ color: "#E5DBCC" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center rounded-xl overflow-hidden border"
                  style={{ borderColor: "#F0E8DF" }}
                >
                  <button
                    onClick={() => updateItemQty(tableId, item.cartId, item.qty - 1)}
                    className="w-8 h-8 flex items-center justify-center press"
                    style={{ background: "white" }}
                  >
                    <Minus size={12} style={{ color: "#7A6456" }} />
                  </button>
                  <span
                    className="w-7 text-center text-sm font-black"
                    style={{ color: "#1A1208" }}
                  >
                    {item.qty}
                  </span>
                  <button
                    onClick={() => updateItemQty(tableId, item.cartId, item.qty + 1)}
                    className="w-8 h-8 flex items-center justify-center press"
                    style={{ background: "#E8590C" }}
                  >
                    <Plus size={12} style={{ color: "white" }} />
                  </button>
                </div>
                <span className="text-sm font-black" style={{ color: "#1A1208" }}>
                  {fmtRupee(lineTotal)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary + actions */}
      <div
        className="border-t px-4 pt-3 pb-4 space-y-3 shrink-0"
        style={{ borderColor: "#F0E8DF", background: "white" }}
      >
        {/* Discount */}
        <div className="flex items-center gap-2">
          <Tag size={14} style={{ color: "#A89684", flexShrink: 0 }} />
          <div
            className="flex rounded-xl border overflow-hidden shrink-0"
            style={{ borderColor: "#F0E8DF" }}
          >
            <button
              onClick={() => { setDiscountType("flat"); setDiscountInput(""); }}
              className="px-2.5 py-1.5 text-xs font-bold transition-colors"
              style={{
                background: discountType === "flat" ? "#E8590C" : "white",
                color: discountType === "flat" ? "white" : "#7A6456",
              }}
            >
              ₹
            </button>
            <button
              onClick={() => { setDiscountType("percent"); setDiscountInput(""); }}
              className="px-2.5 py-1.5 text-xs font-bold transition-colors"
              style={{
                background: discountType === "percent" ? "#E8590C" : "white",
                color: discountType === "percent" ? "white" : "#7A6456",
              }}
            >
              %
            </button>
          </div>
          <input
            type="number"
            min="0"
            max={discountType === "percent" ? "100" : undefined}
            className="flex-1 h-8 px-3 rounded-xl border text-sm font-semibold outline-none transition-colors"
            style={{
              borderColor: discountCapped ? "#B07D00" : "#F0E8DF",
              background: discountCapped ? "#FFF8EC" : "white",
              color: discountCapped ? "#7A4D00" : "#1A1208",
            }}
            placeholder={discountType === "flat" ? "Discount ₹" : "Discount %"}
            value={discountInput}
            onChange={(e) => setDiscountInput(e.target.value)}
          />
        </div>
        {overGuardrail && (
          <p
            className="text-xs font-semibold -mt-1"
            style={{ color: guardrailBlocked ? "#DC2626" : "#B07D00" }}
          >
            {guardrailBlocked
              ? `Blocked: discount is ${Math.round(discountPctOfSubtotal)}% — owner limit is ${maxDiscountPercent}%. Reduce it or ask the owner.`
              : `Heads up: discount is ${Math.round(discountPctOfSubtotal)}% — above your ${maxDiscountPercent}% guardrail.`}
          </p>
        )}

        {/* Totals */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between" style={{ color: "#7A6456" }}>
            <span>Subtotal</span>
            <span className="font-semibold">{fmtRupee(subtotalPaise)}</span>
          </div>
          {discountPaise > 0 && (
            <div className="flex justify-between" style={{ color: "#2D6A4F" }}>
              <span>Discount</span>
              <span className="font-semibold">−{fmtRupee(discountPaise)}</span>
            </div>
          )}
          {gstPercent > 0 && (
            <div className="flex justify-between" style={{ color: "#7A6456" }}>
              <span>GST ({gstPercent}%)</span>
              <span className="font-semibold">{fmtRupee(taxPaise)}</span>
            </div>
          )}
          <div
            className="flex justify-between text-base font-black pt-1.5 border-t"
            style={{ borderColor: "#F0E8DF", color: "#1A1208" }}
          >
            <span>Total</span>
            <span style={{ color: "#E8590C" }}>{fmtRupee(totalPaise)}</span>
          </div>
        </div>

        {/* Hold */}
        <button
          onClick={onHold}
          disabled={holding}
          className="w-full h-11 flex items-center justify-center gap-2 rounded-2xl border-2 font-bold text-sm press disabled:opacity-40"
          style={{ borderColor: "#FACDB0", color: "#B83E06", background: "#FEF0E8" }}
        >
          {holding ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <BookmarkCheck size={16} />
          )}
          {holding ? "Saving…" : "Hold Order"}
        </button>

        {/* Checkout — hard-blocked for cashiers over the discount guardrail */}
        <button
          onClick={() => {
            if (guardrailBlocked) {
              guardToast(
                `Discount above the ${maxDiscountPercent}% limit — reduce it or ask the owner`,
                "error"
              );
              return;
            }
            onCheckout();
          }}
          className="w-full h-12 rounded-2xl font-bold press shadow-md flex items-center justify-center gap-2"
          style={{
            background: guardrailBlocked ? "#D1D5DB" : "#E8590C",
            color: guardrailBlocked ? "#6B7280" : "white",
          }}
        >
          {guardrailBlocked
            ? `Discount over ${maxDiscountPercent}% limit`
            : `Checkout · ${fmtRupee(totalPaise)}`}
        </button>
      </div>
    </div>
  );
}

// ── Checkout flow ─────────────────────────────────────────────────────────────

const PAY_METHODS: { id: PaymentMethod; label: string; Icon: React.ElementType }[] = [
  { id: "cash",  label: "Cash",  Icon: Banknote   },
  { id: "upi",   label: "UPI",   Icon: Smartphone },
  { id: "split", label: "Split", Icon: Banknote   },
];

interface CheckoutSheetProps {
  tableId: string;
  tableName: string;
  tableNumber: number;
  gstPercent: number;
  upiId?: string;
  businessName?: string;
  onDone: () => void;
  onClose: () => void;
  // FIX #16: receive actual discount type so it's recorded correctly on the order
  checkoutDiscountType: "flat" | "percent";
  checkoutDiscountPercent: number;
}

function CheckoutSheet({
  tableId,
  tableName,
  tableNumber,
  gstPercent,
  upiId,
  businessName,
  onDone,
  onClose,
  checkoutDiscountType,
  checkoutDiscountPercent,
}: CheckoutSheetProps) {
  const { state: appState, notifyOrderPlaced, showToast } = useApp();
  const { clearOrder } = useTableStore();
  const order = useTableOrder(tableId);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashInput, setCashInput] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitUpi, setSplitUpi] = useState("");
  const [upiConfirmed, setUpiConfirmed] = useState(false);
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false); // P0-06: ref guard against double-tap
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [qrSrc, setQrSrc] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [showUpiQr, setShowUpiQr] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  const hasUpi = Boolean(upiId);
  const items = order?.items ?? [];
  const subtotalPaise = order?.subtotalPaise ?? 0;
  const taxPaise = order?.taxPaise ?? 0;
  const discountPaise = order?.discountPaise ?? 0;
  const totalPaise = order?.totalPaise ?? 0;

  const cashPaise = toP(Number(cashInput) || 0);
  const changePaise = Math.max(0, cashPaise - totalPaise);
  const splitCashP = toP(Number(splitCash) || 0);
  const splitUpiP = toP(Number(splitUpi) || 0);
  const splitTotal = splitCashP + splitUpiP;
  const splitOk = splitTotal >= totalPaise;

  const canConfirm =
    !placing &&
    ((method === "upi" && upiConfirmed) ||
      (method === "cash" && cashInput !== "" && cashPaise >= totalPaise) ||
      (method === "split" && splitOk));

  useEffect(() => {
    if (!showUpiQr || !hasUpi || !upiId) return;
    const amount = (totalPaise / 100).toFixed(2);
    const name = encodeURIComponent(businessName ?? "Sth1r");
    const upiStr = `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`;
    const api = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiStr)}`;
    setQrSrc("");
    setQrLoading(true);
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) { setQrSrc(api); setQrLoading(false); } };
    img.onerror = () => { if (!cancelled) setQrLoading(false); };
    img.src = api;
    return () => { cancelled = true; img.onload = null; img.onerror = null; };
  }, [showUpiQr, hasUpi, totalPaise, upiId, businessName]);

  const handleConfirm = async () => {
    if (!canConfirm || !order || placingRef.current) return;
    placingRef.current = true; // P0-06: block concurrent taps
    setPlacing(true);
    try {
      const businessId = appState.session?.businessId ?? "default";

      // P1-05: re-read from IDB at close time — never trust stale React state for billing
      const { dbGetTableOrder } = await import("@/lib/db");
      const freshOrder = await dbGetTableOrder(order.id, businessId);
      const billing = freshOrder ?? order;
      const freshItems = billing.items;
      const freshSubtotal = billing.subtotalPaise;
      const freshTax = billing.taxPaise;
      const freshDiscount = billing.discountPaise;
      const freshTotal = billing.totalPaise;
      // P0-08: use locked GST rate from when table was opened
      const lockedGst = billing.gstPercentAtOpen ?? gstPercent;

      // P1 GUARDRAIL (defense-in-depth): re-validate against FRESH IDB values at
      // close time, so a cashier can never settle an over-limit discount even if
      // the discount was changed on another device after the sheet opened.
      const maxDisc = appState.session?.stockSettings?.maxDiscountPercent ?? 0;
      if (
        maxDisc > 0 &&
        appState.session?.role === "cashier" &&
        freshSubtotal > 0 &&
        (freshDiscount / freshSubtotal) * 100 > maxDisc
      ) {
        // Must release the double-tap guard before returning — this function has
        // no finally block; only the catch path resets these.
        placingRef.current = false;
        setPlacing(false);
        showToast(
          `Discount above the ${maxDisc}% limit — reduce it or ask the owner`,
          "error"
        );
        return;
      }

      let billNumber = generateBillNumber();
      try {
        const { getNextBillCounterFromSupabase } = await import("@/lib/supabase/sync");
        const remote = await getNextBillCounterFromSupabase(businessId);
        if (remote !== null) billNumber = `#${String(remote).padStart(4, "0")}`;
      } catch {}

      const finalOrder: Order = {
        id: crypto.randomUUID(),
        billNumber,
        items: freshItems.map((i) => ({
          cartId: i.cartId,
          menuItemId: i.menuItemId,
          name: i.name,
          unitPricePaise: i.unitPricePaise,
          qty: i.qty,
          tableNumber,
          selectedSize: i.selectedSize,
          selectedPortion: i.selectedPortion,
          selectedAddOns: i.selectedAddOns,
          notes: i.notes,
        })),
        serviceMode: "dine_in",
        tableNumber,
        subtotalPaise: freshSubtotal,
        discountPaise: freshDiscount,
        discountType: checkoutDiscountType,
        discountValue: checkoutDiscountType === "percent"
          ? checkoutDiscountPercent
          : freshDiscount / 100,
        gstPercent: lockedGst,
        gstPaise: freshTax,
        totalPaise: freshTotal,
        paymentMethod: method,
        splitPayment:
          method === "split"
            ? { cashPaise: splitCashP, upiPaise: splitUpiP }
            : undefined,
        cashReceivedPaise: method === "cash" ? cashPaise : undefined,
        changePaise: method === "cash" ? changePaise : 0,
        createdAt: new Date().toISOString(),
        syncStatus: "pending",
        status: "completed",
        placedByUsername: appState.session?.username,
        placedByRole: appState.session?.role,
      };

      const { dbSaveOrder } = await import("@/lib/db");
      await dbSaveOrder(finalOrder, businessId);

      notifyOrderPlaced(finalOrder);
      await clearOrder(tableId);

      import("@/lib/supabase/sync")
        .then(({ syncOrder }) => syncOrder(finalOrder, businessId))
        .catch(() => {});

      setPlacedOrder(finalOrder);
    } catch {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const handlePrintInvoice = () => {
    const el = invoiceRef.current;
    if (!el) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice #${placedOrder?.billNumber}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm}.c{text-align:center}.b{font-weight:bold}.row{display:flex;justify-content:space-between}hr{border:none;border-top:1px dashed #000;margin:4px 0}</style></head><body>${el.innerHTML}</body></html>`;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const handleWhatsApp = () => {
    if (!placedOrder) return;
    const lines = [
      `*Bill from ${businessName ?? "Sth1r"}*`,
      `Bill #: ${placedOrder.billNumber}`,
      `Date: ${fmtDate(placedOrder.createdAt)}`,
      `Table: ${tableNumber}`,
      ``,
      ...placedOrder.items.map((i) => {
        const ao = i.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
        return `- ${i.name} x${i.qty}  ${fmtRupee((i.unitPricePaise + ao) * i.qty)}`;
      }),
      ``,
      `Subtotal: ${fmtRupee(placedOrder.subtotalPaise)}`,
      placedOrder.discountPaise > 0 ? `Discount: -${fmtRupee(placedOrder.discountPaise)}` : null,
      placedOrder.gstPercent > 0 ? `GST (${placedOrder.gstPercent}%): ${fmtRupee(placedOrder.gstPaise)}` : null,
      `*Total: ${fmtRupee(placedOrder.totalPaise)}*`,
      `Payment: ${placedOrder.paymentMethod.toUpperCase()}`,
      ``,
      `Thank you! 🙏`,
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank");
  };

  // ── Post-payment view ─────────────────────────────────────────────────────
  if (placedOrder) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: "rgba(26,18,8,0.5)" }}
      >
        <div
          className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col"
          style={{ background: "white", maxHeight: "90dvh" }}
        >
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b" style={{ borderColor: "#F0E8DF" }}>
            <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <CheckCircle2 size={24} className="text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black" style={{ color: "#1A1208" }}>Bill Closed!</p>
              <p className="text-xs" style={{ color: "#7A6456" }}>
                #{placedOrder.billNumber} · {tableName} · {fmtRupee(placedOrder.totalPaise)}
                {placedOrder.changePaise && placedOrder.changePaise > 0
                  ? ` · Change: ${fmtRupee(placedOrder.changePaise)}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div
              ref={invoiceRef}
              className="font-mono text-xs leading-relaxed rounded-xl p-4 mx-auto border border-dashed"
              style={{ maxWidth: 320, borderColor: "#E5DBCC" }}
            >
              <div className="text-center font-bold text-sm mb-1">{businessName ?? "Sth1r"}</div>
              <div className="border-t border-dashed my-2" style={{ borderColor: "#E5DBCC" }} />
              <div className="flex justify-between">
                <span>Bill #: {placedOrder.billNumber}</span>
                <span>{fmtDate(placedOrder.createdAt)}</span>
              </div>
              <div className="text-center text-xs mt-1">Table: {tableNumber}</div>
              <div className="border-t border-dashed my-2" style={{ borderColor: "#E5DBCC" }} />
              {placedOrder.items.map((item, idx) => {
                const ao = item.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
                const line = (item.unitPricePaise + ao) * item.qty;
                return (
                  <div key={idx} className="mb-1">
                    <div className="flex justify-between">
                      <span className="flex-1 truncate pr-2">{item.name}</span>
                      <span>{fmtRupee(line)}</span>
                    </div>
                    <div className="pl-2" style={{ color: "#A89684" }}>
                      {item.qty} × {fmtRupee(item.unitPricePaise + ao)}
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-dashed my-2" style={{ borderColor: "#E5DBCC" }} />
              <div className="flex justify-between" style={{ color: "#7A6456" }}>
                <span>Subtotal</span>
                <span>{fmtRupee(placedOrder.subtotalPaise)}</span>
              </div>
              {placedOrder.discountPaise > 0 && (
                <div className="flex justify-between" style={{ color: "#7A6456" }}>
                  <span>Discount</span>
                  <span>-{fmtRupee(placedOrder.discountPaise)}</span>
                </div>
              )}
              {placedOrder.gstPercent > 0 && (
                <div className="flex justify-between" style={{ color: "#7A6456" }}>
                  <span>GST ({placedOrder.gstPercent}%)</span>
                  <span>{fmtRupee(placedOrder.gstPaise)}</span>
                </div>
              )}
              <div className="border-t border-dashed my-2" style={{ borderColor: "#E5DBCC" }} />
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL</span>
                <span>{fmtRupee(placedOrder.totalPaise)}</span>
              </div>
              <div className="flex justify-between mt-1" style={{ color: "#7A6456" }}>
                <span>Payment</span>
                <span>{placedOrder.paymentMethod.toUpperCase()}</span>
              </div>
              {placedOrder.changePaise != null && placedOrder.changePaise > 0 && (
                <div className="flex justify-between" style={{ color: "#7A6456" }}>
                  <span>Change</span>
                  <span>{fmtRupee(placedOrder.changePaise)}</span>
                </div>
              )}
              <div className="border-t border-dashed my-3" style={{ borderColor: "#E5DBCC" }} />
              <div className="text-center" style={{ color: "#A89684" }}>Thank you! Visit again 🙏</div>
            </div>
          </div>

          <div className="px-5 pb-5 pt-2 border-t space-y-2" style={{ borderColor: "#F0E8DF" }}>
            <div className="flex gap-2">
              <button
                onClick={handlePrintInvoice}
                className="flex-1 h-11 flex items-center justify-center gap-2 rounded-2xl font-bold text-sm press"
                style={{ background: "#1A1208", color: "white" }}
              >
                <Printer size={16} />
                Print
              </button>
              <button
                onClick={handleWhatsApp}
                className="flex-1 h-11 flex items-center justify-center gap-2 rounded-2xl font-bold text-sm press"
                style={{ background: "#25D366", color: "white" }}
              >
                <MessageCircle size={16} />
                WhatsApp
              </button>
            </div>
            <button
              onClick={onDone}
              className="w-full h-12 rounded-2xl font-bold press shadow-md"
              style={{ background: "#E8590C", color: "white" }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Pre-payment view ──────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(26,18,8,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl overflow-hidden"
        style={{ background: "white", maxHeight: "90dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F0E8DF" }}>
          <div>
            <p className="font-black" style={{ color: "#1A1208" }}>Checkout</p>
            <p className="text-xs" style={{ color: "#7A6456" }}>
              {tableName} · {fmtRupee(totalPaise)}
            </p>
          </div>
          <button onClick={onClose} className="press p-1" style={{ color: "#A89684" }}>
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "70dvh" }}>
          <div className="px-5 py-4 space-y-4">
            {/* Summary */}
            <div className="rounded-2xl p-4 space-y-1.5 text-sm" style={{ background: "#FEF9F4" }}>
              <div className="flex justify-between" style={{ color: "#7A6456" }}>
                <span>Subtotal</span>
                <span className="font-semibold">{fmtRupee(subtotalPaise)}</span>
              </div>
              {discountPaise > 0 && (
                <div className="flex justify-between" style={{ color: "#2D6A4F" }}>
                  <span>Discount</span>
                  <span className="font-semibold">−{fmtRupee(discountPaise)}</span>
                </div>
              )}
              {gstPercent > 0 && (
                <div className="flex justify-between" style={{ color: "#7A6456" }}>
                  <span>GST ({gstPercent}%)</span>
                  <span className="font-semibold">{fmtRupee(taxPaise)}</span>
                </div>
              )}
              <div
                className="flex justify-between text-base font-black pt-2 border-t"
                style={{ borderColor: "#F0E8DF", color: "#1A1208" }}
              >
                <span>Total</span>
                <span style={{ color: "#E8590C" }}>{fmtRupee(totalPaise)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div>
              <p className="text-sm font-bold mb-2" style={{ color: "#1A1208" }}>Payment Method</p>
              <div className="grid grid-cols-3 gap-2">
                {PAY_METHODS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => {
                      setMethod(id);
                      setShowUpiQr(false);
                      setUpiConfirmed(false);
                    }}
                    className="py-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all press"
                    style={{
                      borderColor: method === id ? "#E8590C" : "#F0E8DF",
                      background: method === id ? "#FEF0E8" : "white",
                      color: method === id ? "#E8590C" : "#7A6456",
                    }}
                  >
                    <Icon size={20} />
                    <span className="text-xs font-bold">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cash */}
            {method === "cash" && (
              <div className="space-y-3">
                <input
                  type="number"
                  autoFocus
                  min="0"
                  className="w-full h-14 px-4 rounded-2xl border-2 outline-none text-2xl font-black transition-colors"
                  style={{
                    borderColor:
                      cashInput !== "" && cashPaise < totalPaise
                        ? "#C0392B"
                        : cashInput !== "" && cashPaise >= totalPaise
                        ? "#2D6A4F"
                        : "#F0E8DF",
                    color: "#1A1208",
                  }}
                  placeholder="Cash received (₹)"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                />
                <div className="flex gap-2 flex-wrap">
                  {QUICK_CASH.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setCashInput(String(amt))}
                      className="px-3 py-1.5 rounded-xl border font-bold text-sm press"
                      style={{
                        borderColor: Number(cashInput) === amt ? "#E8590C" : "#F0E8DF",
                        background: Number(cashInput) === amt ? "#FEF0E8" : "white",
                        color: Number(cashInput) === amt ? "#E8590C" : "#7A6456",
                      }}
                    >
                      ₹{amt}
                    </button>
                  ))}
                  <button
                    onClick={() => setCashInput(String(totalPaise / 100))}
                    className="px-3 py-1.5 rounded-xl border font-bold text-sm press"
                    style={{ borderColor: "#FACDB0", background: "#FEF0E8", color: "#E8590C" }}
                  >
                    Exact
                  </button>
                </div>
                {cashInput !== "" && (
                  <div
                    className="rounded-xl py-3 text-center font-bold text-sm"
                    style={{
                      background: cashPaise >= totalPaise ? "#E8F5E9" : "#FDECEA",
                      color: cashPaise >= totalPaise ? "#2D6A4F" : "#C0392B",
                    }}
                  >
                    {cashPaise >= totalPaise
                      ? `Change: ${fmtRupee(changePaise)}`
                      : `Short by ${fmtRupee(totalPaise - cashPaise)}`}
                  </div>
                )}
              </div>
            )}

            {/* UPI */}
            {method === "upi" && (
              <div className="space-y-3">
                <div className="rounded-2xl p-4 text-center" style={{ background: "#EBF5FB" }}>
                  <p className="text-3xl mb-2">📱</p>
                  <p className="font-bold" style={{ color: "#1A5276" }}>Collect via UPI</p>
                  <p className="text-sm mt-1" style={{ color: "#2980B9" }}>{fmtRupee(totalPaise)}</p>
                </div>
                {hasUpi && (
                  !showUpiQr ? (
                    <button
                      onClick={() => setShowUpiQr(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 font-bold text-sm press"
                      style={{ borderColor: "#AED6F1", color: "#2980B9" }}
                    >
                      <QrCode size={16} /> Show QR Code
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-2">
                      <div
                        className="w-44 h-44 rounded-2xl flex items-center justify-center overflow-hidden border-2"
                        style={{ background: "#F5F5F5", borderColor: "#E5DBCC" }}
                      >
                        {qrLoading && <Loader2 size={28} className="animate-spin" style={{ color: "#E5DBCC" }} />}
                        {!qrLoading && qrSrc && (
                          <img src={qrSrc} alt="UPI QR" width={168} height={168} className="rounded-xl" />
                        )}
                        {!qrLoading && !qrSrc && (
                          <p className="text-xs" style={{ color: "#A89684" }}>QR unavailable</p>
                        )}
                      </div>
                      <p className="text-xs font-semibold" style={{ color: "#7A6456" }}>{upiId}</p>
                    </div>
                  )
                )}
                <label
                  className="flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer select-none transition-colors"
                  style={{
                    borderColor: upiConfirmed ? "#E8590C" : "#F0E8DF",
                    background: upiConfirmed ? "#FEF0E8" : "white",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={upiConfirmed}
                    onChange={(e) => setUpiConfirmed(e.target.checked)}
                    className="w-5 h-5 shrink-0"
                    style={{ accentColor: "#E8590C" }}
                  />
                  <span className="text-sm font-bold" style={{ color: "#1A1208" }}>
                    Payment received on UPI ✓
                  </span>
                </label>
              </div>
            )}

            {/* Split */}
            {method === "split" && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold block mb-1" style={{ color: "#7A6456" }}>Cash (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full h-10 px-3 rounded-xl border-2 text-sm font-semibold outline-none"
                      style={{ borderColor: "#F0E8DF" }}
                      placeholder="0"
                      value={splitCash}
                      onChange={(e) => setSplitCash(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold block mb-1" style={{ color: "#7A6456" }}>UPI (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full h-10 px-3 rounded-xl border-2 text-sm font-semibold outline-none"
                      style={{ borderColor: "#F0E8DF" }}
                      placeholder="0"
                      value={splitUpi}
                      onChange={(e) => setSplitUpi(e.target.value)}
                    />
                  </div>
                </div>
                <div
                  className="rounded-xl py-2 px-3 text-sm font-bold text-center"
                  style={{
                    background: splitOk ? "#E8F5E9" : "#FEF9F4",
                    color: splitOk ? "#2D6A4F" : "#7A6456",
                  }}
                >
                  {splitOk
                    ? `Covered ✓ (${fmtRupee(splitTotal)})`
                    : splitTotal > 0
                    ? `Short by ${fmtRupee(totalPaise - splitTotal)}`
                    : `Need ${fmtRupee(totalPaise)}`}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 pt-2 border-t" style={{ borderColor: "#F0E8DF" }}>
          <button
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="w-full h-14 rounded-2xl font-black text-lg disabled:opacity-40 press shadow-md flex items-center justify-center gap-2"
            style={{ background: "#E8590C", color: "white" }}
          >
            {placing && <Loader2 size={18} className="animate-spin" />}
            {placing ? "Processing…" : `Collect & Close · ${fmtRupee(totalPaise)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TableOrderPage() {
  const params = useParams();
  const router = useRouter();
  const { state } = useApp();
  const { addItem, holdOrder } = useTableStore();

  const tableId = typeof params.tableId === "string" ? params.tableId : "";
  const { name: tableName, number: tableNumber } = tableNameFromId(tableId);

  const { session, menuItems, categories, isLoading } = state;
  const gstPercent = session?.gstPercent ?? 0;

  const [configItem, setConfigItem] = useState<MenuItem | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  // FIX #16: track discount type at page level so CheckoutSheet can record it correctly
  const [cartDiscountType, setCartDiscountType] = useState<"flat" | "percent">("flat");
  const [cartDiscountPercent, setCartDiscountPercent] = useState(0);
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    if (!isLoading && !session) router.replace("/auth");
  }, [isLoading, session, router]);

  const handleItemPress = useCallback((item: MenuItem) => {
    // Fast-add items with no options
    const hasOptions =
      (item.sizes && item.sizes.length > 0) ||
      (item.portions && item.portions.length > 0) ||
      item.addOns.length > 0;

    if (!hasOptions) {
      addItem(tableId, tableName, tableNumber, item, [], undefined, undefined, undefined);
    } else {
      setConfigItem(item);
    }
  }, [tableId, tableName, tableNumber, addItem]);

  const handleConfigConfirm = useCallback(
    (item: MenuItem, addOns: AddOn[], size?: string, portion?: string, notes?: string) => {
      addItem(tableId, tableName, tableNumber, item, addOns, size, portion, notes);
    },
    [tableId, tableName, tableNumber, addItem]
  );

  const handleHold = useCallback(async () => {
    setHolding(true);
    try {
      await holdOrder(tableId);
      router.push("/tables");
    } finally {
      setHolding(false);
    }
  }, [tableId, holdOrder, router]);

  const handleCheckoutDone = useCallback(() => {
    setShowCheckout(false);
    router.push("/tables");
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "white" }}>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full animate-bounce"
              style={{ background: "#FACDB0", animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      {/* ── Desktop: side-by-side layout ── */}
      <div
        className="hidden lg:flex overflow-hidden"
        style={{ height: "calc(100dvh - 0px)" }}
      >
        {/* Menu side */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Header */}
          <div
            className="flex items-center gap-3 px-5 shrink-0 border-b"
            style={{
              height: 56,
              background: "white",
              borderColor: "#F0E8DF",
            }}
          >
            <button
              onClick={() => router.push("/tables")}
              className="press flex items-center gap-1.5 text-sm font-bold"
              style={{ color: "#7A6456" }}
            >
              <ArrowLeft size={16} />
              Tables
            </button>
            <div
              className="w-px h-4 mx-1"
              style={{ background: "#F0E8DF" }}
            />
            <span className="font-black text-base" style={{ color: "#1A1208" }}>
              {tableName}
            </span>
          </div>

          <MenuPanel
            categories={categories}
            items={menuItems}
            onItemPress={handleItemPress}
          />
        </div>

        {/* Cart side */}
        <div
          className="flex flex-col shrink-0 border-l overflow-hidden"
          style={{ width: 360, borderColor: "#F0E8DF" }}
        >
          <TableCartPanel
            tableId={tableId}
            tableName={tableName}
            tableNumber={tableNumber}
            gstPercent={gstPercent}
            onCheckout={() => setShowCheckout(true)}
            onDiscountTypeChange={(t, p) => { setCartDiscountType(t); setCartDiscountPercent(p); }}
            onHold={handleHold}
            holding={holding}
          />
        </div>
      </div>

      {/* ── Mobile: stacked layout ── */}
      <div className="lg:hidden flex flex-col overflow-hidden" style={{ height: "100dvh" }}>
        {/* Mobile header */}
        <div
          className="flex items-center gap-3 px-4 shrink-0 border-b"
          style={{
            height: 56,
            background: "white",
            borderColor: "#F0E8DF",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <button
            onClick={() => router.push("/tables")}
            className="press flex items-center gap-1 text-sm font-bold"
            style={{ color: "#7A6456" }}
          >
            <ArrowLeft size={16} />
          </button>
          <span className="font-black text-base flex-1" style={{ color: "#1A1208" }}>
            {tableName}
          </span>
        </div>

        {/* Mobile: menu takes most space */}
        <MobileTableView
          tableId={tableId}
          tableName={tableName}
          tableNumber={tableNumber}
          gstPercent={gstPercent}
          categories={categories}
          menuItems={menuItems}
          onItemPress={handleItemPress}
          onHold={handleHold}
          holding={holding}
          onCheckout={() => setShowCheckout(true)}
        />
      </div>

      {/* Item config sheet */}
      {configItem && (
        <ItemConfigSheet
          item={configItem}
          onClose={() => setConfigItem(null)}
          onConfirm={handleConfigConfirm}
        />
      )}

      {/* Checkout sheet */}
      {showCheckout && (
        <CheckoutSheet
          tableId={tableId}
          tableName={tableName}
          tableNumber={tableNumber}
          gstPercent={gstPercent}
          upiId={session?.upiId}
          businessName={session?.businessName}
          onDone={handleCheckoutDone}
          onClose={() => setShowCheckout(false)}
          checkoutDiscountType={cartDiscountType}
          checkoutDiscountPercent={cartDiscountPercent}
        />
      )}
    </AppShell>
  );
}

// ── Mobile unified view ───────────────────────────────────────────────────────

function MobileTableView({
  tableId,
  tableName,
  tableNumber,
  gstPercent,
  categories,
  menuItems,
  onItemPress,
  onHold,
  holding,
  onCheckout,
}: {
  tableId: string;
  tableName: string;
  tableNumber: number;
  gstPercent: number;
  categories: ReturnType<typeof useApp>["state"]["categories"];
  menuItems: MenuItem[];
  onItemPress: (item: MenuItem) => void;
  onHold: () => Promise<void>;
  holding: boolean;
  onCheckout: () => void;
}) {
  const order = useTableOrder(tableId);
  const { updateItemQty, removeItem } = useTableStore();
  const [showCart, setShowCart] = useState(false);

  const items = order?.items ?? [];
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const totalPaise = order?.totalPaise ?? 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Menu */}
      <div className="flex-1 overflow-hidden">
        <MenuPanel
          categories={categories}
          items={menuItems}
          onItemPress={onItemPress}
        />
      </div>

      {/* Floating cart bar */}
      {itemCount > 0 && !showCart && (
        <div className="shrink-0 px-3 pb-3" style={{ background: "#F5F0EB" }}>
          <button
            onClick={() => setShowCart(true)}
            className="w-full h-14 rounded-2xl flex items-center px-5 press shadow-md"
            style={{ background: "#E8590C" }}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center mr-3 shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <span className="text-white text-sm font-black">{itemCount}</span>
            </div>
            <span className="text-white font-bold flex-1 text-left">View Order</span>
            <span className="text-white font-black text-lg">{fmtRupee(totalPaise)}</span>
          </button>
        </div>
      )}

      {/* Mobile cart drawer */}
      {showCart && (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end"
          style={{ background: "rgba(26,18,8,0.5)" }}
          onClick={() => setShowCart(false)}
        >
          <div
            className="rounded-t-3xl overflow-hidden flex flex-col"
            style={{ background: "white", maxHeight: "80dvh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-4 shrink-0 border-b"
              style={{ borderColor: "#F0E8DF" }}
            >
              <span className="font-black" style={{ color: "#1A1208" }}>
                {tableName} · {itemCount} item{itemCount !== 1 ? "s" : ""}
              </span>
              <button onClick={() => setShowCart(false)} className="press p-1" style={{ color: "#A89684" }}>
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {items.map((item) => {
                const ao = item.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
                const lineTotal = (item.unitPricePaise + ao) * item.qty;
                return (
                  <div
                    key={item.cartId}
                    className="rounded-xl p-3 flex items-center gap-3"
                    style={{ background: "#FEF9F4", border: "1px solid #F0E8DF" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "#1A1208" }}>
                        {item.name}
                      </p>
                      {item.notes && (
                        <p className="text-xs italic" style={{ color: "#E8590C" }}>
                          &quot;{item.notes}&quot;
                        </p>
                      )}
                    </div>
                    <div
                      className="flex items-center rounded-xl border overflow-hidden shrink-0"
                      style={{ borderColor: "#F0E8DF" }}
                    >
                      <button
                        onClick={() => updateItemQty(tableId, item.cartId, item.qty - 1)}
                        className="w-8 h-8 flex items-center justify-center press"
                        style={{ background: "white" }}
                      >
                        <Minus size={12} style={{ color: "#7A6456" }} />
                      </button>
                      <span className="w-7 text-center text-sm font-black" style={{ color: "#1A1208" }}>
                        {item.qty}
                      </span>
                      <button
                        onClick={() => updateItemQty(tableId, item.cartId, item.qty + 1)}
                        className="w-8 h-8 flex items-center justify-center press"
                        style={{ background: "#E8590C" }}
                      >
                        <Plus size={12} style={{ color: "white" }} />
                      </button>
                    </div>
                    <span className="text-sm font-black shrink-0 ml-1" style={{ color: "#1A1208" }}>
                      {fmtRupee(lineTotal)}
                    </span>
                    <button
                      onClick={() => removeItem(tableId, item.cartId)}
                      className="press shrink-0"
                      style={{ color: "#E5DBCC" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div
              className="px-4 pb-5 pt-3 space-y-2 border-t shrink-0"
              style={{ borderColor: "#F0E8DF" }}
            >
              <div className="flex justify-between text-sm font-black" style={{ color: "#1A1208" }}>
                <span>Total</span>
                <span style={{ color: "#E8590C" }}>{fmtRupee(totalPaise)}</span>
              </div>
              <button
                onClick={async () => { setShowCart(false); await onHold(); }}
                disabled={holding}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-2xl border-2 font-bold text-sm press disabled:opacity-40"
                style={{ borderColor: "#FACDB0", color: "#B83E06", background: "#FEF0E8" }}
              >
                {holding ? <Loader2 size={16} className="animate-spin" /> : <BookmarkCheck size={16} />}
                {holding ? "Saving…" : "Hold Order"}
              </button>
              <button
                onClick={() => { setShowCart(false); onCheckout(); }}
                className="w-full h-12 rounded-2xl font-bold press shadow-md"
                style={{ background: "#E8590C", color: "white" }}
              >
                Checkout · {fmtRupee(totalPaise)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Fix: import React for JSX
import React from "react";
