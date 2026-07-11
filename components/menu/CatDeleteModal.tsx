"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import type { MenuCategory } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

export default function CatDeleteModal({
  cat,
  itemCount,
  otherCategories,
  busy,
  onClose,
  onReassign,
  onDeleteAll,
}: {
  cat: MenuCategory | null;
  itemCount: number;
  otherCategories: MenuCategory[];
  busy: boolean;
  onClose: () => void;
  onReassign: (targetCatId: string) => void;
  onDeleteAll: () => void;
}) {
  const [targetId, setTargetId] = useState(otherCategories[0]?.id ?? "");
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const canReassign = otherCategories.length > 0;

  return (
    <Modal open={!!cat} onClose={busy ? () => {} : onClose} title={`Delete "${cat?.name ?? ""}"?`}>
      <div className="px-5 pb-6 pt-2 space-y-4">
        <div className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-xl p-3">
          <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-700">
            This category has <b>{itemCount} item{itemCount > 1 ? "s" : ""}</b>. Choose what happens to them.
          </p>
        </div>

        {canReassign && (
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <p className="text-sm font-bold text-gray-700">Move items to another category</p>
            <select className="bm-input" value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy}>
              {otherCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => targetId && onReassign(targetId)}
              disabled={busy || !targetId}
              className="w-full h-11 bg-primary-500 text-white rounded-xl font-bold press shadow-sm disabled:opacity-40"
            >
              {busy ? "Working..." : "Move items & delete category"}
            </button>
          </div>
        )}

        <div className="bg-red-50 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-red-700">Delete category and all {itemCount} item{itemCount > 1 ? "s" : ""}</p>
          <p className="text-xs text-red-500">This cannot be undone. Items will be removed from the menu permanently.</p>
          {!confirmDeleteAll ? (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              disabled={busy}
              className="w-full h-11 border-2 border-red-200 text-red-600 rounded-xl font-bold press disabled:opacity-40"
            >
              Delete everything
            </button>
          ) : (
            <button
              onClick={onDeleteAll}
              disabled={busy}
              className="w-full h-11 bg-red-500 text-white rounded-xl font-bold press shadow-sm disabled:opacity-40"
            >
              {busy ? "Deleting..." : "Yes, permanently delete all"}
            </button>
          )}
        </div>

        <button onClick={onClose} disabled={busy} className="w-full h-11 text-gray-500 font-bold press disabled:opacity-40">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
