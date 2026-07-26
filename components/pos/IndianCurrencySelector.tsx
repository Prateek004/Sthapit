"use client";

import React, { useState, useEffect } from "react";
import { INDIAN_NOTES, INDIAN_COINS } from "@/lib/utils";
import { Coins, Banknote, RotateCcw, Plus, Minus, X } from "lucide-react";

interface Props {
  onChange: (counts: Record<number, number>, totalRupees: number) => void;
  initialCounts?: Record<number, number>;
  targetTotalRupees?: number;
  className?: string;
}

export default function IndianCurrencySelector({
  onChange,
  initialCounts,
  targetTotalRupees,
  className = "",
}: Props) {
  const [counts, setCounts] = useState<Record<number, number>>(initialCounts ?? {});

  useEffect(() => {
    if (initialCounts) {
      setCounts(initialCounts);
    }
  }, [initialCounts]);

  const updateCount = (denom: number, delta: number) => {
    setCounts((prev) => {
      const current = prev[denom] ?? 0;
      const next = Math.max(0, current + delta);
      const updated = { ...prev };
      if (next > 0) {
        updated[denom] = next;
      } else {
        delete updated[denom];
      }

      // Calculate total
      const total = Object.entries(updated).reduce(
        (sum, [val, cnt]) => sum + Number(val) * cnt,
        0
      );
      onChange(updated, total);
      return updated;
    });
  };

  const handleClear = () => {
    setCounts({});
    onChange({}, 0);
  };

  // Calculate total tendered from notes & coins
  const totalRupees = Object.entries(counts).reduce(
    (sum, [val, cnt]) => sum + Number(val) * cnt,
    0
  );

  const activeEntries = Object.entries(counts)
    .map(([val, cnt]) => ({ value: Number(val), count: cnt }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.value - a.value);

  const hasSelections = activeEntries.length > 0;

  return (
    <div className={`flex flex-col gap-3.5 p-3.5 bg-amber-50/40 rounded-2xl border border-amber-200/60 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
          <Banknote size={15} className="text-primary-500" />
          <span>Notes & Coins Tendered</span>
        </div>
        {hasSelections && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-red-600 transition-colors press"
          >
            <RotateCcw size={12} />
            Clear
          </button>
        )}
      </div>

      {/* ── Notes Section ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1">
          <span>Notes (₹)</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {INDIAN_NOTES.map((denom) => {
            const count = counts[denom] ?? 0;
            const active = count > 0;
            return (
              <div
                key={`note-${denom}`}
                className={`relative flex items-center justify-between rounded-xl px-3 py-2.5 border transition-all ${
                  active
                    ? "bg-primary-500 text-white border-primary-600 shadow-sm"
                    : "bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:bg-orange-50/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => updateCount(denom, 1)}
                  className="flex-1 text-left press font-black text-sm flex items-center gap-1.5"
                >
                  <span className="whitespace-nowrap font-extrabold text-sm">₹{denom}</span>
                  {active && (
                    <span className="text-[11px] bg-white/25 px-1.5 py-0.5 rounded-md font-black shrink-0">
                      ×{count}
                    </span>
                  )}
                </button>
                {active && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateCount(denom, -1);
                    }}
                    className="w-6 h-6 rounded-lg bg-white text-primary-700 hover:bg-red-500 hover:text-white shadow-xs border border-white/50 flex items-center justify-center press shrink-0 ml-1.5 transition-colors"
                    title={`Decrease ₹${denom} count`}
                  >
                    <Minus size={13} strokeWidth={3.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Coins Section ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1">
          <Coins size={11} className="text-amber-500" />
          <span>Coins (₹)</span>
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {INDIAN_COINS.map((denom) => {
            const count = counts[denom] ?? 0;
            const active = count > 0;
            return (
              <div
                key={`coin-${denom}`}
                className={`relative flex items-center justify-between rounded-xl px-3 py-2.5 border transition-all ${
                  active
                    ? "bg-amber-600 text-white border-amber-700 shadow-sm"
                    : "bg-white text-gray-700 border-gray-200 hover:border-amber-300 hover:bg-amber-50/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => updateCount(denom, 1)}
                  className="flex-1 text-left press font-black text-sm flex items-center gap-1.5"
                >
                  <span className="whitespace-nowrap font-extrabold text-sm">₹{denom}</span>
                  {active && (
                    <span className="text-[11px] bg-white/25 px-1.5 py-0.5 rounded-md font-black shrink-0">
                      ×{count}
                    </span>
                  )}
                </button>
                {active && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateCount(denom, -1);
                    }}
                    className="w-6 h-6 rounded-lg bg-white text-amber-900 hover:bg-red-500 hover:text-white shadow-xs border border-white/50 flex items-center justify-center press shrink-0 ml-1.5 transition-colors"
                    title={`Decrease ₹${denom} count`}
                  >
                    <Minus size={13} strokeWidth={3.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Active Selections Breakdown Bar ── */}
      {hasSelections && (
        <div className="pt-2 border-t border-amber-200/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-gray-500">Selected:</span>
            {activeEntries.map(({ value, count }) => (
              <span
                key={value}
                className="inline-flex items-center gap-1 text-[11px] font-bold bg-white text-gray-800 border border-gray-200 px-2 py-0.5 rounded-lg shadow-2xs"
              >
                <span className="text-primary-600 font-extrabold">{count}×</span>
                <span>₹{value}</span>
                <button
                  type="button"
                  onClick={() => updateCount(value, -1)}
                  className="w-3.5 h-3.5 rounded-full hover:bg-red-100 hover:text-red-600 flex items-center justify-center text-gray-400 ml-0.5 transition-colors press"
                  title={`Remove 1 × ₹${value}`}
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
          <div className="text-xs font-black text-gray-900">
            Total: <span className="text-primary-600">₹{totalRupees}</span>
          </div>
        </div>
      )}
    </div>
  );
}
