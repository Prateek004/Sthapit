"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/lib/store/AppContext";
import DesktopSidebar from "./DesktopSidebar";
import BottomNav from "./BottomNav";
import { Lock } from "lucide-react";

// Pages only an owner can visit. Cashiers are redirected to /pos.
const OWNER_ONLY_PATHS = ["/dashboard", "/stock", "/settings", "/stats", "/menu", "/ai-dashboard"];

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

// P1-02: Inactivity lock overlay — PIN entry
function LockScreen() {
  const { state, unlockSession, logout } = useApp();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const FIRE = "#E8590C";

  const handleDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      const savedPin = typeof window !== "undefined" ? localStorage.getItem("sth1r_pin") : null;
      if (!savedPin || next === savedPin) {
        unlockSession();
        setPin("");
      } else {
        setError(true);
        setTimeout(() => setPin(""), 500);
      }
    }
  };

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#1A1208",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 32,
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: FIRE, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Lock size={22} color="white" />
        </div>
        <p style={{ color: "white", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16 }}>
          Session locked
        </p>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
          Enter PIN to continue as {state.session?.username}
        </p>
      </div>

      {/* PIN dots */}
      <div style={{ display: "flex", gap: 12 }}>
        {[0,1,2,3].map((i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: "50%",
            background: pin.length > i ? (error ? "#ef4444" : FIRE) : "rgba(255,255,255,0.2)",
            transition: "background 0.15s",
          }} />
        ))}
      </div>

      {/* Numpad */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 10 }}>
        {digits.map((d, i) => (
          d === "" ? <div key={i} /> :
          <button key={i} onClick={() => d === "⌫" ? (setPin(p => p.slice(0,-1)), setError(false)) : handleDigit(d)}
            style={{
              height: 64, borderRadius: 12,
              background: d === "⌫" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
              border: "none", color: "white",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 20,
              cursor: "pointer",
            }}
          >{d}</button>
        ))}
      </div>

      <button
        onClick={logout}
        style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
      >
        Sign out instead
      </button>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { state } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.isLoading) return;

    // Not logged in → go to auth
    if (!state.session) {
      router.replace("/auth");
      return;
    }

    // Cashier trying to access an owner-only page → redirect to POS
    if (state.session.role === "cashier") {
      const blocked = OWNER_ONLY_PATHS.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );
      if (blocked) {
        router.replace("/pos");
      }
    }
  }, [state.isLoading, state.session, pathname, router]);

  if (state.isLoading) return <LoadingScreen />;

  return (
    <>
      {/* P1-02: inactivity lock overlay */}
      {state.isLocked && <LockScreen />}

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
    </>
  );
}
