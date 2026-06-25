"use client";
import React, { useEffect, useMemo, useState } from "react";
import type { Leak } from "@/components/ai/LeakEngine";
import { fmtRupee, todayStr } from "@/lib/utils";
import { dbGetLeakActions, dbSetLeakAction } from "@/lib/db";
import type { LeakActionStatus } from "@/lib/types";
import { AlertTriangle, TrendingDown, Package, Clock, CheckCircle } from "lucide-react";

interface Props {
  leaks: Leak[];
  businessId: string;
}

function leakIcon(type: Leak["type"]) {
  switch (type) {
    case "discount_anomaly":
    case "refund_no_pin":
      return AlertTriangle;
    case "aggregator_mismatch":
      return TrendingDown;
    case "low_stock":
    case "high_void_rate":
      return Package;
    default:
      return AlertTriangle;
  }
}

function ConfidencePill({ confidence }: { confidence: "Confirmed" | "Estimated" }) {
  if (confidence === "Confirmed") {
    return (
      <span
        style={{
          background: "#0D2B1A",
          border: "1px solid #00C896",
          color: "#00C896",
          fontSize: 10,
          fontWeight: 700,
          padding: "3px 8px",
          borderRadius: 999,
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
      >
        ● CONFIRMED
      </span>
    );
  }
  return (
    <span
      style={{
        background: "#2B260D",
        border: "1px solid #D4B106",
        color: "#D4B106",
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 999,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      ● ESTIMATED
    </span>
  );
}

function StatusPill({ status }: { status: LeakActionStatus }) {
  if (status === "resolved") {
    return (
      <span
        style={{
          background: "#0D2B1A",
          border: "1px solid #00C896",
          color: "#00C896",
          fontSize: 10,
          fontWeight: 700,
          padding: "3px 8px",
          borderRadius: 999,
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
      >
        ● RESOLVED
      </span>
    );
  }
  return (
    <span
      style={{
        background: "#1C2D24",
        border: "1px solid #2A3D30",
        color: "#6B8F7A",
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 999,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      ● SNOOZED
    </span>
  );
}

export default function LeaksPanel({ leaks, businessId }: Props) {
  const [actions, setActions] = useState<Record<string, LeakActionStatus>>({});
  const today = todayStr();

  // Scope the stored key by day so a resolved leak from yesterday never
  // suppresses a freshly detected leak of the same type today.
  const scopedId = (leakId: string) => `${today}:${leakId}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const stored = await dbGetLeakActions(businessId);
      if (cancelled) return;
      const map: Record<string, LeakActionStatus> = {};
      for (const a of stored) {
        map[a.id] = a.status;
      }
      setActions(map);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const setAction = async (leakId: string, status: LeakActionStatus) => {
    const key = scopedId(leakId);
    setActions((prev) => ({ ...prev, [key]: status }));
    await dbSetLeakAction(businessId, key, status);
  };

  const activeLeaks = useMemo(
    () => leaks.filter((l) => actions[scopedId(l.id)] !== "resolved"),
    [leaks, actions, today]
  );

  const topLeak = activeLeaks.length > 0 ? activeLeaks[0] : null;
  const totalLeakPaise = leaks.reduce((s, l) => s + l.impactPaise, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Next Best Action */}
      {topLeak && (
        <div
          style={{
            background: "#1C2D24",
            border: "1px solid #00C896",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  background: "#00C896",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={12} color="#0A1A0F" />
              </div>
              <span style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                // NEXT BEST ACTION
              </span>
              <ConfidencePill confidence={topLeak.confidence} />
              <span style={{ fontSize: 11, color: "#4A6A58", display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={11} /> ~3 min effort
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                RECOVER / WEEK
              </div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 32, color: "white" }}>
                {fmtRupee(topLeak.impactPaise)}
              </div>
            </div>
          </div>

          <div style={{ color: "white", fontSize: 24, fontWeight: 700, marginTop: 16 }}>{topLeak.title}</div>
          <div style={{ color: "#6B8F7A", fontSize: 14, marginTop: 8 }}>{topLeak.why}</div>

          <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
            <button
              onClick={() => setAction(topLeak.id, "resolved")}
              style={{
                background: "#00C896",
                color: "#0A1A0F",
                fontWeight: 700,
                padding: "12px 20px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Act on this →
            </button>
            <button
              style={{
                background: "transparent",
                border: "1px solid #2A3D30",
                color: "#6B8F7A",
                padding: "12px 20px",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              SEE ALL LEAKS
            </button>
          </div>
        </div>
      )}

      {!topLeak && leaks.length > 0 && (
        <div
          style={{
            background: "#1C2D24",
            border: "1px solid #00C896",
            borderRadius: 16,
            padding: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <CheckCircle size={20} color="#00C896" />
          <div style={{ color: "#A8C4B0", fontSize: 14 }}>
            All of today&apos;s leaks are resolved or snoozed. Nice work.
          </div>
        </div>
      )}

      {leaks.length === 0 && (
        <div
          style={{
            background: "#1C2D24",
            border: "1px solid #2A3D30",
            borderRadius: 12,
            padding: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <CheckCircle size={20} color="#00C896" />
          <div style={{ color: "#A8C4B0", fontSize: 14 }}>
            No leaks detected today. Profit looks clean — keep it that way.
          </div>
        </div>
      )}

      {/* Profit Leak Ledger */}
      {leaks.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                // PROFIT LEAK LEDGER
              </div>
              <div style={{ color: "white", fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                Ranked by recoverable rupees
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase" }}>TOTAL IMPACT</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: "white" }}>
                {fmtRupee(totalLeakPaise)}
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#1C2D24",
              border: "1px solid #2A3D30",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {leaks.map((leak, idx) => {
              const Icon = leakIcon(leak.type);
              const status = actions[scopedId(leak.id)];
              return (
                <div
                  key={leak.id}
                  style={{
                    padding: "16px 20px",
                    borderBottom: idx === leaks.length - 1 ? "none" : "1px solid #2A3D30",
                    opacity: status === "resolved" ? 0.55 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Icon size={16} color="#EF4444" />
                      <span style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {leak.type.replace(/_/g, " ")}
                      </span>
                      <ConfidencePill confidence={leak.confidence} />
                      {status && <StatusPill status={status} />}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase" }}>IMPACT</div>
                      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: "#EF4444" }}>
                        {fmtRupee(leak.impactPaise)}
                      </div>
                    </div>
                  </div>

                  <div style={{ color: "white", fontSize: 15, fontWeight: 600, marginTop: 4 }}>{leak.title}</div>

                  <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 16, marginTop: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase" }}>WHY</div>
                      <div style={{ color: "#A8C4B0", fontSize: 13, marginTop: 2 }}>{leak.why}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#4A6A58", textTransform: "uppercase" }}>NEXT ACTION</div>
                      <div style={{ color: "#A8C4B0", fontSize: 13, marginTop: 2 }}>{leak.nextAction}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => setAction(leak.id, "resolved")}
                      disabled={status === "resolved"}
                      style={{
                        background: "#0D2B1A",
                        border: "1px solid #00C896",
                        color: "#00C896",
                        padding: "6px 14px",
                        borderRadius: 8,
                        fontSize: 12,
                        cursor: status === "resolved" ? "default" : "pointer",
                        opacity: status === "resolved" ? 0.6 : 1,
                      }}
                    >
                      ✓ Resolve
                    </button>
                    <button
                      onClick={() => setAction(leak.id, "snoozed")}
                      disabled={status === "snoozed"}
                      style={{
                        background: "transparent",
                        border: "1px solid #2A3D30",
                        color: "#4A6A58",
                        padding: "6px 14px",
                        borderRadius: 8,
                        fontSize: 12,
                        cursor: status === "snoozed" ? "default" : "pointer",
                        opacity: status === "snoozed" ? 0.6 : 1,
                      }}
                    >
                      ⏸ Snooze
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
