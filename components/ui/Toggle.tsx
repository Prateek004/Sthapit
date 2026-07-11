"use client";
import { useState } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import Toggle from "@/components/ui/Toggle";
import ItemEditModal from "@/components/menu/ItemEditModal";
import CatEditModal from "@/components/menu/CatEditModal";
import CatDeleteModal from "@/components/menu/CatDeleteModal";
import { fmtRupee } from "@/lib/utils";
import type { MenuItem, MenuCategory } from "@/lib/types";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FolderPlus } from "lucide-react";

export default function MenuPage() {
  const { state, upsertMenuItem, deleteMenuItem, upsertCategory, deleteCategory, showToast } = useApp();
  const { session, menuItems, categories } = state;
  const isOwner = session?.role === "owner";

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(categories.map((c) => c.id)));
  const [editItem, setEditItem] = useState<Partial<MenuItem> | null>(null);
  const [editCat, setEditCat] = useState<Partial<MenuCategory> | null>(null);
  const [deleteCat, setDeleteCat] = useState<MenuCategory | null>(null);
  const [catDeleteBusy, setCatDeleteBusy] = useState(false);

  const toggleCat = (id: string) =>
    setExpandedCats((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const openNewItem = (categoryId: string) =>
    setEditItem({ categoryId, isVeg: true, isAvailable: true, addOns: [], pricePaise: 0, portionEnabled: false, portions: [], sizes: [] });

  const openNewCat = () => setEditCat({ name: "", sortOrder: categories.length });

  const handleSaveItem = async (item: MenuItem) => {
    await upsertMenuItem(item);
    showToast(editItem?.id ? "Item updated" : "Item added");
    setEditItem(null);
  };

  const handleDeleteItem = async (id: string) => {
    if (!isOwner) return;
    if (!confirm("Delete this item?")) return;
    await deleteMenuItem(id);
    showToast("Item deleted");
  };

  const handleSaveCat = async (cat: MenuCategory) => {
    await upsertCategory(cat);
    showToast(editCat?.id ? "Category updated" : "Category added");
    setEditCat(null);
  };

  const handleDeleteCat = (id: string) => {
    if (!isOwner) return;
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const itemCount = menuItems.filter((i) => i.categoryId === id).length;
    if (itemCount === 0) {
      // Empty category — safe to delete with a simple confirm
      if (!confirm(`Delete category "${cat.name}"?`)) return;
      deleteCategory(id)
        .then(() => showToast("Category deleted"))
        .catch(() => showToast("Failed to delete category", "error"));
      return;
    }
    // Has items — open reassign-or-delete modal
    setDeleteCat(cat);
  };

  const handleReassignAndDelete = async (targetCatId: string) => {
    if (!deleteCat || catDeleteBusy) return;
    setCatDeleteBusy(true);
    try {
      const catItems = menuItems.filter((i) => i.categoryId === deleteCat.id);
      for (const item of catItems) {
        await upsertMenuItem({ ...item, categoryId: targetCatId });
      }
      await deleteCategory(deleteCat.id);
      showToast(`Moved ${catItems.length} item${catItems.length > 1 ? "s" : ""} & deleted category`);
      setDeleteCat(null);
    } catch {
      showToast("Failed — nothing was lost, try again", "error");
    } finally {
      setCatDeleteBusy(false);
    }
  };

  const handleDeleteCatWithItems = async () => {
    if (!deleteCat || catDeleteBusy) return;
    setCatDeleteBusy(true);
    try {
      const catItems = menuItems.filter((i) => i.categoryId === deleteCat.id);
      for (const item of catItems) {
        await deleteMenuItem(item.id);
      }
      await deleteCategory(deleteCat.id);
      showToast("Category and items deleted");
      setDeleteCat(null);
    } catch {
      showToast("Delete failed — some items may remain, retry", "error");
    } finally {
      setCatDeleteBusy(false);
    }
  };

  // A3: quick availability toggle, owner-only. Cashiers see the switch (via
  // Toggle's disabled prop) but the click handler no-ops for them as a
  // second guard — upsertMenuItem itself would also reject the write.
  const handleToggleAvailability = async (item: MenuItem) => {
    if (!isOwner) return;
    const next = !item.isAvailable;
    try {
      await upsertMenuItem({ ...item, isAvailable: next });
      showToast(next ? "Marked available" : "Marked unavailable");
    } catch {
      showToast("Failed to update availability", "error");
    }
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white px-4 lg:px-8 pt-12 lg:pt-6 pb-0 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-black text-gray-900">Menu</h1>
            {isOwner && (
              <div className="flex gap-2">
                <button onClick={openNewCat} className="flex items-center gap-1 text-sm font-bold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-xl press">
                  <FolderPlus size={15} /> Category
                </button>
                <button onClick={() => openNewItem(categories[0]?.id ?? "")} className="flex items-center gap-1.5 bg-primary-500 text-white text-sm font-bold px-3 py-2 rounded-xl press shadow-sm">
                  <Plus size={15} /> Item
                </button>
              </div>
            )}
          </div>
          <div className="pb-3" />
        </div>

        <div className="px-4 lg:px-8 py-4 space-y-3 w-full">
          {categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <span className="text-5xl mb-3">🍽️</span>
              <p className="font-semibold text-gray-400">No menu yet</p>
              {isOwner && <p className="text-sm text-gray-300 mt-1">Add a category to get started</p>}
            </div>
          ) : (
            categories.map((cat) => {
              const items = menuItems.filter((i) => i.categoryId === cat.id);
              const open = expandedCats.has(cat.id);
              return (
                <div key={cat.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="flex items-center px-4 py-3">
                    <button onClick={() => toggleCat(cat.id)} className="flex items-center gap-2 flex-1 min-w-0 press">
                      {open ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                      <span className="font-bold text-gray-900 truncate">{cat.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">{items.length}</span>
                    </button>
                    {isOwner && (
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <button onClick={() => setEditCat(cat)} className="text-gray-400 hover:text-gray-600 press p-1"><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteCat(cat.id)} className="text-red-400 hover:text-red-500 press p-1"><Trash2 size={14} /></button>
                        <button onClick={() => openNewItem(cat.id)} className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center press shadow-sm ml-1">
                          <Plus size={14} className="text-white" />
                        </button>
                      </div>
                    )}
                  </div>
                  {open && (
                    <div className="border-t border-gray-50">
                      {items.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">No items yet</p>
                      ) : (
                        items.map((item) => (
                          <div key={item.id} className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0 gap-3">
                            <span className={`w-3 h-3 rounded-sm border-2 shrink-0 flex items-center justify-center ${item.isVeg ? "border-green-600" : "border-red-500"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-500"}`} />
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-bold truncate ${!item.isAvailable ? "text-gray-400 line-through" : "text-gray-900"}`}>{item.name}</p>
                              <p className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                                <span>{fmtRupee(item.pricePaise)}</span>
                                {isOwner && item.costPricePaise ? <span className="text-gray-400">Cost: {fmtRupee(item.costPricePaise)}</span> : null}
                                {item.portionEnabled && item.portions && item.portions.length > 0 && (
                                  <span className="text-indigo-400">{item.portions.map((p) => p.label).join(" / ")}</span>
                                )}
                                {item.addOns && item.addOns.length > 0 && (
                                  <span className="text-amber-500">{item.addOns.length} add-on{item.addOns.length > 1 ? "s" : ""}</span>
                                )}
                              </p>
                            </div>
                            <Toggle value={item.isAvailable} onChange={() => handleToggleAvailability(item)} disabled={!isOwner} />
                            {isOwner && (
                              <>
                                <button onClick={() => setEditItem(item)} className="text-gray-400 hover:text-gray-600 press p-1"><Pencil size={14} /></button>
                                <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 hover:text-red-500 press p-1"><Trash2 size={14} /></button>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div className="h-4" />
        </div>
      </div>

      <ItemEditModal
        key={editItem ? (editItem.id ?? "new-item") : "closed-item"}
        item={editItem}
        categories={categories}
        onClose={() => setEditItem(null)}
        onSave={handleSaveItem}
      />
      <CatEditModal
        key={editCat ? (editCat.id ?? "new-cat") : "closed-cat"}
        cat={editCat}
        onClose={() => setEditCat(null)}
        onSave={handleSaveCat}
      />
      <CatDeleteModal
        key={deleteCat ? deleteCat.id : "closed-catdel"}
        cat={deleteCat}
        itemCount={deleteCat ? menuItems.filter((i) => i.categoryId === deleteCat.id).length : 0}
        otherCategories={deleteCat ? categories.filter((c) => c.id !== deleteCat.id) : []}
        busy={catDeleteBusy}
        onClose={() => setDeleteCat(null)}
        onReassign={handleReassignAndDelete}
        onDeleteAll={handleDeleteCatWithItems}
      />
    </AppShell>
  );
}
