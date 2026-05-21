"use client";
import React, { useState, useEffect } from "react";
import { useApp } from "@/lib/store/AppContext";
import { fmtRupee, calcDiscount, calcGST } from "@/lib/utils";
import {
  Minus,
  Plus,
  Trash2,
  Tag,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  LayoutGrid,
  BookmarkCheck,
} from "lucide-react";
import CheckoutModal from "./CheckoutModal";
import type { ServiceMode } from "@/lib/types";

const SERVICE_MODES: { mode: ServiceMode; label: string; Icon: React.ElementType }[] = [
  { mode: "dine_in",  label: "Dine-in",  Icon: UtensilsCrossed },
  { mode: "takeaway", label: "Takeaway", Icon: ShoppingBag     },
  { mode: "delivery", label: "Delivery", Icon: Bike            },
];

interface Props {
  onClose?: () => void;
}

export default function CartPanel({ onClose }: Props) {
  const {
    state,
    updateCartQty,
    removeFromCart,
    clearCart,
    setServiceMode,
    setTableNumber,
    holdToTable,
    showToast,
  } = useApp();
  const { cart, session, serviceMode, tableNumber } = state;

  const ss = session?.stockSettings;
  const tablesEnabled    = ss?.tablesEnabled ?? false;
  const tableCount       = ss?.tableCount ?? 10;
  const openTableBilling = ss?.openTableBilling ?? false;

  const [discountType, setDiscountType] = useState<"flat" | "percent">("flat");
  const [discountInput, setDiscountInput] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    if (cart.length === 0) setDiscountInput("");
  }, [cart.length]);

  // GST-compliant calculation:
  // subtotal = sum of all items
  // discount applied to subtotal
  // GST calculated on (subtotal - discount)
  // total = (subtotal - discount) + GST
  const subtotalPaise = cart.reduce((sum, item) => {
    const ao = item.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
    return sum + (item.unitPricePaise + ao) * item.qty;
  }, 0);

  const discountValue  = Number(discountInput) || 0;
  const discountPaise  = calcDiscount(subtotalPaise, discountType, discountValue);
  const afterDiscount  = Math.max(0, subtotalPaise - discountPaise);
  const gstPercent     = session?.gstPercent ?? 0;
  const gstPaise       = calcGST(afterDiscount, gstPercent);   // GST on taxable amount AFTER discount
  const totalPaise     = afterDiscount + gstPaise;
  const itemCount      = cart.reduce((s, i) => s + i.qty, 0);

  const handleHold = async () => {
    if (!tableNumber) {
      showToast("Select a table first to hold", "error");
      return;
    }
    if (cart.length === 0) return;
    setHolding(true);
    try {
      await holdToTable(tableNumber);
      showToast(`Cart held on Table ${tableNumber} ✓`);
      onClose?.();
    } catch {
      showToast("Failed to hold order", "error");
    } finally {
      setHolding(false);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full bg-white overflow-hidden">

        {/* Service mode tabs */}
        <div className="flex gap-1 px-3 pt-3 pb-2 shrink-0">
          {SERVICE_MODES.map(({ mode, label, Icon }) => (
            <button
              key={mode}
              onClick={() => setServiceMode(mode)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-bold border transition-all press ${
                serviceMode === mode
                  ? "border-primary-500 bg-primary-50 text-primary-600"
                  : "border-gray-200 text-gray-500"
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Table picker */}
        {tablesEnabled && serviceMode === "dine_in" && (
          <div className="px-3 pb-2 shrink-0">
            <button
              onClick={() => setShowTablePicker(!showTablePicker)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-bold transition-all press ${
                tableNumber
                  ? "border-primary-500 bg-primary-50 text-primary-600"
                  : "border-gray-200 text-gray-500"
              }`}
            >
              <LayoutGrid size={14} />
              {tableNumber ? `Table ${tableNumber}` : "Select Table"}
              <span className="ml-auto text-xs">{showTablePicker ? "▲" : "▼"}</span>
            </button>
            {showTablePicker && (
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {Array.from({ length: tableCount }, (_, i) => i + 1).map((n) => {
                  const isOpen = state.openTables.some((t) => t.tableNumber === n);
                  return (
                    <button
                      key={n}
                      onClick={() => {
                        setTableNumber(n === tableNumber ? undefined : n);
                        setShowTablePicker(false);
                      }}
                      className={`h-9 rounded-xl text-sm font-bold border-2 press transition-all relative ${
                        tableNumber === n
                          ? "border-primary-500 bg-primary-500 text-white"
                          : isOpen
                          ? "border-amber-400 bg-amber-50 text-amber-700"
                          : "border-gray-200 text-gray-700"
                      }`}
                    >
                      {n}
                      {isOpen && tableNumber !== n && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
                      )}
                    </button>
                  );
                })}
                {tableNumber && (
                  <button
                    onClick={() => {
                      setTableNumber(undefined);
                      setShowTablePicker(false);
                    }}
                    className="h-9 rounded-xl text-xs font-bold border-2 border-red-200 text-red-500 press col-span-2"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900 text-sm">
            Cart{itemCount > 0 ? ` · ${itemCount} item${itemCount > 1 ? "s" : ""}` : ""}
          </h2>
          {cart.length > 0 && (
            <button
              onClick={() => { clearCart(); setDiscountInput(""); }}
              className="text-xs font-semibold text-red-500 press"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-300 select-none">
              <span className="text-5xl mb-3">🛒</span>
              <p className="text-sm font-semibold">Cart is empty</p>
              <p className="text-xs mt-1">Tap items to add</p>
            </div>
          ) : (
            cart.map((item) => {
              const ao = item.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
              const lineTotal = (item.unitPricePaise + ao) * item.qty;
              return (
                <div key={item.cartId} className="bg-gray-50 rounded-2xl p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                      {item.selectedSize && <p className="text-xs text-gray-500">{item.selectedSize}</p>}
                      {item.selectedPortion && <p className="text-xs text-gray-500">{item.selectedPortion}</p>}
                      {item.selectedAddOns.length > 0 && (
                        <p className="text-xs text-gray-400">
                          + {item.selectedAddOns.map((a) => a.name).join(", ")}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-primary-500 italic mt-0.5">&quot;{item.notes}&quot;</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromCart(item.cartId)}
                      className="text-gray-300 hover:text-red-400 p-0.5 shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => updateCartQty(item.cartId, item.qty - 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-gray-50 press"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-7 text-center text-sm font-black">{item.qty}</span>
                      <button
                        onClick={() => updateCartQty(item.cartId, item.qty + 1)}
                        className="w-8 h-8 flex items-center justify-center bg-primary-500 press"
                      >
                        <Plus size={13} className="text-white" />
                      </button>
                    </div>
                    <span className="text-sm font-black text-gray-900">{fmtRupee(lineTotal)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Summary + actions */}
        {cart.length > 0 && (
          <div className="border-t border-gray-100 px-4 pt-3 pb-4 space-y-3 shrink-0 bg-white">

            {/* Discount row */}
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-gray-400 shrink-0" />
              <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0">
                <button
                  onClick={() => setDiscountType("flat")}
                  className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    discountType === "flat" ? "bg-primary-500 text-white" : "bg-white text-gray-500"
                  }`}
                >
                  ₹
                </button>
                <button
                  onClick={() => setDiscountType("percent")}
                  className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    discountType === "percent" ? "bg-primary-500 text-white" : "bg-white text-gray-500"
                  }`}
                >
                  %
                </button>
              </div>
              <input
                type="number"
                className="flex-1 h-8 px-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-primary-500"
                placeholder={discountType === "flat" ? "Discount ₹" : "Discount %"}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
              />
            </div>

            {/* GST-compliant totals breakdown */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span className="font-semibold">{fmtRupee(subtotalPaise)}</span>
              </div>
              {discountPaise > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span className="font-semibold">−{fmtRupee(discountPaise)}</span>
                </div>
              )}
              {discountPaise > 0 && (
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>Taxable amount</span>
                  <span className="font-semibold">{fmtRupee(afterDiscount)}</span>
                </div>
              )}
              {gstPercent > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>GST ({gstPercent}%)</span>
                  <span className="font-semibold">{fmtRupee(gstPaise)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-gray-900 pt-1.5 border-t border-gray-100">
                <span>Total</span>
                <span className="text-primary-500">{fmtRupee(totalPaise)}</span>
              </div>
            </div>

            {/* Hold button */}
            {openTableBilling && serviceMode === "dine_in" && (
              <button
                onClick={handleHold}
                disabled={holding || !tableNumber}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-2xl border-2 border-amber-400 text-amber-700 font-bold text-sm press disabled:opacity-40"
              >
                <BookmarkCheck size={16} />
                {holding
                  ? "Holding…"
                  : tableNumber
                  ? `Hold on Table ${tableNumber}`
                  : "Select table to Hold"}
              </button>
            )}

            {/* Checkout */}
            <button
              onClick={() => setShowCheckout(true)}
              className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold press shadow-md"
            >
              Checkout · {fmtRupee(totalPaise)}
            </button>
          </div>
        )}
      </div>

      <CheckoutModal
        open={showCheckout}
        onClose={() => { setShowCheckout(false); onClose?.(); }}
        totalPaise={totalPaise}
        subtotalPaise={subtotalPaise}
        discountPaise={discountPaise}
        gstPaise={gstPaise}
        gstPercent={gstPercent}
        discountType={discountType}
        discountValue={discountValue}
      />
    </>
  );
}
