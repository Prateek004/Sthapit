"use client";

export type DietFilterValue = "all" | "veg" | "non-veg";

interface DietFilterProps {
  value: DietFilterValue;
  onChange: (value: DietFilterValue) => void;
  className?: string;
}

export default function DietFilter({
  value,
  onChange,
  className = "",
}: DietFilterProps) {
  return (
    <div
      className={`flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl border border-gray-200/60 shrink-0 ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all press ${
          value === "all"
            ? "bg-gray-900 text-white shadow-xs"
            : "text-gray-600 hover:bg-gray-200/60"
        }`}
      >
        All
      </button>
      <button
        type="button"
        onClick={() => onChange("veg")}
        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all press flex items-center gap-1.5 ${
          value === "veg"
            ? "bg-emerald-600 text-white shadow-xs"
            : "text-emerald-700 hover:bg-emerald-100/60"
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block border border-white shrink-0" />
        Veg
      </button>
      <button
        type="button"
        onClick={() => onChange("non-veg")}
        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all press flex items-center gap-1.5 ${
          value === "non-veg"
            ? "bg-rose-600 text-white shadow-xs"
            : "text-rose-700 hover:bg-rose-100/60"
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-rose-500 inline-block border border-white shrink-0" />
        Non-Veg
      </button>
    </div>
  );
}
