"use client";

import React, { useState, useEffect } from "react";
import { Plus, Minus } from "lucide-react";

interface QtyStepperProps {
  value: number;
  onChange: (newQty: number) => void;
  min?: number;
  size?: "sm" | "md" | "lg";
  buttonStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  containerClassName?: string;
  minusBg?: string;
  plusBg?: string;
  minusColor?: string;
  plusColor?: string;
}

export default function QtyStepper({
  value,
  onChange,
  min = 0,
  size = "md",
  buttonStyle,
  inputStyle,
  containerClassName = "",
  minusBg = "white",
  plusBg = "#E8590C",
  minusColor = "#7A6456",
  plusColor = "white",
}: QtyStepperProps) {
  const [valStr, setValStr] = useState(String(value));

  useEffect(() => {
    setValStr(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Strictly disallow negative numbers or minus sign
    if (raw.includes("-")) return;

    setValStr(raw);

    if (raw === "") return;

    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= min) {
      onChange(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent typing '-', 'e', 'E', '+'
    if (e.key === "-" || e.key === "e" || e.key === "E") {
      e.preventDefault();
    }
  };

  const handleBlur = () => {
    if (valStr === "") {
      setValStr(String(value));
      return;
    }
    const parsed = parseInt(valStr, 10);
    if (isNaN(parsed) || parsed < min) {
      setValStr(String(value));
    } else {
      onChange(parsed);
    }
  };

  const btnWidth =
    size === "sm" ? "w-7 h-7" : size === "lg" ? "w-10 h-10" : "w-8 h-8";
  const iconSize = size === "sm" ? 11 : size === "lg" ? 16 : 12;
  const inputWidth = size === "lg" ? "w-10 text-base" : "w-8 text-sm";

  return (
    <div
      className={`flex items-center rounded-xl overflow-hidden border ${containerClassName}`}
      style={{ borderColor: "#F0E8DF" }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btnWidth} flex items-center justify-center press shrink-0`}
        style={{ background: minusBg, ...buttonStyle }}
      >
        <Minus size={iconSize} style={{ color: minusColor }} />
      </button>

      <input
        type="number"
        min={min}
        value={valStr}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`${inputWidth} text-center font-black outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        style={{ color: "#1A1208", ...inputStyle }}
      />

      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className={`${btnWidth} flex items-center justify-center press shrink-0`}
        style={{ background: plusBg, ...buttonStyle }}
      >
        <Plus size={iconSize} style={{ color: plusColor }} />
      </button>
    </div>
  );
}
