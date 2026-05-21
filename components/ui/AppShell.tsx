"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/AppContext";
import DesktopSidebar from "./DesktopSidebar";
import BottomNav from "./BottomNav";

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#1A1208",
        gap: 16,
      }}
    >
      {/* S1 logomark */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 11,
          background: "#E8590C",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "sth1r-pulse 1.8s ease-in-out infinite",
        }}
      >
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 18,
            color: "white",
            letterSpacing: "-0.03em",
          }}
        >
          S1
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.2em",
          color: "rgba(232,89,12,0.5)",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
        }}
      >
        STH1R
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { state } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!state.isLoading && !state.session) router.replace("/auth");
  }, [state.isLoading, state.session, router]);

  if (state.isLoading) return <LoadingScreen />;

  return (
    <div style={{ height: "100dvh" }} className="flex overflow-hidden bg-[#FEF9F4]">
      {/* Sidebar — desktop only */}
      <DesktopSidebar />

      {/* Right column: content + bottom nav */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <div className="pb-16 lg:pb-0">{children}</div>
        </main>
        <div className="lg:hidden shrink-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
