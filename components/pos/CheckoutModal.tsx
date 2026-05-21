"use client";
import React, { useState, useEffect, useRef } from "react";
import Modal from "@/components/ui/Modal";
import { useApp } from "@/lib/store/AppContext";
import type { PaymentMethod } from "@/lib/types";
import { fmtRupee, fmtDate, toP, QUICK_CASH } from "@/lib/utils";
import {
  CheckCircle2,
  Banknote,
  Smartphone,
  Printer,
  MessageCircle,
  QrCode,
  X,
  Loader2,
  ClipboardList,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  totalPaise: number;
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  gstPercent: number;
  discountType: "flat" | "percent";
  discountValue: number;
}

const PAY_METHODS = [
  { id: "cash" as PaymentMethod, label: "Cash", Icon: Banknote },
  { id: "upi" as PaymentMethod, label: "UPI", Icon: Smartphone },
  { id: "split" as PaymentMethod, label: "Split", Icon: Banknote },
];

type PostTab = "invoice" | "whatsapp" | "kot";

export default function CheckoutModal({
  open,
  onClose,
  totalPaise,
  subtotalPaise,
  discountPaise,
  gstPaise,
  gstPercent,
  discountType,
  discountValue,
}: Props) {
  const { state, placeOrder, showToast } = useApp();
  const { session, cart } = state;

  const kotEnabled = session?.stockSettings?.kotEnabled ?? false;
  const hasUpi = Boolean(session?.upiId);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashInput, setCashInput] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitUpi, setSplitUpi] = useState("");
  const [upiConfirmed, setUpiConfirmed] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<Awaited<ReturnType<typeof placeOrder>> | null>(null);
  const [postTab, setPostTab] = useState<PostTab>("invoice");
  const [qrSrc, setQrSrc] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [showUpiQr, setShowUpiQr] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Reset all state when modal opens
  useEffect(() => {
    if (open) {
      setMethod("cash");
      setCashInput("");
      setSplitCash("");
      setSplitUpi("");
      setUpiConfirmed(false);
      setPlacing(false);
      setOrder(null);
      setQrSrc("");
      setShowUpiQr(false);
    }
  }, [open]);

  // Generate QR when user clicks Show QR
  useEffect(() => {
    if (!showUpiQr || !hasUpi) return;
    const amount = (totalPaise / 100).toFixed(2);
    const upiId = session?.upiId ?? "";
    const name = encodeURIComponent(session?.businessName ?? "Vynn");
    const upiStr = `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`;
    const api = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiStr)}`;
    setQrSrc("");
    setQrLoading(true);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setQrSrc(api);
        setQrLoading(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) setQrLoading(false);
    };
    img.src = api;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [showUpiQr, hasUpi, totalPaise, session]);

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

  const handleConfirm = async () => {
    if (!canConfirm) {
      if (method === "cash")
        showToast("Cash received is less than total", "error");
      if (method === "split")
        showToast("Split amounts don't cover total", "error");
      if (method === "upi" && !upiConfirmed)
        showToast("Confirm UPI payment received first", "error");
      return;
    }
    setPlacing(true);
    try {
      const placed = await placeOrder({
        paymentMethod: method,
        discountType,
        discountValue,
        cashReceivedPaise: method === "cash" ? cashPaise : undefined,
        splitPayment:
          method === "split"
            ? { cashPaise: splitCashP, upiPaise: splitUpiP }
            : undefined,
      });
      setOrder(placed);
      setPostTab("invoice");
      setShowUpiQr(false);
    } catch {
      showToast("Order failed. Try again.", "error");
      setPlacing(false);
    }
  };

  const handlePrint = () => {
    const el = invoiceRef.current;
    if (!el) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice #${order?.billNumber}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm}.c{text-align:center}.b{font-weight:bold}.row{display:flex;justify-content:space-between}hr{border:none;border-top:1px dashed #000;margin:4px 0}</style></head><body>${el.innerHTML}</body></html>`;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) {
      showToast("Allow popups to print invoice", "error");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 400);
  };

  const handlePrintKot = () => {
    if (!order) return;
    const tableInfo = order.tableNumber
      ? `Table: ${order.tableNumber}`
      : order.serviceMode.replace("_", " ").toUpperCase();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>KOT #${order.billNumber}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:13px;width:80mm;padding:4mm}.c{text-align:center}.b{font-weight:bold;font-size:15px}hr{border:none;border-top:2px dashed #000;margin:4px 0}.item{font-size:14px;margin:4px 0}</style></head><body>
      <div class="c b">KITCHEN ORDER</div>
      <hr/>
      <div class="c">${tableInfo} · #${order.billNumber}</div>
      <div class="c">${new Date(order.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
      <hr/>
      ${order.items
        .map(
          (i) =>
            `<div class="item">${i.qty}x ${i.name}${i.selectedPortion ? ` (${i.selectedPortion})` : ""}${i.selectedAddOns.length ? ` + ${i.selectedAddOns.map((a) => a.name).join(", ")}` : ""}${i.notes ? `<br/><em style="font-size:11px">→ ${i.notes}</em>` : ""}</div>`
        )
        .join("")}
      <hr/>
    </body></html>`;
    const w = window.open("", "_blank", "width=300,height=400");
    if (!w) {
      showToast("Allow popups to print KOT", "error");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 300);
  };

  const handleWhatsApp = () => {
    if (!order) return;
    const lines = [
      `🧾 *Bill from ${session?.businessName ?? "Vynn"}*`,
      `Bill #: ${order.billNumber}`,
      `Date: ${fmtDate(order.createdAt)}`,
      ``,
      ...order.items.map((i) => {
        const ao = i.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
        return `• ${i.name} x${i.qty}  ${fmtRupee((i.unitPricePaise + ao) * i.qty)}`;
      }),
      ``,
      `Subtotal: ${fmtRupee(order.subtotalPaise)}`,
      order.discountPaise > 0
        ? `Discount: -${fmtRupee(order.discountPaise)}`
        : null,
      gstPercent > 0
        ? `GST (${gstPercent}%): ${fmtRupee(order.gstPaise)}`
        : null,
      `*Total: ${fmtRupee(order.totalPaise)}*`,
      `Payment: ${order.paymentMethod.toUpperCase()}`,
      ``,
      `Thank you! 🙏`,
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank");
  };

  const handleDone = () => {
    setOrder(null);
    onClose();
  };

  // ── Pre-checkout screen ────────────────────────────────────────────────────
  if (!order) {
    return (
      <Modal open={open} onClose={onClose} title="Checkout">
        <div className="px-5 pb-6 space-y-4 pt-1">
          {/* Summary */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5 text-sm">
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
            {gstPercent > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>GST ({gstPercent}%)</span>
                <span className="font-semibold">{fmtRupee(gstPaise)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-black text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className="text-primary-500">{fmtRupee(totalPaise)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">
              Payment Method
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setMethod(id);
                    setShowUpiQr(false);
                    setUpiConfirmed(false);
                  }}
                  className={`py-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all press ${
                    method === id
                      ? "border-primary-500 bg-primary-50 text-primary-600"
                      : "border-gray-200 text-gray-600"
                  }`}
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
                className={`w-full h-14 px-4 rounded-2xl border-2 outline-none text-2xl font-black transition-colors ${
                  cashInput !== "" && cashPaise < totalPaise
                    ? "border-red-400 bg-red-50 text-red-600"
                    : "border-gray-200 focus:border-primary-500"
                }`}
                placeholder="Cash received"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
              />
              <div className="flex gap-2 flex-wrap">
                {QUICK_CASH.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setCashInput(String(amt))}
                    className={`px-3 py-1.5 rounded-xl border font-bold text-sm press ${
                      Number(cashInput) === amt
                        ? "border-primary-500 bg-primary-50 text-primary-600"
                        : "border-gray-200 text-gray-600 bg-white"
                    }`}
                  >
                    ₹{amt}
                  </button>
                ))}
                <button
                  onClick={() => setCashInput(String(totalPaise / 100))}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 font-bold text-sm text-gray-600 bg-white press"
                >
                  Exact
                </button>
              </div>
              {cashInput !== "" && (
                <div
                  className={`rounded-xl py-3 text-center font-bold text-sm ${
                    cashPaise >= totalPaise
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-600"
                  }`}
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
              <div className="bg-blue-50 rounded-2xl p-4 text-center">
                <p className="text-3xl mb-2">📱</p>
                <p className="font-bold text-blue-800">Collect via UPI</p>
                <p className="text-sm text-blue-600 mt-1">
                  {fmtRupee(totalPaise)}
                </p>
              </div>

              {hasUpi && (
                <div>
                  {!showUpiQr ? (
                    <button
                      onClick={() => setShowUpiQr(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-blue-200 text-blue-600 font-bold text-sm press"
                    >
                      <QrCode size={16} />
                      Show QR Code
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-2">
                      <div className="w-44 h-44 rounded-2xl bg-gray-50 border-2 border-gray-200 flex items-center justify-center overflow-hidden">
                        {qrLoading && (
                          <Loader2
                            size={28}
                            className="text-gray-300 animate-spin"
                          />
                        )}
                        {!qrLoading && qrSrc && (
                          <img
                            src={qrSrc}
                            alt="UPI QR"
                            width={168}
                            height={168}
                            className="rounded-xl"
                          />
                        )}
                        {!qrLoading && !qrSrc && (
                          <p className="text-xs text-gray-400">QR unavailable</p>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-semibold">
                        {session?.upiId}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!hasUpi && (
                <p className="text-xs text-gray-400 text-center">
                  Add UPI ID in Settings to show QR code
                </p>
              )}

              {/* Confirmation checkbox — must tick before confirm */}
              <label
                className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer select-none transition-colors ${
                  upiConfirmed
                    ? "border-primary-500 bg-primary-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={upiConfirmed}
                  onChange={(e) => setUpiConfirmed(e.target.checked)}
                  className="w-5 h-5 accent-primary-500 shrink-0"
                />
                <span className="text-sm font-bold text-gray-700">
                  Payment received on UPI ✓
                </span>
              </label>
            </div>
          )}

          {/* Split */}
          {method === "split" && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-gray-700">Split Payment</p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 font-semibold block mb-1">
                    Cash ₹
                  </label>
                  <input
                    type="number"
                    className="bm-input"
                    placeholder="0"
                    value={splitCash}
                    onChange={(e) => setSplitCash(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 font-semibold block mb-1">
                    UPI ₹
                  </label>
                  <input
                    type="number"
                    className="bm-input"
                    placeholder="0"
                    value={splitUpi}
                    onChange={(e) => setSplitUpi(e.target.value)}
                  />
                </div>
              </div>
              <div
                className={`rounded-xl py-2 px-3 text-sm font-bold text-center ${
                  splitOk
                    ? "bg-green-50 text-green-700"
                    : "bg-gray-50 text-gray-500"
                }`}
              >
                {splitOk
                  ? `Covered ✓ (${fmtRupee(splitTotal)})`
                  : `Need ${fmtRupee(totalPaise)} · have ${fmtRupee(splitTotal)}`}
              </div>
            </div>
          )}

          <button
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="w-full h-14 bg-primary-500 text-white rounded-2xl font-black text-lg disabled:opacity-40 press shadow-md flex items-center justify-center gap-2"
          >
            {placing && <Loader2 size={18} className="animate-spin" />}
            {placing ? "Processing…" : `Confirm ${fmtRupee(totalPaise)}`}
          </button>
        </div>
      </Modal>
    );
  }

  // ── Post-checkout screen ───────────────────────────────────────────────────
  const postTabs: { id: PostTab; label: string; Icon: React.ElementType }[] = [
    { id: "invoice", label: "Invoice", Icon: Printer },
    { id: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
    ...(kotEnabled
      ? [{ id: "kot" as PostTab, label: "KOT", Icon: ClipboardList }]
      : []),
  ];

  return (
    <Modal open={open} onClose={handleDone} title="">
      <div className="flex flex-col" style={{ maxHeight: "88dvh" }}>
        {/* Success banner */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle2 size={24} className="text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-gray-900">Order Placed!</p>
            <p className="text-xs text-gray-400">
              #{order.billNumber}
              {order.tableNumber ? ` · Table ${order.tableNumber}` : ""}
              {" · "}
              {fmtRupee(order.totalPaise)}
              {order.changePaise && order.changePaise > 0
                ? ` · Change: ${fmtRupee(order.changePaise)}`
                : ""}
            </p>
          </div>
          <button onClick={handleDone} className="text-gray-400 press p-1">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-3 pt-2">
          {postTabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setPostTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold border-b-2 transition-colors ${
                postTab === id
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-400"
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Invoice */}
          {postTab === "invoice" && (
            <div>
              <div
                ref={invoiceRef}
                className="font-mono text-xs leading-relaxed bg-white border border-dashed border-gray-300 rounded-xl p-4 mx-auto"
                style={{ maxWidth: "320px" }}
              >
                <div className="c b text-sm mb-1">
                  {session?.businessName ?? "Vynn"}
                </div>
                <div className="border-t border-dashed border-gray-300 my-2" />
                <div className="row">
                  <span>Bill #: {order.billNumber}</span>
                  <span>{fmtDate(order.createdAt)}</span>
                </div>
                {order.tableNumber && (
                  <div className="text-center text-xs mt-1">
                    Table: {order.tableNumber}
                  </div>
                )}
                <div className="border-t border-dashed border-gray-300 my-2" />
                {order.items.map((item, i) => {
                  const ao = item.selectedAddOns.reduce(
                    (s, a) => s + a.pricePaise,
                    0
                  );
                  const line = (item.unitPricePaise + ao) * item.qty;
                  return (
                    <div key={i} className="mb-1">
                      <div className="row">
                        <span className="flex-1 truncate pr-2">{item.name}</span>
                        <span>{fmtRupee(line)}</span>
                      </div>
                      <div className="text-gray-400 pl-2">
                        {item.qty} × {fmtRupee(item.unitPricePaise + ao)}
                      </div>
                    </div>
                  );
                })}
                <div className="border-t border-dashed border-gray-300 my-2" />
                <div className="row text-gray-500">
                  <span>Subtotal</span>
                  <span>{fmtRupee(order.subtotalPaise)}</span>
                </div>
                {order.discountPaise > 0 && (
                  <div className="row text-gray-500">
                    <span>Discount</span>
                    <span>-{fmtRupee(order.discountPaise)}</span>
                  </div>
                )}
                {order.gstPercent > 0 && (
                  <div className="row text-gray-500">
                    <span>GST ({order.gstPercent}%)</span>
                    <span>{fmtRupee(order.gstPaise)}</span>
                  </div>
                )}
                <div className="border-t border-dashed border-gray-300 my-2" />
                <div className="row b text-sm">
                  <span>TOTAL</span>
                  <span>{fmtRupee(order.totalPaise)}</span>
                </div>
                <div className="row text-gray-500 mt-1">
                  <span>Payment</span>
                  <span>{order.paymentMethod.toUpperCase()}</span>
                </div>
                {order.changePaise != null && order.changePaise > 0 && (
                  <div className="row text-gray-500">
                    <span>Change</span>
                    <span>{fmtRupee(order.changePaise)}</span>
                  </div>
                )}
                <div className="border-t border-dashed border-gray-300 my-3" />
                <div className="c text-gray-400">Thank you! Visit again 🙏</div>
              </div>
              <button
                onClick={handlePrint}
                className="mt-4 w-full h-11 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-2xl font-bold text-sm press"
              >
                <Printer size={16} />
                Print Invoice
              </button>
            </div>
          )}

          {/* WhatsApp */}
          {postTab === "whatsapp" && (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-16 h-16 rounded-3xl bg-green-500 flex items-center justify-center mb-4">
                <MessageCircle size={32} className="text-white" />
              </div>
              <h3 className="font-black text-gray-900 text-lg mb-1">
                Send Receipt
              </h3>
              <p className="text-sm text-gray-400 mb-6">Share via WhatsApp</p>
              <button
                onClick={handleWhatsApp}
                className="w-full h-12 flex items-center justify-center gap-2 bg-green-500 text-white rounded-2xl font-bold press shadow-md"
              >
                <MessageCircle size={18} />
                Open in WhatsApp
              </button>
            </div>
          )}

          {/* KOT */}
          {postTab === "kot" && (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-16 h-16 rounded-3xl bg-orange-500 flex items-center justify-center mb-4">
                <ClipboardList size={32} className="text-white" />
              </div>
              <h3 className="font-black text-gray-900 text-lg mb-1">
                Kitchen Order Ticket
              </h3>
              <p className="text-sm text-gray-400 mb-2">
                {order.tableNumber
                  ? `Table ${order.tableNumber}`
                  : order.serviceMode.replace("_", " ")}{" "}
                · {order.items.length} item
                {order.items.length > 1 ? "s" : ""}
              </p>
              <div className="w-full bg-gray-50 rounded-2xl p-4 text-left mb-6 space-y-2">
                {order.items.map((item, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="font-black text-primary-500 w-6 shrink-0">
                      {item.qty}×
                    </span>
                    <div>
                      <p className="font-bold text-gray-900">{item.name}</p>
                      {item.selectedPortion && (
                        <p className="text-xs text-gray-500">
                          {item.selectedPortion}
                        </p>
                      )}
                      {item.selectedAddOns.length > 0 && (
                        <p className="text-xs text-gray-400">
                          + {item.selectedAddOns.map((a) => a.name).join(", ")}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-orange-500 italic">
                          → {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handlePrintKot}
                className="w-full h-12 flex items-center justify-center gap-2 bg-orange-500 text-white rounded-2xl font-bold press shadow-md"
              >
                <Printer size={18} />
                Print KOT
              </button>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 border-t border-gray-100">
          <button
            onClick={handleDone}
            className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold press shadow-md"
          >
            New Order
          </button>
        </div>
      </div>
    </Modal>
  );
}
