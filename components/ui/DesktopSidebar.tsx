"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShoppingCart,
  ClipboardList,
  Settings,
  LogOut,
  LayoutDashboard,
  LayoutGrid,
} from "lucide-react";
import { useApp } from "@/lib/store/AppContext";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/pos",       label: "POS",       Icon: ShoppingCart    },
  { href: "/tables",    label: "Tables",    Icon: LayoutGrid      },
  { href: "/orders",    label: "Orders",    Icon: ClipboardList   },
  { href: "/settings",  label: "Settings",  Icon: Settings        },
];

function S1Logo() {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        background: "#E8590C",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: 16,
          color: "white",
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        S1
      </span>
    </div>
  );
}

export default function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, logout } = useApp();

  const handleLogout = async () => {
    await logout();
    router.replace("/auth");
  };

  const initial = (state.session?.businessName ?? "S").charAt(0).toUpperCase();

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0"
      style={{ width: 220, background: "#1A1208", height: "100dvh" }}
    >
      <div
        style={{
          padding: "24px 20px",
          borderBottom: "0.5px solid rgba(255,255,255,0.07)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <S1Logo />
        <div>
          <div
            style={{
              fontSize: 13,
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              color: "white",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Sth1r
          </div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.3)",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              marginTop: 2,
            }}
          >
            by Sthappit
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 20px", borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
        <p
          style={{
            fontSize: 11,
            color: "#E8590C",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            letterSpacing: "0.04em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {(state.session?.businessName ?? "Your Business").toUpperCase()}
        </p>
        <p
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.25)",
            fontFamily: "'DM Sans', sans-serif",
            textTransform: "capitalize",
            marginTop: 2,
          }}
        >
          {state.session?.role ?? "owner"}
        </p>
      </div>

      <nav style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                fontSize: 13,
                textDecoration: "none",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: active ? 600 : 400,
                color: active ? "#E8590C" : "#7A6456",
                background: active ? "rgba(232,89,12,0.12)" : "transparent",
                borderRight: active ? "2px solid #E8590C" : "2px solid transparent",
                transition: "all 0.15s cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2.2 : 1.6}
                style={{ flexShrink: 0 }}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderTop: "0.5px solid rgba(255,255,255,0.05)",
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#2D6A4F",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 8,
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.25)",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
          }}
        >
          SYNC
        </span>
      </div>

      <div
        style={{
          padding: "16px 20px",
          borderTop: "0.5px solid rgba(255,255,255,0.07)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#7C2600",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              color: "#FEF0E8",
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {state.session?.username ?? "User"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#7A6456",
              padding: 4,
              display: "flex",
              borderRadius: 6,
              transition: "color 0.15s",
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
