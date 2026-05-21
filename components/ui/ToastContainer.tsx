"use client";

import { useApp } from "@/lib/store/AppContext";
import { CheckCircle2, XCircle, Info } from "lucide-react";

export default function ToastContainer() {
  const { state } = useApp();

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-[320px]">
      {state.toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold pointer-events-auto ${
            t.type === "error" ? "bg-red-600" : t.type === "info" ? "bg-blue-600" : "bg-gray-900"
          }`}
        >
          {t.type === "success" && <CheckCircle2 size={16} className="shrink-0" />}
          {t.type === "error"   && <XCircle      size={16} className="shrink-0" />}
          {t.type === "info"    && <Info          size={16} className="shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
