"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  ClipboardList,
  Settings,
  Package,
  LayoutDashboard,
  LayoutGrid,
} from "lucide-react";
import { useApp } from "@/lib/store/AppContext";

const TABS = [
  { href: "/dashboard", label: "Home",     Icon: LayoutDashboard },
  { href: "/pos",       label: "POS",      Icon: ShoppingCart    },
  { href: "/tables",    label: "Tables",   Icon: LayoutGrid      },
  { href: "/orders",    label: "Orders",   Icon: ClipboardList   },
  { href: "/settings",  label: "Settings", Icon: Settings        },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { state } = useApp();
  const cartCount = state.cart.reduce((s, i) => s + i.qty, 0);

  return (
    <nav
      style={{
        width: "100%",
        background: "white",
        borderTop: "1px solid #F0E8DF",
        fontFamily: "'DM Sans', sans-serif",
      }}
      className="safe-bottom"
    >
      <div className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 8,
                paddingBottom: 8,
                gap: 2,
                position: "relative",
                color: active ? "#E8590C" : "#7A6456",
                textDecoration: "none",
                transition: "color 0.15s cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              {active && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 28,
                    height: 2.5,
                    background: "#E8590C",
                    borderRadius: "0 0 4px 4px",
                  }}
                />
              )}
              <div style={{ position: "relative" }}>
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                {href === "/pos" && cartCount > 0 && (
                  <span
                    className="badge-pop"
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -8,
                      minWidth: 16,
                      height: 16,
                      padding: "0 3px",
                      background: "#E8590C",
                      color: "white",
                      fontSize: 9,
                      fontWeight: 800,
                      borderRadius: 50,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.02em" }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
