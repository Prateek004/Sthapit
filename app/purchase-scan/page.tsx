"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { fmtRupee } from "@/lib/utils";
import { dbAddPurchase, dbGetAllRawMaterials, dbSaveRawMaterial } from "@/lib/db";
import type { PurchaseRecord, PurchaseLineItem, RawMaterial } from "@/lib/types";
import { Camera, Loader2, Lock, Trash2, CheckCircle } from "lucide-react";

/**
 * G1 — Purchase Bill Scanner UI. Photographs/uploads a vendor bill, sends it
 * to /api/scan-invoice (server-side Claude vision, owner-only, rate-limited),
 * shows the extracted lines for review/editing, then on save:
 *   1. records a PurchaseRecord (source: "ocr")
 *   2. updates raw-material stock: existing ingredient (name match) gets
 *      quantity added and its unit cost refreshed; unknown lines create a
 *      new raw material.
 * Nothing is saved until the owner reviews and taps Save — OCR output is a
 * draft, never trusted blindly.
 */

interface DraftLine {
  name: string;
  qty: string;
  unit: string;
  unitPriceRupees: string;
}

const MAX_DIM = 1600;

function downscaleToJpeg(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve({ base64: dataUrl.split(",")[1] ?? "", mediaType: "image/jpeg" });
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not read image"));
    };
    img.src = url;
  });
}

const cellStyle: React.CSSProperties = {
  height: 38,
  padding: "0 10px",
  borderRadius: 8,
  border: "1.5px solid rgba(28,20,16,0.1)",
  fontSize: 13,
  color: "#1C1410",
  outline: "none",
  background: "#FAFAFA",
  boxSizing: "border-box",
  width: "100%",
};

export default function PurchaseScanPage() {
  const { state, showToast } = useApp();
  const businessId = state.session?.businessId ?? "default";
  const isOwner = state.session?.role === "owner";

  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [billDate, setBillDate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  const handleFile = async (file: File) => {
    setScanning(true);
    setSavedMsg("");
    try {
      const { base64, mediaType } = await downscaleToJpeg(file);
      if (!base64) throw new Error("empty image");

      // Mirror SthappitChat's auth pattern: attach the Supabase session token.
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      try {
        const { getSupabase } = await import("@/lib/supabase/client");
        const sb = getSupabase();
        if (sb) {
          const {
            data: { session },
          } = await sb.auth.getSession();
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }
        }
      } catch {}

      const res = await fetch("/api/scan-invoice", {
        method: "POST",
        headers,
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data?.error ?? "Scan failed", "error");
        return;
      }

      const r = data?.result ?? {};
      const items: DraftLine[] = Array.isArray(r.items)
        ? r.items
            .filter(
              (it: { name?: unknown }) =>
                typeof it?.name === "string" && (it.name as string).trim() !== ""
            )
            .map(
              (it: {
                name: string;
                qty?: number;
                unit?: string | null;
                unitPriceRupees?: number;
              }) => ({
                name: it.name.trim(),
                qty: String(typeof it.qty === "number" && it.qty > 0 ? it.qty : 1),
                unit: typeof it.unit === "string" ? it.unit : "",
                unitPriceRupees: String(
                  typeof it.unitPriceRupees === "number" ? it.unitPriceRupees : ""
                ),
              })
            )
        : [];

      if (items.length === 0) {
        showToast("No line items found — try a sharper, straighter photo", "error");
        return;
      }
      setVendorName(typeof r.vendorName === "string" ? r.vendorName : "");
      setBillDate(typeof r.billDate === "string" ? r.billDate : "");
      setLines(items);
    } catch {
      showToast("Could not process that image", "error");
    } finally {
      setScanning(false);
    }
  };

  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const removeLine = (i: number) =>
    setLines((prev) => prev.filter((_, idx) => idx !== i));

  const validLines = lines
    .map((l) => ({
      name: l.name.trim(),
      qty: parseFloat(l.qty) || 0,
      unit: l.unit.trim(),
      unitPriceRupees: parseFloat(l.unitPriceRupees) || 0,
    }))
    .filter((l) => l.name !== "" && l.qty > 0 && l.unitPriceRupees > 0);

  const totalPaise = Math.round(
    validLines.reduce((s, l) => s + l.qty * l.unitPriceRupees * 100, 0)
  );

  const handleSave = async () => {
    if (validLines.length === 0 || saving) return;
    setSaving(true);
    try {
      const items: PurchaseLineItem[] = validLines.map((l) => ({
        name: l.name,
        qty: l.qty,
        unit: l.unit || undefined,
        unitPricePaise: Math.round(l.unitPriceRupees * 100),
        totalPaise: Math.round(l.qty * l.unitPriceRupees * 100),
      }));
      const purchase: PurchaseRecord = {
        id: crypto.randomUUID(),
        vendorName: vendorName.trim() || undefined,
        billDate: billDate.trim() || undefined,
        items,
        totalPaise,
        source: "ocr",
        createdAt: new Date().toISOString(),
      };
      await dbAddPurchase(businessId, purchase);

      // Update raw-material stock: name match (case-insensitive) adds qty and
      // refreshes cost; unknown lines create a new ingredient.
      const raws = await dbGetAllRawMaterials(businessId);
      const byName = new Map(raws.map((r) => [r.name.trim().toLowerCase(), r]));
      let updated = 0;
      let created = 0;
      for (const it of items) {
        const key = it.name.trim().toLowerCase();
        const existing = byName.get(key);
        if (existing) {
          const next: RawMaterial = {
            ...existing,
            currentStock: existing.currentStock + it.qty,
            costPaise: it.unitPricePaise,
            updatedAt: new Date().toISOString(),
          };
          await dbSaveRawMaterial(next, businessId);
          byName.set(key, next);
          updated++;
        } else {
          const fresh: RawMaterial = {
            id: crypto.randomUUID(),
            name: it.name,
            unit: it.unit || "unit",
            currentStock: it.qty,
            costPaise: it.unitPricePaise,
            updatedAt: new Date().toISOString(),
          };
          await dbSaveRawMaterial(fresh, businessId);
          byName.set(key, fresh);
          created++;
        }
      }
      setSavedMsg(
        `Saved ${fmtRupee(totalPaise)} purchase — stock updated on ${updated} ingredient(s), ${created} new ingredient(s) created.`
      );
      setLines([]);
      setVendorName("");
      setBillDate("");
      showToast("Purchase recorded ✓");
    } catch {
      showToast("Failed to save purchase", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) {
    return (
      <AppShell>
        <div
          className="min-h-screen flex flex-col items-center justify-center gap-3"
          style={{ background: "#F5F0EB", color: "#5C4E47" }}
        >
          <Lock size={28} color="#A89684" />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Owner-only screen</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen" style={{ background: "#F5F0EB" }}>
        <div style={{ background: "#1C1410", padding: "48px 24px 28px" }} className="lg:pt-8">
          <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>Scan Purchase Bill</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4, maxWidth: 560 }}>
            Photograph a vendor bill — line items are extracted for your review. Nothing is
            saved until you check the rows and tap Save. Amounts the AI can&apos;t read come
            back blank, never guessed.
          </div>
        </div>

        <div className="px-4 lg:px-8 py-5 space-y-4" style={{ maxWidth: 760 }}>
          {/* Capture */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: scanning ? "#F89E6A" : "#E8590C",
              color: "white",
              fontWeight: 700,
              fontSize: 15,
              borderRadius: 14,
              height: 52,
              cursor: scanning ? "default" : "pointer",
              boxShadow: "0 4px 14px rgba(232,89,12,0.35)",
            }}
          >
            {scanning ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            {scanning ? "Reading the bill…" : "Photograph / upload bill"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              disabled={scanning}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>

          {savedMsg && (
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                background: "#EAF5EA",
                border: "1px solid #BFE3C8",
                borderRadius: 12,
                padding: 14,
                fontSize: 13,
                color: "#1C1410",
              }}
            >
              <CheckCircle size={16} color="#3E9B5A" style={{ marginTop: 2, flexShrink: 0 }} />
              {savedMsg}
            </div>
          )}

          {/* Review */}
          {lines.length > 0 && (
            <div style={{ background: "white", borderRadius: 16, border: "0.5px solid rgba(28,20,16,0.07)", padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", marginBottom: 12 }}>
                REVIEW BEFORE SAVING · {lines.length} LINES
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#5C4E47", marginBottom: 4 }}>Vendor</div>
                  <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" style={cellStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#5C4E47", marginBottom: 4 }}>Bill date</div>
                  <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} style={cellStyle} />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {lines.map((l, i) => {
                  const qty = parseFloat(l.qty) || 0;
                  const price = parseFloat(l.unitPriceRupees) || 0;
                  const bad = l.name.trim() === "" || qty <= 0 || price <= 0;
                  return (
                    <div
                      key={i}
                      style={{
                        border: `1px solid ${bad ? "#E8B4B4" : "#F0E8DF"}`,
                        background: bad ? "#FDF7F7" : "#FEF9F4",
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          value={l.name}
                          onChange={(e) => updateLine(i, { name: e.target.value })}
                          placeholder="Item name"
                          style={{ ...cellStyle, flex: 1 }}
                        />
                        <button
                          onClick={() => removeLine(i)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
                        >
                          <Trash2 size={15} color="#C4B5A9" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3" style={{ gap: 8, marginTop: 8 }}>
                        <input
                          type="number"
                          min="0"
                          value={l.qty}
                          onChange={(e) => updateLine(i, { qty: e.target.value })}
                          placeholder="Qty"
                          style={cellStyle}
                        />
                        <input
                          value={l.unit}
                          onChange={(e) => updateLine(i, { unit: e.target.value })}
                          placeholder="Unit (kg/L/pcs)"
                          style={cellStyle}
                        />
                        <input
                          type="number"
                          min="0"
                          value={l.unitPriceRupees}
                          onChange={(e) => updateLine(i, { unitPriceRupees: e.target.value })}
                          placeholder="₹ / unit"
                          style={cellStyle}
                        />
                      </div>
                      {bad && (
                        <div style={{ fontSize: 11, color: "#C0392B", marginTop: 6 }}>
                          Needs a name, quantity and ₹/unit — or remove this line.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleSave}
                disabled={validLines.length === 0 || saving}
                style={{
                  width: "100%",
                  height: 48,
                  marginTop: 16,
                  borderRadius: 12,
                  border: "none",
                  cursor: validLines.length === 0 ? "default" : "pointer",
                  background: validLines.length === 0 ? "#F0E8DF" : "#E8590C",
                  color: validLines.length === 0 ? "#A89684" : "white",
                  fontWeight: 700,
                  fontSize: 15,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {validLines.length > 0
                  ? `Save purchase · ${validLines.length} items · ${fmtRupee(totalPaise)}`
                  : "Fix or remove invalid lines to save"}
              </button>
              <div style={{ fontSize: 11, color: "#9C8E87", marginTop: 8 }}>
                Saving adds quantities to your ingredient stock and refreshes their unit costs.
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
