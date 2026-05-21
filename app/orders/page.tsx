"use client";
import React, { useState, useEffect, useRef } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import Modal from "@/components/ui/Modal";
import { fmtRupee, fmtTime, fmtDate, todayStr, PAY_LABEL, SERVICE_LABEL, calcDiscount, calcGST, toP, QUICK_CASH } from "@/lib/utils";
import type { Order, OpenTable, CartItem, PaymentMethod } from "@/lib/types";
import {
  TrendingUp, Banknote, ShoppingBag, Cloud, CloudOff,
  RefreshCw, ChevronDown, ChevronUp, Plus, CheckCircle, Clock,
  Printer, MessageCircle, CheckCircle2, X, Loader2, QrCode,
  Smartphone, ClipboardList,
} from "lucide-react";
import { isSupabaseEnabled } from "@/lib/supabase/client";

type PostTab = "invoice" | "whatsapp" | "kot";

function BillScreen({
  order,
  onDone,
  kotEnabled,
  session,
}: {
  order: Order;
  onDone: () => void;
  kotEnabled: boolean;
  session: { businessName?: string; upiId?: string } | null;
}) {
  const [postTab, setPostTab] = useState<PostTab>("invoice");
  const invoiceRef = useRef<HTMLDivElement>(null);

  const postTabs: { id: PostTab; label: string; Icon: React.ElementType }[] = [
    { id: "invoice",  label: "Invoice",  Icon: Printer       },
    { id: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
    ...(kotEnabled ? [{ id: "kot" as PostTab, label: "KOT", Icon: ClipboardList }] : []),
  ];

  const handlePrint = () => {
    const el = invoiceRef.current;
    if (!el) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice #${order.billNumber}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm}.c{text-align:center}.b{font-weight:bold}.row{display:flex;justify-content:space-between}hr{border:none;border-top:1px dashed #000;margin:4px 0}</style></head><body>${el.innerHTML}</body></html>`;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const handlePrintKot = () => {
    const tableInfo = order.tableNumber
      ? `Table: ${order.tableNumber}`
      : order.serviceMode.replace("_", " ").toUpperCase();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>KOT #${order.billNumber}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:13px;width:80mm;padding:4mm}.c{text-align:center}.b{font-weight:bold;font-size:15px}hr{border:none;border-top:2px dashed #000;margin:4px 0}.item{font-size:14px;margin:4px 0}</style></head><body>
      <div class="c b">KITCHEN ORDER</div><hr/>
      <div class="c">${tableInfo} · #${order.billNumber}</div>
      <div class="c">${new Date(order.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
      <hr/>
      ${order.items.map((i) => `<div class="item">${i.qty}x ${i.name}${i.selectedPortion ? ` (${i.selectedPortion})` : ""}${i.selectedAddOns.length ? ` + ${i.selectedAddOns.map((a) => a.name).join(", ")}` : ""}${i.notes ? `<br/><em style="font-size:11px">-> ${i.notes}</em>` : ""}</div>`).join("")}
      <hr/></body></html>`;
    const w = window.open("", "_blank", "width=300,height=400");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  const handleWhatsApp = () => {
    const lines = [
      `*Bill from ${session?.businessName ?? "Vynn"}*`,
      `Bill #: ${order.billNumber}`,
      `Date: ${fmtDate(order.createdAt)}`,
      ``,
      ...order.items.map((i) => {
        const ao = i.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
        return `- ${i.name} x${i.qty}  ${fmtRupee((i.unitPricePaise + ao) * i.qty)}`;
      }),
      ``,
      `Subtotal: ${fmtRupee(order.subtotalPaise)}`,
      order.discountPaise > 0 ? `Discount: -${fmtRupee(order.discountPaise)}` : null,
      order.gstPercent > 0 ? `GST (${order.gstPercent}%): ${fmtRupee(order.gstPaise)}` : null,
      `*Total: ${fmtRupee(order.totalPaise)}*`,
      `Payment: ${order.paymentMethod.toUpperCase()}`,
      ``,
      `Thank you!`,
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank");
  };

  return (
    <div className="flex flex-col" style={{ maxHeight: "88dvh" }}>
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <CheckCircle2 size={24} className="text-green-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900">Bill Closed!</p>
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
        <button onClick={onDone} className="text-gray-400 press p-1">
          <X size={18} />
        </button>
      </div>

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
        {postTab === "invoice" && (
          <div>
            <div
              ref={invoiceRef}
              className="font-mono text-xs leading-relaxed bg-white border border-dashed border-gray-300 rounded-xl p-4 mx-auto"
              style={{ maxWidth: 320 }}
            >
              <div className="text-center font-bold text-sm mb-1">
                {session?.businessName ?? "Vynn"}
              </div>
              <div className="border-t border-dashed border-gray-300 my-2" />
              <div className="flex justify-between">
                <span>Bill #: {order.billNumber}</span>
                <span>{fmtDate(order.createdAt)}</span>
              </div>
              {order.tableNumber && (
                <div className="text-center text-xs mt-1">Table: {order.tableNumber}</div>
              )}
              <div className="border-t border-dashed border-gray-300 my-2" />
              {order.items.map((item, i) => {
                const ao = item.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
                const line = (item.unitPricePaise + ao) * item.qty;
                return (
                  <div key={i} className="mb-1">
                    <div className="flex justify-between">
                      <span className="flex-1 truncate pr-2">{item.name}</span>
                      <span>{fmtRupee(line)}</span>
                    </div>
                    <div className="text-gray-400 pl-2">
                      {item.qty} x {fmtRupee(item.unitPricePaise + ao)}
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-dashed border-gray-300 my-2" />
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>{fmtRupee(order.subtotalPaise)}</span>
              </div>
              {order.discountPaise > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Discount</span>
                  <span>-{fmtRupee(order.discountPaise)}</span>
                </div>
              )}
              {order.gstPercent > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>GST ({order.gstPercent}%)</span>
                  <span>{fmtRupee(order.gstPaise)}</span>
                </div>
              )}
              <div className="border-t border-dashed border-gray-300 my-2" />
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL</span>
                <span>{fmtRupee(order.totalPaise)}</span>
              </div>
              <div className="flex justify-between text-gray-500 mt-1">
                <span>Payment</span>
                <span>{order.paymentMethod.toUpperCase()}</span>
              </div>
              {order.changePaise != null && order.changePaise > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Change</span>
                  <span>{fmtRupee(order.changePaise)}</span>
                </div>
              )}
              <div className="border-t border-dashed border-gray-300 my-3" />
              <div className="text-center text-gray-400">Thank you! Visit again</div>
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

        {postTab === "whatsapp" && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-3xl bg-green-500 flex items-center justify-center mb-4">
              <MessageCircle size={32} className="text-white" />
            </div>
            <h3 className="font-black text-gray-900 text-lg mb-1">Send Receipt</h3>
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

        {postTab === "kot" && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-3xl bg-orange-500 flex items-center justify-center mb-4">
              <ClipboardList size={32} className="text-white" />
            </div>
            <h3 className="font-black text-gray-900 text-lg mb-1">Kitchen Order Ticket</h3>
            <p className="text-sm text-gray-400 mb-2">
              {order.tableNumber ? `Table ${order.tableNumber}` : order.serviceMode.replace("_", " ")}{" "}
              · {order.items.length} item{order.items.length > 1 ? "s" : ""}
            </p>
            <div className="w-full bg-gray-50 rounded-2xl p-4 text-left mb-6 space-y-2">
              {order.items.map((item, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="font-black text-primary-500 w-6 shrink-0">{item.qty}x</span>
                  <div>
                    <p className="font-bold text-gray-900">{item.name}</p>
                    {item.selectedPortion && (
                      <p className="text-xs text-gray-500">{item.selectedPortion}</p>
                    )}
                    {item.selectedAddOns.length > 0 && (
                      <p className="text-xs text-gray-400">
                        + {item.selectedAddOns.map((a) => a.name).join(", ")}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-orange-500 italic">-&gt; {item.notes}</p>
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
          onClick={onDone}
          className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold press shadow-md"
        >
          Done
        </button>
      </div>
    </div>
  );
}

const PAY_METHODS: { id: PaymentMethod; label: string; Icon: React.ElementType }[] = [
  { id: "cash",  label: "Cash",  Icon: Banknote   },
  { id: "upi",   label: "UPI",   Icon: Smartphone },
  { id: "split", label: "Split", Icon: Banknote   },
];

function CloseTableCheckout({
  tab,
  onClose,
  onBilled,
}: {
  tab: OpenTable;
  onClose: () => void;
  onBilled: (order: Order) => void;
}) {
  const { state, closeTable, showToast } = useApp();
  const session = state.session;

  const [method, setMethod]               = useState<PaymentMethod>("cash");
  const [discountType, setDiscountType]   = useState<"flat" | "percent">("flat");
  const [discountInput, setDiscountInput] = useState("");
  const [cashInput, setCashInput]         = useState("");
  const [splitCash, setSplitCash]         = useState("");
  const [splitUpi, setSplitUpi]           = useState("");
  const [upiConfirmed, setUpiConfirmed]   = useState(false);
  const [placing, setPlacing]             = useState(false);
  const [qrSrc, setQrSrc]                 = useState("");
  const [qrLoading, setQrLoading]         = useState(false);
  const [showUpiQr, setShowUpiQr]         = useState(false);

  const hasUpi = Boolean(session?.upiId);

  const subtotalPaise  = tab.items.reduce((s, i) => {
    const ao = i.selectedAddOns.reduce((x, a) => x + a.pricePaise, 0);
    return s + (i.unitPricePaise + ao) * i.qty;
  }, 0);
  const discountValue  = Number(discountInput) || 0;
  const discountPaise  = calcDiscount(subtotalPaise, discountType, discountValue);
  const afterDiscount  = Math.max(0, subtotalPaise - discountPaise);
  const gstPercent     = session?.gstPercent ?? 0;
  const gstPaise       = calcGST(afterDiscount, gstPercent);
  const totalPaise     = afterDiscount + gstPaise;

  const cashPaise    = toP(Number(cashInput) || 0);
  const changePaise  = Math.max(0, cashPaise - totalPaise);
  const splitCashP   = toP(Number(splitCash) || 0);
  const splitUpiP    = toP(Number(splitUpi) || 0);
  const splitTotal   = splitCashP + splitUpiP;
  const splitOk      = splitTotal >= totalPaise;

  const canConfirm =
    !placing &&
    ((method === "upi" && upiConfirmed) ||
      (method === "cash" && cashInput !== "" && cashPaise >= totalPaise) ||
      (method === "split" && splitOk));

  useEffect(() => {
    if (!showUpiQr || !hasUpi) return;
    const amount = (totalPaise / 100).toFixed(2);
    const upiId = session?.upiId ?? "";
    const name  = encodeURIComponent(session?.businessName ?? "Vynn");
    const upiStr = `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`;
    const api = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiStr)}`;
    setQrSrc(""); setQrLoading(true);
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) { setQrSrc(api); setQrLoading(false); } };
    img.onerror = () => { if (!cancelled) setQrLoading(false); };
    img.src = api;
    return () => { cancelled = true; img.onload = null; img.onerror = null; };
  }, [showUpiQr, hasUpi, totalPaise, session]);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setPlacing(true);
    try {
      const order = await closeTable(tab.id, {
        paymentMethod: method,
        discountType,
        discountValue,
        cashReceivedPaise: method === "cash" ? cashPaise : undefined,
        splitPayment: method === "split" ? { cashPaise: splitCashP, upiPaise: splitUpiP } : undefined,
      });
      onBilled(order);
    } catch {
      showToast("Failed to close table. Try again.", "error");
      setPlacing(false);
    }
  };

  return (
    <div className="px-5 pb-6 space-y-4 pt-1">
      <div className="bg-gray-50 rounded-2xl p-4 max-h-36 overflow-y-auto">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Table {tab.tableNumber} - {tab.items.reduce((s, i) => s + i.qty, 0)} items
        </p>
        {tab.items.map((item, i) => {
          const ao = item.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
          return (
            <div key={i} className="flex justify-between text-xs text-gray-600 mb-1">
              <span>{item.qty}x {item.name}{item.selectedPortion ? ` (${item.selectedPortion})` : ""}</span>
              <span className="font-semibold ml-2 shrink-0">{fmtRupee((item.unitPricePaise + ao) * item.qty)}</span>
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Discount (optional)</p>
        <div className="flex gap-2">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0">
            <button onClick={() => setDiscountType("flat")}
              className={`px-3 py-2 text-xs font-bold transition-colors ${discountType === "flat" ? "bg-primary-500 text-white" : "bg-white text-gray-500"}`}>
              &#8377;
            </button>
            <button onClick={() => setDiscountType("percent")}
              className={`px-3 py-2 text-xs font-bold transition-colors ${discountType === "percent" ? "bg-primary-500 text-white" : "bg-white text-gray-500"}`}>
              %
            </button>
          </div>
          <input type="number" className="flex-1 h-10 px-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-primary-500"
            placeholder={discountType === "flat" ? "Flat discount" : "Discount %"}
            value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} />
        </div>
      </div>

      <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>Subtotal</span>
          <span className="font-semibold">{fmtRupee(subtotalPaise)}</span>
        </div>
        {discountPaise > 0 && (
          <>
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span className="font-semibold">-{fmtRupee(discountPaise)}</span>
            </div>
            <div className="flex justify-between text-gray-400 text-xs">
              <span>Taxable amount</span>
              <span className="font-semibold">{fmtRupee(afterDiscount)}</span>
            </div>
          </>
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

      <div>
        <p className="text-sm font-bold text-gray-700 mb-2">Payment Method</p>
        <div className="grid grid-cols-3 gap-2">
          {PAY_METHODS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => { setMethod(id); setShowUpiQr(false); setUpiConfirmed(false); }}
              className={`py-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all press ${
                method === id ? "border-primary-500 bg-primary-50 text-primary-600" : "border-gray-200 text-gray-600"
              }`}>
              <Icon size={20} />
              <span className="text-xs font-bold">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {method === "cash" && (
        <div className="space-y-3">
          <input type="number" autoFocus
            className={`w-full h-14 px-4 rounded-2xl border-2 outline-none text-2xl font-black transition-colors ${
              cashInput !== "" && cashPaise < totalPaise
                ? "border-red-400 bg-red-50 text-red-600"
                : "border-gray-200 focus:border-primary-500"
            }`}
            placeholder="Cash received"
            value={cashInput} onChange={(e) => setCashInput(e.target.value)} />
          <div className="flex gap-2 flex-wrap">
            {QUICK_CASH.map((amt) => (
              <button key={amt} onClick={() => setCashInput(String(amt))}
                className={`px-3 py-1.5 rounded-xl border font-bold text-sm press ${
                  Number(cashInput) === amt
                    ? "border-primary-500 bg-primary-50 text-primary-600"
                    : "border-gray-200 text-gray-600 bg-white"
                }`}>
                &#8377;{amt}
              </button>
            ))}
            <button onClick={() => setCashInput(String(totalPaise / 100))}
              className="px-3 py-1.5 rounded-xl border border-gray-200 font-bold text-sm text-gray-600 bg-white press">
              Exact
            </button>
          </div>
          {cashInput !== "" && (
            <div className={`rounded-xl py-3 text-center font-bold text-sm ${
              cashPaise >= totalPaise ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
            }`}>
              {cashPaise >= totalPaise
                ? `Change: ${fmtRupee(changePaise)}`
                : `Short by ${fmtRupee(totalPaise - cashPaise)}`}
            </div>
          )}
        </div>
      )}

      {method === "upi" && (
        <div className="space-y-3">
          <div className="bg-blue-50 rounded-2xl p-4 text-center">
            <p className="text-3xl mb-2">&#128241;</p>
            <p className="font-bold text-blue-800">Collect via UPI</p>
            <p className="text-sm text-blue-600 mt-1">{fmtRupee(totalPaise)}</p>
          </div>
          {hasUpi && (
            !showUpiQr ? (
              <button onClick={() => setShowUpiQr(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-blue-200 text-blue-600 font-bold text-sm press">
                <QrCode size={16} /> Show QR Code
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="w-44 h-44 rounded-2xl bg-gray-50 border-2 border-gray-200 flex items-center justify-center overflow-hidden">
                  {qrLoading && <Loader2 size={28} className="text-gray-300 animate-spin" />}
                  {!qrLoading && qrSrc && <img src={qrSrc} alt="UPI QR" width={168} height={168} className="rounded-xl" />}
                  {!qrLoading && !qrSrc && <p className="text-xs text-gray-400">QR unavailable</p>}
                </div>
                <p className="text-xs text-gray-500 font-semibold">{session?.upiId}</p>
              </div>
            )
          )}
          <label className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer select-none transition-colors ${
            upiConfirmed ? "border-primary-500 bg-primary-50" : "border-gray-200 bg-white"
          }`}>
            <input type="checkbox" checked={upiConfirmed} onChange={(e) => setUpiConfirmed(e.target.checked)}
              className="w-5 h-5 accent-primary-500 shrink-0" />
            <span className="text-sm font-bold text-gray-700">Payment received on UPI</span>
          </label>
        </div>
      )}

      {method === "split" && (
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-700">Split Payment</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-semibold block mb-1">Cash</label>
              <input type="number" className="bm-input" placeholder="0"
                value={splitCash} onChange={(e) => setSplitCash(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-semibold block mb-1">UPI</label>
              <input type="number" className="bm-input" placeholder="0"
                value={splitUpi} onChange={(e) => setSplitUpi(e.target.value)} />
            </div>
          </div>
          <div className={`rounded-xl py-2 px-3 text-sm font-bold text-center ${
            splitOk ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"
          }`}>
            {splitOk ? `Covered (${fmtRupee(splitTotal)})` : `Need ${fmtRupee(totalPaise)} · have ${fmtRupee(splitTotal)}`}
          </div>
        </div>
      )}

      <button disabled={!canConfirm} onClick={handleConfirm}
        className="w-full h-14 bg-primary-500 text-white rounded-2xl font-black text-lg disabled:opacity-40 press shadow-md flex items-center justify-center gap-2">
        {placing && <Loader2 size={18} className="animate-spin" />}
        {placing ? "Processing..." : `Collect ${fmtRupee(totalPaise)} & Close`}
      </button>
    </div>
  );
}

function AddItemsModal({
  tab,
  onClose,
  onAdd,
}: {
  tab: OpenTable;
  onClose: () => void;
  onAdd: (items: CartItem[]) => void;
}) {
  const { state } = useApp();
  const [localCart, setLocalCart] = useState<CartItem[]>([]);

  const addItem = (item: (typeof state.menuItems)[0]) => {
    setLocalCart((prev) => {
      const ex = prev.find((c) => c.menuItemId === item.id);
      if (ex) return prev.map((c) => (c.menuItemId === item.id ? { ...c, qty: c.qty + 1 } : c));
      return [
        ...prev,
        {
          cartId: crypto.randomUUID(),
          menuItemId: item.id,
          name: item.name,
          unitPricePaise: item.pricePaise,
          qty: 1,
          selectedAddOns: [],
        },
      ];
    });
  };

  const totalNew = localCart.reduce((s, i) => s + i.unitPricePaise * i.qty, 0);

  return (
    <Modal open={!!tab} onClose={onClose} title={`Add to Table ${tab.tableNumber}`}>
      <div className="flex flex-col" style={{ maxHeight: "75dvh" }}>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {state.menuItems.filter((i) => i.isAvailable).map((item) => {
            const inCart = localCart.find((c) => c.menuItemId === item.id);
            return (
              <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{fmtRupee(item.pricePaise)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {inCart && (
                    <>
                      <button
                        onClick={() =>
                          setLocalCart((p) =>
                            p
                              .map((c) => (c.menuItemId === item.id ? { ...c, qty: c.qty - 1 } : c))
                              .filter((c) => c.qty > 0)
                          )
                        }
                        className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-primary-500 press font-bold"
                      >
                        -
                      </button>
                      <span className="text-sm font-black text-gray-900 w-5 text-center">{inCart.qty}</span>
                    </>
                  )}
                  <button
                    onClick={() => addItem(item)}
                    className="w-7 h-7 rounded-full bg-primary-500 flex items-center justify-center press"
                  >
                    <Plus size={14} className="text-white" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {localCart.length > 0 && (
          <div className="px-5 pb-5 pt-3 border-t border-gray-100">
            <button
              onClick={() => onAdd(localCart)}
              className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold press shadow-md"
            >
              Add {localCart.reduce((s, i) => s + i.qty, 0)} items · {fmtRupee(totalNew)}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function OrdersPage() {
  const { state, openTableAddItems, showToast } = useApp();
  const uid = state.session?.userId ?? "default";

  const [allOrders, setAllOrders]     = useState<Order[]>([]);
  const [filter, setFilter]           = useState<"today" | "all">("today");
  const [tab, setTab]                 = useState<"orders" | "tables">("orders");
  const [syncing, setSyncing]         = useState(false);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [addingTo, setAddingTo]       = useState<OpenTable | null>(null);
  const [closingTab, setClosingTab]   = useState<OpenTable | null>(null);
  const [billedOrder, setBilledOrder] = useState<Order | null>(null);

  const isOwner          = state.session?.role === "owner";
  const openTableEnabled = state.session?.stockSettings?.openTableBilling ?? false;
  const kotEnabled       = state.session?.stockSettings?.kotEnabled ?? false;

  useEffect(() => {
    import("@/lib/db").then(({ dbGetAllOrders }) =>
      dbGetAllOrders(uid).then(setAllOrders)
    );
  }, [state.orders, uid]);

  const today       = todayStr();
  const todayOrders = allOrders.filter((o) => o.createdAt.startsWith(today));
  const displayed   = filter === "today" ? todayOrders : allOrders;
  const todaySales  = todayOrders.reduce((s, o) => s + o.totalPaise, 0);
  const totalSales  = allOrders.reduce((s, o) => s + o.totalPaise, 0);

  const handleSync = async () => {
    setSyncing(true);
    const { backgroundSync } = await import("@/lib/supabase/sync");
    await backgroundSync(uid);
    const { dbGetAllOrders } = await import("@/lib/db");
    setAllOrders(await dbGetAllOrders(uid));
    setSyncing(false);
  };

  const handleAddItems = async (items: CartItem[]) => {
    if (!addingTo) return;
    await openTableAddItems(addingTo.tableNumber, items);
    showToast(`Added ${items.reduce((s, i) => s + i.qty, 0)} items to Table ${addingTo.tableNumber}`);
    setAddingTo(null);
  };

  const handleBilled = (order: Order) => {
    setClosingTab(null);
    setBilledOrder(order);
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50">

        {/* Header */}
        <div className="bg-white px-4 lg:px-8 pt-12 lg:pt-6 pb-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-gray-900">Orders</h1>
            {isSupabaseEnabled() && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 text-sm font-bold text-primary-500 press"
              >
                <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
                Sync
              </button>
            )}
          </div>

          {openTableEnabled && (
            <div className="flex rounded-xl bg-gray-100 p-1 mt-3">
              {(["orders", "tables"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
                  }`}
                >
                  {t === "orders" ? "Orders" : `Open Tables (${state.openTables.length})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content — full width, left-aligned on desktop */}
        <div className="px-4 lg:px-8 py-4 space-y-4 w-full">

          {/* Open Tables tab */}
          {openTableEnabled && tab === "tables" && (
            <>
              {state.openTables.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                  <Clock size={48} className="mb-3" />
                  <p className="font-semibold text-gray-400">No open tables</p>
                  <p className="text-sm mt-1">Hold a cart to a table from the POS screen</p>
                </div>
              ) : (
                state.openTables.map((openTab) => {
                  const tabTotal = openTab.items.reduce((s, i) => {
                    const ao = i.selectedAddOns.reduce((x, a) => x + a.pricePaise, 0);
                    return s + (i.unitPricePaise + ao) * i.qty;
                  }, 0);
                  const itemCount = openTab.items.reduce((s, i) => s + i.qty, 0);
                  const dur = Math.round(
                    (Date.now() - new Date(openTab.openedAt).getTime()) / 60000
                  );
                  return (
                    <div key={openTab.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-gray-900">
                              Table {openTab.tableNumber}
                            </span>
                            <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Clock size={9} /> {dur}m open
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {itemCount} item{itemCount !== 1 ? "s" : ""} · Running bill:{" "}
                            <span className="font-bold text-gray-700">{fmtRupee(tabTotal)}</span>
                          </p>
                        </div>
                      </div>

                      <div className="px-4 pb-2 space-y-1">
                        {openTab.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm text-gray-600">
                            <span>
                              {item.qty}x {item.name}
                              {item.selectedPortion ? ` (${item.selectedPortion})` : ""}
                            </span>
                            <span className="font-medium">
                              {fmtRupee(
                                (item.unitPricePaise +
                                  item.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0)) *
                                  item.qty
                              )}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="px-4 pb-4 pt-2 flex gap-2">
                        <button
                          onClick={() => setAddingTo(openTab)}
                          className="flex-1 h-10 flex items-center justify-center gap-1.5 rounded-xl border-2 border-primary-200 text-primary-600 text-sm font-bold press"
                        >
                          <Plus size={14} /> Add Items
                        </button>
                        <button
                          onClick={() => setClosingTab(openTab)}
                          className="flex-1 h-10 flex items-center justify-center gap-1.5 rounded-xl bg-primary-500 text-white text-sm font-bold press shadow-sm"
                        >
                          <CheckCircle size={14} /> Close & Bill
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* Orders tab */}
          {(!openTableEnabled || tab === "orders") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-primary-500 rounded-2xl p-4 text-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-primary-100">Today&apos;s Sales</span>
                    <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                      <TrendingUp size={16} className="text-white" />
                    </div>
                  </div>
                  <p className="text-xl font-black">{fmtRupee(todaySales)}</p>
                  <p className="text-xs text-primary-200 mt-1">{todayOrders.length} orders</p>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-400">All Time</span>
                    <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center">
                      <Banknote size={16} className="text-gray-400" />
                    </div>
                  </div>
                  <p className="text-xl font-black text-gray-900">{fmtRupee(totalSales)}</p>
                  <p className="text-xs text-gray-400 mt-1">{allOrders.length} orders</p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl shadow-sm text-xs font-semibold">
                {isSupabaseEnabled() ? (
                  <><Cloud size={14} className="text-green-500" /><span className="text-green-600">Cloud sync enabled</span></>
                ) : (
                  <><CloudOff size={14} className="text-gray-400" /><span className="text-gray-400">Offline only</span></>
                )}
              </div>

              <div className="flex rounded-2xl bg-gray-100 p-1">
                {(["today", "all"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                      filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
                    }`}
                  >
                    {f === "today" ? `Today (${todayOrders.length})` : `All (${allOrders.length})`}
                  </button>
                ))}
              </div>

              {displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                  <ShoppingBag size={48} className="mb-3" />
                  <p className="font-semibold text-gray-400">No orders yet</p>
                  <p className="text-sm mt-1">Orders will appear here after checkout</p>
                </div>
              ) : (
                displayed.map((order) => {
                  const isOpen = expanded === order.id;
                  return (
                    <div key={order.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <button
                        onClick={() => setExpanded(isOpen ? null : order.id)}
                        className="w-full flex items-center px-4 py-3 gap-3 press text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-900 text-sm">#{order.billNumber}</p>
                            {order.tableNumber && (
                              <span className="text-[10px] font-bold bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full">
                                T{order.tableNumber}
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              order.syncStatus === "synced"
                                ? "bg-green-50 text-green-600"
                                : order.syncStatus === "failed"
                                ? "bg-red-50 text-red-500"
                                : "bg-gray-100 text-gray-400"
                            }`}>
                              {order.syncStatus}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fmtTime(order.createdAt)} &middot;{" "}
                            {PAY_LABEL[order.paymentMethod] ?? order.paymentMethod} &middot;{" "}
                            {SERVICE_LABEL[order.serviceMode] ?? order.serviceMode}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-gray-900">{fmtRupee(order.totalPaise)}</p>
                          <p className="text-xs text-gray-400">
                            {order.items.length} item{order.items.length > 1 ? "s" : ""}
                          </p>
                        </div>
                        {isOpen ? (
                          <ChevronUp size={16} className="text-gray-400 shrink-0" />
                        ) : (
                          <ChevronDown size={16} className="text-gray-400 shrink-0" />
                        )}
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-50 px-4 py-3 space-y-2">
                          {order.items.map((item, i) => {
                            const ao = item.selectedAddOns.reduce((s, a) => s + a.pricePaise, 0);
                            return (
                              <div key={i} className="flex justify-between text-sm">
                                <div className="flex-1 min-w-0">
                                  <span className="font-semibold text-gray-800">
                                    {item.qty}x {item.name}
                                  </span>
                                  {item.selectedPortion && (
                                    <span className="text-gray-400 text-xs ml-1">
                                      ({item.selectedPortion})
                                    </span>
                                  )}
                                  {item.selectedAddOns.length > 0 && (
                                    <p className="text-xs text-gray-400">
                                      + {item.selectedAddOns.map((a) => a.name).join(", ")}
                                    </p>
                                  )}
                                  {item.notes && (
                                    <p className="text-xs text-primary-400 italic">-&gt; {item.notes}</p>
                                  )}
                                </div>
                                <span className="font-semibold text-gray-700 shrink-0 ml-2">
                                  {fmtRupee((item.unitPricePaise + ao) * item.qty)}
                                </span>
                              </div>
                            );
                          })}
                          <div className="border-t border-gray-100 pt-2 space-y-1 text-xs text-gray-500">
                            <div className="flex justify-between">
                              <span>Subtotal</span>
                              <span>{fmtRupee(order.subtotalPaise)}</span>
                            </div>
                            {order.discountPaise > 0 && (
                              <div className="flex justify-between text-green-600">
                                <span>Discount</span>
                                <span>-{fmtRupee(order.discountPaise)}</span>
                              </div>
                            )}
                            {order.gstPercent > 0 && (
                              <div className="flex justify-between">
                                <span>GST ({order.gstPercent}%)</span>
                                <span>{fmtRupee(order.gstPaise)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-black text-gray-900 text-sm pt-1">
                              <span>Total</span>
                              <span>{fmtRupee(order.totalPaise)}</span>
                            </div>
                            {order.changePaise != null && order.changePaise > 0 && (
                              <div className="flex justify-between">
                                <span>Change given</span>
                                <span>{fmtRupee(order.changePaise)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>

      {addingTo && (
        <AddItemsModal
          tab={addingTo}
          onClose={() => setAddingTo(null)}
          onAdd={handleAddItems}
        />
      )}

      <Modal
        open={!!closingTab && !billedOrder}
        onClose={() => setClosingTab(null)}
        title={closingTab ? `Close Table ${closingTab.tableNumber}` : ""}
      >
        {closingTab && !billedOrder && (
          <CloseTableCheckout
            tab={closingTab}
            onClose={() => setClosingTab(null)}
            onBilled={handleBilled}
          />
        )}
      </Modal>

      <Modal
        open={!!billedOrder}
        onClose={() => setBilledOrder(null)}
        title=""
      >
        {billedOrder && (
          <BillScreen
            order={billedOrder}
            onDone={() => setBilledOrder(null)}
            kotEnabled={kotEnabled}
            session={state.session}
          />
        )}
      </Modal>
    </AppShell>
  );
}
