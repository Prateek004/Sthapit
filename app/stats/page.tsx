"use client";
import { useState, useEffect } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { fmtRupee, todayStr, PAY_LABEL } from "@/lib/utils";
import type { Order } from "@/lib/types";
import { TrendingUp, Banknote, ShoppingBag, Smartphone } from "lucide-react";

export default function StatsPage() {
  const { state } = useApp();
  const uid = state.session?.userId ?? "default";
  const [allOrders, setAllOrders] = useState<Order[]>([]);

  useEffect(() => {
    import("@/lib/db").then(({ dbGetAllOrders }) => dbGetAllOrders(uid).then(setAllOrders));
  }, [state.orders, uid]);

  const today = todayStr();
  const todayOrders = allOrders.filter((o) => o.createdAt.startsWith(today));
  const todaySales = todayOrders.reduce((s, o) => s + o.totalPaise, 0);
  const totalSales = allOrders.reduce((s, o) => s + o.totalPaise, 0);
  const avgOrder = allOrders.length > 0 ? Math.round(totalSales / allOrders.length) : 0;

  const byMethod = allOrders.reduce<Record<string, number>>((acc, o) => {
    acc[o.paymentMethod] = (acc[o.paymentMethod] ?? 0) + o.totalPaise;
    return acc;
  }, {});

  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  allOrders.forEach((o) => o.items.forEach((i) => {
    // FIX: unitPricePaise already includes add-on price (set in ItemConfigModal).
    // Using it directly was correct — but we must NOT add add-ons again here.
    // The line total per item for stats purposes is simply unitPricePaise * qty.
    const line = i.unitPricePaise * i.qty;
    if (!itemMap[i.menuItemId]) itemMap[i.menuItemId] = { name: i.name, qty: 0, revenue: 0 };
    itemMap[i.menuItemId].qty += i.qty;
    itemMap[i.menuItemId].revenue += line;
  }));
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <AppShell>
      <div className="flex flex-col min-h-screen bg-gray-50">
        <div className="bg-white px-4 pt-12 lg:pt-5 pb-4 shadow-sm">
          <h1 className="text-xl font-black text-gray-900">Stats</h1>
          <p className="text-xs text-gray-400 mt-0.5">Business performance</p>
        </div>

        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary-500 rounded-2xl p-4 text-white col-span-2">
              <p className="text-xs font-bold text-primary-100 mb-1">Today&apos;s Revenue</p>
              <p className="text-3xl font-black">{fmtRupee(todaySales)}</p>
              <p className="text-xs text-primary-200 mt-1">{todayOrders.length} orders today</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-400 mb-1">Total Revenue</p>
              <p className="text-xl font-black text-gray-900">{fmtRupee(totalSales)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{allOrders.length} orders</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-400 mb-1">Avg. Order</p>
              <p className="text-xl font-black text-gray-900">{fmtRupee(avgOrder)}</p>
              <p className="text-xs text-gray-400 mt-0.5">per transaction</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-900 mb-3">Payment Methods</p>
            <div className="space-y-2">
              {Object.entries(byMethod).map(([m, paise]) => (
                <div key={m} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    {m === "cash" && <Banknote size={15} className="text-gray-600" />}
                    {m === "upi" && <Smartphone size={15} className="text-blue-500" />}
                    {m === "split" && <TrendingUp size={15} className="text-purple-500" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-semibold text-gray-700">{PAY_LABEL[m] ?? m}</span>
                      <span className="font-bold text-gray-900">{fmtRupee(paise)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full"
                        style={{ width: `${totalSales > 0 ? (paise / totalSales) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              {Object.keys(byMethod).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No data yet</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-900 mb-3">Top Items by Revenue</p>
            <div className="space-y-2">
              {topItems.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No sales data yet</p>}
              {topItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 text-xs font-black text-gray-400">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.qty} sold</p>
                  </div>
                  <span className="text-sm font-black text-primary-500">{fmtRupee(item.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
