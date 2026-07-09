"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "@/lib/store/AppContext";
import AppShell from "@/components/ui/AppShell";
import { fmtRupee } from "@/lib/utils";
import { dbGetAllOrders } from "@/lib/db";
import type { Order } from "@/lib/types";
import { Loader2, Lock, Users } from "lucide-react";

/**
 * G5 v1 — Staff Performance (owner-only, coaching framing per strategy doc).
 *
 * Honest scope: computed ONLY from orders that carry attribution
 * (placedByUsername), which exists only on orders created after the
 * attribution sprint deployed. Older orders are excluded and the screen
 * says so — no backfilling, no guessing who placed what.
 */

interface StaffRow {
  username: string;
  role: string;
  orders: number;
  revenuePaise: number;
  avgTicketPaise: number;
  discountPaise: number;
  discountPct: number;
  voidedCount: number;
  voidedPaise: number;
}

export default function StaffPerformancePage() {
  const { state } = useApp();
  const businessId = state.session?.businessId ?? "default";
  const isOwner = state.session?.role === "owner";

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    dbGetAllOrders(businessId).then((all) => {
      if (cancelled) return;
      setOrders(all);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, isOwner]);

  const { rows, attributedCount, unattributedCount, sinceDate } = useMemo(() => {
    const attributed = orders.filter((o) => o.placedByUsername);
    const unattributed = orders.length - attributed.length;
    const since =
      attributed.length > 0
        ? attributed.reduce(
            (min, o) => (o.createdAt < min ? o.createdAt : min),
            attributed[0].createdAt
          )
        : null;

    const byUser = new Map<string, Order[]>();
    for (const o of attributed) {
      const key = o.placedByUsername as string;
      const arr = byUser.get(key) ?? [];
      arr.push(o);
      byUser.set(key, arr);
    }

    const rows: StaffRow[] = Array.from(byUser.entries()).map(([username, list]) => {
      const completed = list.filter((o) => o.status !== "voided");
      const voided = list.filter((o) => o.status === "voided");
      const revenuePaise = completed.reduce((s, o) => s + o.totalPaise, 0);
      const subtotalPaise = completed.reduce((s, o) => s + o.subtotalPaise, 0);
      const discountPaise = completed.reduce((s, o) => s + o.discountPaise, 0);
      return {
        username,
        role: list[0].placedByRole ?? "—",
        orders: completed.length,
        revenuePaise,
        avgTicketPaise:
          completed.length > 0 ? Math.round(revenuePaise / completed.length) : 0,
        discountPaise,
        discountPct:
          subtotalPaise > 0 ? Math.round((discountPaise / subtotalPaise) * 100) : 0,
        voidedCount: voided.length,
        voidedPaise: voided.reduce((s, o) => s + o.totalPaise, 0),
      };
    });
    rows.sort((a, b) => b.revenuePaise - a.revenuePaise);
    return {
      rows,
      attributedCount: attributed.length,
      unattributedCount: unattributed,
      sinceDate: since,
    };
  }, [orders]);

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F0EB" }}>
          <Loader2 size={28} className="animate-spin" style={{ color: "#E8590C" }} />
        </div>
      </AppShell>
    );
  }

  if (!isOwner) {
    return (
      <AppShell>
        <div
          className="min-h-screen flex flex-col items-center justify-center gap-3"
          style={{ background: "#F5F0EB", color: "#5C4E47" }}
        >
          <Lock size={28} color="#A89684" />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Owner-only screen</div>
          <div style={{ fontSize: 12, color: "#9C8E87" }}>
            Staff performance is visible to the business owner.
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen" style={{ background: "#F5F0EB" }}>
        <div style={{ background: "#1C1410", padding: "48px 24px 28px" }} className="lg:pt-8">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={20} color="#F5DDD3" />
            <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>Staff Performance</div>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 6, maxWidth: 560 }}>
            Coaching insights, not surveillance — high discount or void rates usually mean a
            training gap or a missing guardrail, not bad intent.
          </div>
          {sinceDate && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
              Counting {attributedCount} attributed orders since{" "}
              {new Date(sinceDate).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {unattributedCount > 0
                ? ` · ${unattributedCount} older orders have no staff attribution and are excluded`
                : ""}
            </div>
          )}
        </div>

        <div className="px-4 lg:px-8 py-5 space-y-3" style={{ maxWidth: 860 }}>
          {rows.length === 0 ? (
            <div
              style={{
                background: "white",
                borderRadius: 16,
                border: "0.5px solid rgba(28,20,16,0.07)",
                padding: 24,
                fontSize: 13,
                color: "#5C4E47",
                lineHeight: 1.6,
              }}
            >
              No attributed orders yet. Staff attribution is recorded on every order placed
              from now on — this screen fills up automatically as billing happens.
              {unattributedCount > 0 && (
                <>
                  {" "}
                  Your {unattributedCount} existing orders were placed before attribution
                  existed, so they can&apos;t be assigned to anyone.
                </>
              )}
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.username}
                style={{
                  background: "white",
                  borderRadius: 16,
                  border: "0.5px solid rgba(28,20,16,0.07)",
                  padding: 18,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "#8B3018",
                        color: "#F5DDD3",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      {r.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#1C1410" }}>
                        {r.username}
                      </div>
                      <div style={{ fontSize: 11, color: "#9C8E87", textTransform: "capitalize" }}>
                        {r.role}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#9C8E87", letterSpacing: "0.08em" }}>REVENUE</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#1C1410" }}>
                      {fmtRupee(r.revenuePaise)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 10, marginTop: 14 }}>
                  {[
                    { label: "ORDERS", value: String(r.orders) },
                    { label: "AVG TICKET", value: fmtRupee(r.avgTicketPaise) },
                    {
                      label: "DISCOUNTS",
                      value: `${fmtRupee(r.discountPaise)} (${r.discountPct}%)`,
                      warn: r.discountPct >= 10,
                    },
                    {
                      label: "VOIDS",
                      value:
                        r.voidedCount > 0
                          ? `${r.voidedCount} (${fmtRupee(r.voidedPaise)})`
                          : "0",
                      warn: r.voidedCount > 0 && r.voidedCount / Math.max(1, r.orders) > 0.1,
                    },
                  ].map(({ label, value, warn }) => (
                    <div
                      key={label}
                      style={{
                        background: warn ? "#FDEEEE" : "#FEF9F4",
                        border: `1px solid ${warn ? "#E8B4B4" : "#F0E8DF"}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ fontSize: 9, color: "#9C8E87", letterSpacing: "0.08em" }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: warn ? "#C0392B" : "#1C1410", marginTop: 2 }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <div style={{ height: 24 }} />
        </div>
      </div>
    </AppShell>
  );
}
