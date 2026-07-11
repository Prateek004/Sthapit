"use client";

interface ToggleProps {
  /** Omit to render a bare switch with no label row (e.g. inline in a list row) */
  label?: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ label, desc, value, onChange, disabled }: ToggleProps) {
  const switchButton = (
    <button
      type="button"
      onClick={() => onChange(!value)}
      disabled={disabled}
      aria-pressed={value}
      aria-label={label ?? (value ? "Available" : "Unavailable")}
      className={`shrink-0 w-11 h-6 rounded-full relative transition-colors press ${value ? "bg-primary-500" : "bg-gray-200"} ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? "left-6" : "left-1"}`} />
    </button>
  );

  if (label === undefined) return switchButton;

  return (
    <div className={`flex items-center justify-between gap-3 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        {desc && <p className="text-xs text-gray-400">{desc}</p>}
      </div>
      {switchButton}
    </div>
  );
}
