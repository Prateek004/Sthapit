"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  fullScreen?: boolean;
}

export default function Modal({ open, onClose, title, children, fullScreen }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    const count = Number(document.body.dataset.modalCount ?? 0) + 1;
    document.body.dataset.modalCount = String(count);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      const next = Number(document.body.dataset.modalCount ?? 1) - 1;
      document.body.dataset.modalCount = String(next);
      if (next === 0) document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white z-10 w-full slide-up flex flex-col overflow-hidden ${fullScreen ? "h-[100dvh]" : "rounded-t-3xl max-h-[92dvh] md:rounded-3xl md:max-w-lg"}`}>
        {!fullScreen && (
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>
        )}
        {title !== undefined && title !== "" && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center press">
              <X size={15} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
