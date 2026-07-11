"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import type { MenuCategory } from "@/lib/types";

export default function CatEditModal({
  cat,
  onClose,
  onSave,
}: {
  cat: Partial<MenuCategory> | null;
  onClose: () => void;
  onSave: (c: MenuCategory) => void;
}) {
  const [name, setName] = useState(cat?.name ?? "");
  const isNew = !cat?.id;
  return (
    <Modal open={!!cat} onClose={onClose} title={isNew ? "Add Category" : "Edit Category"}>
      <div className="px-5 pb-6 pt-2 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Category Name</label>
          <input className="bm-input" placeholder="e.g. Main Course" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <button
          onClick={() => onSave({ id: cat?.id ?? crypto.randomUUID(), name: name.trim(), sortOrder: cat?.sortOrder ?? 0 })}
          disabled={!name.trim()}
          className="w-full h-12 bg-primary-500 text-white rounded-2xl font-bold disabled:opacity-40 press shadow-md"
        >
          {isNew ? "Add Category" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
