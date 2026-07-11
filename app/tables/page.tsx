"use client";

import { useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/AppContext";
import { useAllTableOrders } from "@/lib/store/tableStore";
import AppShell from "@/components/ui/AppShell";
import { fmtRupee } from "@/lib/utils";
import { LayoutGrid, Clock, ClipboardList } from "lucide-react";

// ── Elapsed time helpers ──────────────────────────────────────────────────────

function elapsedMinutes(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

function formatElapsed(iso: string): string {
  const mins = elapsedMinutes(iso);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Table card ────────────────────────────────────────────────────────────────

interface TableCardProps {
  tableId: string;
  tableName: string;
  tableNumber: number;
  isOccupied: boolean;
  totalPaise: number;
  itemCount: number;
  heldAt: string | null;
  updatedAt: string;
  kotEnabled: boolean;
  kotFiredAt: string | null;
  onPress: () => void;
}

function TableCard({
  tableName,
  tableNumber,
  isOccupied,
  totalPaise,
  itemCount,
  heldAt,
  updatedAt,
  kotEnabled,
  kotFiredAt,
  onPress,
}: TableCardProps) {
  const elapsed = heldAt ? formatElapsed(heldAt) : null;
  const mins = heldAt ? elapsedMinutes(heldAt) : 0;
  const isWarning = mins >= 45;

  if (!isOccupied) {
    return (
      <button
        onClick={onPress}
        className="press flex flex-col items-center justify-center rounded-2xl border-2 border-gray-200 bg-white transition-all hover:border-primary-300 hover:shadow-card"
        style={{ minHeight: 100, padding: "16px 12px" }}
        aria-label={`${tableName} — Available`}
      >
        <span
          className="text-xl font-black leading-none mb-1"
          style={{ color: "#E8590C" }}
        >
          {tableNumber}
        </span>
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: "#A89684" }}
        >
          {tableName}
        </span>
        <span
          className="mt-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: "#F0E8DF", color: "#7A6456" }}
        >
          AVAILABLE
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onPress}
      className="press flex flex-col rounded-2xl border-2 transition-all"
      style={{
        minHeight: 100,
        padding: "14px 12px",
        background: isWarning ? "#FFF8EC" : "#FEF0E8",
        borderColor: isWarning ? "#B07D00" : "#E8590C",
      }}
      aria-label={`${tableName} — Occupied, ${fmtRupee(totalPaise)}`}
    >
      <div className="flex items-start justify-between w-full mb-auto">
        <span
          className="text-xl font-black leading-none"
          style={{ color: isWarning ? "#7A4D00" : "#E8590C" }}
        >
          {tableNumber}
        </span>
        <div className="flex flex-col items-end gap-1">
          {elapsed && (
            <span
              className="flex items-center gap-0.5 text-[10px] font-bold"
              style={{ color: isWarning ? "#B07D00" : "#B83E06" }}
            >
              <Clock size={9} />
              {elapsed}
            </span>
          )}
          {kotEnabled && (
            <span
              className="flex items-center gap-0.5 text-[9px] font-bold"
              style={{ color: kotFiredAt ? "#2D6A4F" : "#B07D00" }}
              title={kotFiredAt ? "KOT sent to kitchen" : "KOT not yet printed"}
            >
              <ClipboardList size={9} />
              {kotFiredAt ? "SENT" : "PENDING"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 w-full">
        <p
          className="text-sm font-black leading-none"
          style={{ color: isWarning ? "#7A4D00" : "#1A1208" }}
        >
          {fmtRupee(totalPaise)}
        </p>
        <p
          className="text-[10px] font-bold mt-0.5"
          style={{ color: isWarning ? "#9A6000" : "#7A6456" }}
        >
          {itemCount} item{itemCount !== 1 ? "s" : ""}
        </p>
      </div>

      <span
        className="mt-2 self-start text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
        style={{
          background: isWarning ? "#FEF0D0" : "#FEF0E8",
          color: isWarning ? "#7A4D00" : "#E8590C",
          border: `1px solid ${isWarning ? "#D4A000" : "#FACDB0"}`,
        }}
      >
        OCCUPIED
      </span>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TablesPage() {
  const { state } = useApp();
  const router = useRouter();
  const { session, isLoading } = state;
  const allTableOrders = useAllTableOrders();

  useEffect(() => {
    if (!isLoading && !session) router.replace("/auth");
  }, [isLoading, session, router]);

  const tableCount = session?.stockSettings?.tableCount ?? 10;
  const kotEnabled = session?.stockSettings?.kotEnabled ?? false;

  // Build lookup: tableId → TableOrder
  const orderByTableId = useMemo(() => {
    const map = new Map(allTableOrders.map((o) => [o.tableId, o]));
    return map;
  }, [allTableOrders]);

  const handleTablePress = useCallback(
    (tableId: string) => {
      router.push(`/tables/${tableId}`);
    },
    [router]
  );

  // Summary stats
  const occupiedCount = useMemo(
    () => allTableOrders.filter((o) => o.status === "OCCUPIED" && o.items.length > 0).length,
    [allTableOrders]
  );
  const totalOpenRevenue = useMemo(
    () =>
      allTableOrders
        .filter((o) => o.status === "OCCUPIED")
        .reduce((s, o) => s + o.totalPaise, 0),
    [allTableOrders]
  );
  const overdueCount = useMemo(
    () =>
      allTableOrders.filter(
        (o) => o.status === "OCCUPIED" && o.heldAt && elapsedMinutes(o.heldAt) >= 45
      ).length,
    [allTableOrders]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary-300 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen" style={{ background: "#FEF9F4" }}>
        {/* ── Header ── */}
        <div
          className="px-4 lg:px-8 pt-12 lg:pt-6 pb-4 border-b"
          style={{ background: "white", borderColor: "#F0E8DF" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#FEF0E8" }}
            >
              <LayoutGrid size={18} style={{ color: "#E8590C" }} />
            </div>
            <div>
              <h1
                className="text-lg font-black leading-tight"
                style={{ color: "#1A1208", letterSpacing: "-0.02em" }}
              >
                Tables
              </h1>
              <p className="text-xs font-medium" style={{ color: "#7A6456" }}>
                Tap to open or resume order
              </p>
            </div>
          </div>

          {/* Stats strip */}
          <div
            className="flex gap-0 rounded-xl overflow-hidden border"
            style={{ borderColor: "#F0E8DF" }}
          >
            <StatPill label="TOTAL" value={String(tableCount)} />
            <div style={{ width: 1, background: "#F0E8DF" }} />
            <StatPill
              label="OCCUPIED"
              value={String(occupiedCount)}
              valueColor={occupiedCount > 0 ? "#E8590C" : undefined}
            />
            <div style={{ width: 1, background: "#F0E8DF" }} />
            <StatPill label="OPEN BILL" value={fmtRupee(totalOpenRevenue)} />
            {overdueCount > 0 && (
              <>
                <div style={{ width: 1, background: "#F0E8DF" }} />
                <StatPill
                  label="OVER 45M"
                  value={String(overdueCount)}
                  valueColor="#B07D00"
                />
              </>
            )}
          </div>
        </div>

        {/* ── Table grid ── */}
        <div className="px-4 lg:px-8 py-4">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            }}
          >
            {Array.from({ length: tableCount }, (_, i) => {
              const tableNumber = i + 1;
              const tableId = `t${tableNumber}`;
              const tableName = `Table ${tableNumber}`;
              const order = orderByTableId.get(tableId);
              const isOccupied = !!order && order.status === "OCCUPIED" && order.items.length > 0;

              return (
                <TableCard
                  key={tableId}
                  tableId={tableId}
                  tableName={tableName}
                  tableNumber={tableNumber}
                  isOccupied={isOccupied}
                  totalPaise={order?.totalPaise ?? 0}
                  itemCount={order?.items.reduce((s, it) => s + it.qty, 0) ?? 0}
                  heldAt={order?.heldAt ?? null}
                  updatedAt={order?.updatedAt ?? new Date().toISOString()}
                  kotEnabled={kotEnabled}
                  kotFiredAt={order?.kotFiredAt ?? null}
                  onPress={() => handleTablePress(tableId)}
                />
              );
            })}
          </div>

          {tableCount === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <LayoutGrid size={48} style={{ color: "#E5DBCC", marginBottom: 12 }} />
              <p className="font-bold text-gray-400">No tables configured</p>
              <p className="text-sm text-gray-300 mt-1">
                Set up tables in Settings → POS Features
              </p>
            </div>
          )}
        </div>

        {/* Bottom padding for mobile nav */}
        <div className="h-6 lg:h-4" />
      </div>
    </AppShell>
  );
}

function StatPill({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-2.5 px-1">
      <span
        className="text-sm font-black leading-none"
        style={{ color: valueColor ?? "#1A1208" }}
      >
        {value}
      </span>
      <span
        className="text-[9px] font-bold uppercase tracking-wider mt-0.5"
        style={{ color: "#A89684" }}
      >
        {label}
      </span>
    </div>
  );
}
