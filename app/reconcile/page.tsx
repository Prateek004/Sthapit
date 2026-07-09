"use client";
import React, { useState, useMemo } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { fmtRupee } from "@/lib/utils";
import { dbGetAllOrders } from "@/lib/db";
import type { Order } from "@/lib/types";
import { Upload, Loader2, AlertTriangle, CheckCircle } from "lucide-react";

/**
 * G6 v1 — AGGREGATE settlement reconciliation (Swiggy/Zomato/any CSV).
 *
 * Honest scope: row-level order matching is NOT possible yet, because POS
 * orders do not store the aggregator's order ID. This v1 reconciles at the
 * PERIOD level, which is where most recoverable money hides:
 *   1. POS delivery revenue vs settlement GROSS  -> unrecorded/missing orders
 *   2. GROSS vs PAYOUT -> effective commission % vs what you expect
 *
 * Format-agnostic: you pick which CSV columns mean what. No format is assumed.
 */

// Minimal CSV parser that handles quoted fields and commas inside quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function toNumber(s: string): number {
  const cleaned = s.replace(/[₹,\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1.5px solid rgba(28,20,16,0.1)",
  fontSize: 14,
  color: "#1C1410",
  outline: "none",
  background: "#FAFAFA",
};

export default function ReconcilePage() {
  const { state, showToast } = useApp();
  const businessId = state.session?.businessId ?? "default";

  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [grossCol, setGrossCol] = useState<number>(-1);
  const [payoutCol, setPayoutCol] = useState<number>(-1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expectedCommission, setExpectedCommission] = useState("25");
  const [deliveryOrders, setDeliveryOrders] = useState<Order[] | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const headers = rows.length > 0 ? rows[0] : [];
  const dataRows = rows.length > 1 ? rows.slice(1) : [];

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        showToast("Could not read rows from that CSV", "error");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      setGrossCol(-1);
      setPayoutCol(-1);
    };
    reader.onerror = () => showToast("Failed to read file", "error");
    reader.readAsText(file);
  };

  const runReconcile = async () => {
    if (grossCol < 0) {
      showToast("Pick the gross-amount column first", "error");
      return;
    }
    if (!fromDate || !toDate) {
      showToast("Set the settlement period dates", "error");
      return;
    }
    setLoadingOrders(true);
    try {
      const all = await dbGetAllOrders(businessId);
      const from = fromDate; // ISO yyyy-mm-dd string compare works on createdAt prefix
      const to = toDate;
      const delivery = all.filter(
        (o) =>
          o.serviceMode === "delivery" &&
          o.status !== "voided" &&
          o.createdAt.slice(0, 10) >= from &&
          o.createdAt.slice(0, 10) <= to
      );
      setDeliveryOrders(delivery);
    } finally {
      setLoadingOrders(false);
    }
  };

  const result = useMemo(() => {
    if (!deliveryOrders || grossCol < 0) return null;
    const csvGrossPaise = Math.round(
      dataRows.reduce((s, r) => s + toNumber(r[grossCol] ?? ""), 0) * 100
    );
    const csvPayoutPaise =
      payoutCol >= 0
        ? Math.round(dataRows.reduce((s, r) => s + toNumber(r[payoutCol] ?? ""), 0) * 100)
        : null;
    const posDeliveryPaise = deliveryOrders.reduce((s, o) => s + o.totalPaise, 0);
    const gapPaise = posDeliveryPaise - csvGrossPaise;
    const effCommissionPct =
      csvPayoutPaise !== null && csvGrossPaise > 0
        ? ((csvGrossPaise - csvPayoutPaise) / csvGrossPaise) * 100
        : null;
    const expectedPct = parseFloat(expectedCommission) || 0;
    const commissionExcessPaise =
      effCommissionPct !== null && csvPayoutPaise !== null && effCommissionPct > expectedPct
        ? Math.round(csvGrossPaise * ((effCommissionPct - expectedPct) / 100))
        : 0;
    return {
      csvRowCount: dataRows.length,
      csvGrossPaise,
      csvPayoutPaise,
      posDeliveryCount: deliveryOrders.length,
      posDeliveryPaise,
      gapPaise,
      effCommissionPct,
      expectedPct,
      commissionExcessPaise,
    };
  }, [deliveryOrders, dataRows, grossCol, payoutCol, expectedCommission]);

  return (
    <AppShell>
      <div className="min-h-screen" style={{ background: "#F5F0EB" }}>
        <div style={{ background: "#1C1410", padding: "48px 24px 28px" }} className="lg:pt-8">
          <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>
            Settlement Reconciliation
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4, maxWidth: 560 }}>
            Upload a Swiggy/Zomato settlement CSV. This v1 reconciles period totals — POS
            delivery revenue vs the report&apos;s gross, and gross vs payout for your effective
            commission. Row-by-row matching needs aggregator order IDs on your bills, which
            Sth1r doesn&apos;t capture yet.
          </div>
        </div>

        <div className="px-4 lg:px-8 py-5 space-y-4" style={{ maxWidth: 760 }}>
          {/* Step 1 — upload */}
          <div style={{ background: "white", borderRadius: 16, border: "0.5px solid rgba(28,20,16,0.07)", padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", marginBottom: 10 }}>
              1 · SETTLEMENT CSV
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1.5px dashed rgba(28,20,16,0.2)",
                borderRadius: 12,
                padding: "16px 18px",
                cursor: "pointer",
                color: "#5C4E47",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Upload size={16} color="#E8590C" />
              {fileName ? `${fileName} · ${dataRows.length} rows` : "Tap to choose the CSV file"}
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </div>

          {/* Step 2 — map columns */}
          {headers.length > 0 && (
            <div style={{ background: "white", borderRadius: 16, border: "0.5px solid rgba(28,20,16,0.07)", padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", marginBottom: 10 }}>
                2 · WHICH COLUMNS MEAN WHAT
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#5C4E47", marginBottom: 6 }}>
                    Gross order amount (before commission) — required
                  </div>
                  <select
                    value={grossCol}
                    onChange={(e) => setGrossCol(Number(e.target.value))}
                    style={{ ...inputStyle, width: "100%" }}
                  >
                    <option value={-1}>— pick column —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#5C4E47", marginBottom: 6 }}>
                    Payout / net amount (after commission) — optional
                  </div>
                  <select
                    value={payoutCol}
                    onChange={(e) => setPayoutCol(Number(e.target.value))}
                    style={{ ...inputStyle, width: "100%" }}
                  >
                    <option value={-1}>— none —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — period + expected commission */}
          {headers.length > 0 && (
            <div style={{ background: "white", borderRadius: 16, border: "0.5px solid rgba(28,20,16,0.07)", padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", marginBottom: 10 }}>
                3 · SETTLEMENT PERIOD & EXPECTED COMMISSION
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#5C4E47", marginBottom: 6 }}>From</div>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#5C4E47", marginBottom: 6 }}>To</div>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#5C4E47", marginBottom: 6 }}>Expected commission %</div>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={expectedCommission}
                    onChange={(e) => setExpectedCommission(e.target.value)}
                    style={{ ...inputStyle, width: 100 }}
                  />
                </div>
                <button
                  onClick={runReconcile}
                  disabled={loadingOrders}
                  style={{
                    height: 40,
                    padding: "0 18px",
                    borderRadius: 10,
                    border: "none",
                    background: "#E8590C",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {loadingOrders && <Loader2 size={14} className="animate-spin" />}
                  Reconcile
                </button>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ background: "white", borderRadius: 16, border: "0.5px solid rgba(28,20,16,0.07)", padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9C8E87", letterSpacing: "0.06em", marginBottom: 12 }}>
                RESULT · {fromDate} → {toDate}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
                <div style={{ background: "#FEF9F4", border: "1px solid #F0E8DF", borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10, color: "#9C8E87", letterSpacing: "0.08em" }}>POS DELIVERY ORDERS</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#1C1410", marginTop: 4 }}>
                    {fmtRupee(result.posDeliveryPaise)}
                  </div>
                  <div style={{ fontSize: 11, color: "#9C8E87" }}>{result.posDeliveryCount} orders in Sth1r</div>
                </div>
                <div style={{ background: "#FEF9F4", border: "1px solid #F0E8DF", borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10, color: "#9C8E87", letterSpacing: "0.08em" }}>SETTLEMENT GROSS</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#1C1410", marginTop: 4 }}>
                    {fmtRupee(result.csvGrossPaise)}
                  </div>
                  <div style={{ fontSize: 11, color: "#9C8E87" }}>{result.csvRowCount} rows in report</div>
                </div>
              </div>

              {/* Gap */}
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  background: Math.abs(result.gapPaise) > 5000 ? "#FDEEEE" : "#EAF5EA",
                  border: `1px solid ${Math.abs(result.gapPaise) > 5000 ? "#E8B4B4" : "#BFE3C8"}`,
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                {Math.abs(result.gapPaise) > 5000 ? (
                  <AlertTriangle size={16} color="#C0392B" style={{ marginTop: 2, flexShrink: 0 }} />
                ) : (
                  <CheckCircle size={16} color="#3E9B5A" style={{ marginTop: 2, flexShrink: 0 }} />
                )}
                <div style={{ fontSize: 13, color: "#1C1410" }}>
                  <b>
                    Gap: {result.gapPaise >= 0 ? "" : "−"}
                    {fmtRupee(Math.abs(result.gapPaise))}
                  </b>{" "}
                  {result.gapPaise > 5000
                    ? "— your POS shows MORE delivery revenue than the settlement gross. Possible missing settlement rows, disputed/refunded orders, or the report covers fewer days."
                    : result.gapPaise < -5000
                    ? "— the settlement gross is HIGHER than POS delivery revenue. Possible orders billed on the aggregator app but never entered in Sth1r — that also means unpaid GST liability."
                    : "— period totals match within ₹50. Clean."}
                </div>
              </div>

              {/* Commission */}
              {result.effCommissionPct !== null && (
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    background: result.commissionExcessPaise > 0 ? "#FDEEEE" : "#EAF5EA",
                    border: `1px solid ${result.commissionExcessPaise > 0 ? "#E8B4B4" : "#BFE3C8"}`,
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  {result.commissionExcessPaise > 0 ? (
                    <AlertTriangle size={16} color="#C0392B" style={{ marginTop: 2, flexShrink: 0 }} />
                  ) : (
                    <CheckCircle size={16} color="#3E9B5A" style={{ marginTop: 2, flexShrink: 0 }} />
                  )}
                  <div style={{ fontSize: 13, color: "#1C1410" }}>
                    <b>Effective commission: {result.effCommissionPct.toFixed(1)}%</b> (you
                    expected {result.expectedPct}%).{" "}
                    {result.commissionExcessPaise > 0
                      ? `That's ${fmtRupee(result.commissionExcessPaise)} more than expected this period — check for ad charges, penalty deductions, or a changed commission slab in the report.`
                      : "Within your expected rate."}
                  </div>
                </div>
              )}

              {result.csvPayoutPaise === null && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#9C8E87" }}>
                  Tip: also map the payout/net column to see your effective commission rate.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
