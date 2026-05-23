"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, Eye, EyeOff, Loader2, Store, ChevronDown } from "lucide-react";
import { signIn, signUp } from "@/lib/supabase/auth";
import { useApp } from "@/lib/store/AppContext";
import { HIDE_FRANCHISE } from "@/lib/utils";
import type { UserRole, BusinessType } from "@/lib/types";

type Mode = "signin" | "signup";

const BIZ_TYPES = [
  { value: "cafe",       label: "Cafe ☕"       },
  { value: "restaurant", label: "Restaurant 🍛" },
  { value: "food_truck", label: "Food Truck 🚚" },
  { value: "kiosk",      label: "Kiosk 🏪"      },
  { value: "bakery",     label: "Bakery 🥐"     },
  { value: "franchise",  label: "Franchise 🏬"  },
].filter((b) => !(HIDE_FRANCHISE && b.value === "franchise"));

const FIRE   = "#E8590C";
const FIRE6  = "#B83E06";
const FIRE50 = "#FEF0E8";
const COAL   = "#1A1208";
const SMOKE  = "#3D2E1E";
const ASH    = "#7A6456";
const SAND   = "#FDF6EE";
const EMBER  = "#F0E8DF";
const WHITE  = "#FFFFFF";

// Returns seconds if Supabase gives us a timed rate-limit, otherwise null
function parseRateLimitSeconds(msg: string): number | null {
  const m = msg.match(/after\s+(\d+)\s+second/i);
  return m ? parseInt(m[1], 10) : null;
}

// Any Supabase message that means "slow down" — normalise them all
function isRateLimitMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("too many") ||
    lower.includes("security purposes") ||
    lower.includes("email rate limit") ||
    lower.includes("exceeded")
  );
}

function Field({
  icon, placeholder, value, onChange, type = "text", right, onKeyDown,
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  right?: React.ReactNode;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute", left: 16, top: "50%",
          transform: "translateY(-50%)", color: ASH,
          pointerEvents: "none", display: "flex",
        }}
      >
        {icon}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoCapitalize="none"
        autoCorrect="off"
        style={{
          width: "100%", height: 48,
          paddingLeft: 44, paddingRight: right ? 48 : 16,
          borderRadius: 50,
          border: `1px solid ${EMBER}`,
          background: SAND,
          fontSize: 14,
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
          color: COAL,
          outline: "none",
        }}
        onFocus={(e) => {
          e.target.style.border = `1.5px solid ${FIRE}`;
          e.target.style.background = WHITE;
        }}
        onBlur={(e) => {
          e.target.style.border = `1px solid ${EMBER}`;
          e.target.style.background = SAND;
        }}
      />
      {right && (
        <div
          style={{
            position: "absolute", right: 14, top: "50%",
            transform: "translateY(-50%)", display: "flex",
          }}
        >
          {right}
        </div>
      )}
    </div>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const { login, loadMenuFromTemplate } = useApp();
  const [mode, setMode]                   = useState<Mode>("signin");
  const [username, setUsername]           = useState("");
  const [password, setPassword]           = useState("");
  const [showPwd, setShowPwd]             = useState(false);
  const [role, setRole]                   = useState<UserRole>("owner");
  const [businessName, setBusinessName]   = useState("");
  const [ownerName, setOwnerName]         = useState("");
  const [bizType, setBizType]             = useState("restaurant");
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [rateLimitSecs, setRateLimitSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (rateLimitSecs <= 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => {
      setRateLimitSecs((s) => {
        if (s <= 1) { setError(""); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [rateLimitSecs]);

  const handleRateLimitError = (msg: string) => {
    const secs = parseRateLimitSeconds(msg);
    if (secs) {
      // Supabase told us exactly how long to wait
      setRateLimitSecs(secs);
      setError("rate_limited");
    } else if (isRateLimitMessage(msg)) {
      // Generic rate-limit (e.g. "email rate limit exceeded") — use 60s cooldown
      setRateLimitSecs(60);
      setError("rate_limited");
    } else {
      setError(msg);
    }
  };

  const handleSubmit = async () => {
    if (rateLimitSecs > 0) return;
    setError("");
    if (!username.trim() || password.length < 6) {
      setError("Username required · password ≥ 6 characters");
      return;
    }
    if (mode === "signup" && !businessName.trim()) {
      setError("Business name required");
      return;
    }
    setLoading(true);

    if (mode === "signup") {
      const result = await signUp({ username, password, role, businessName, ownerName, businessType: bizType });
      if (!result.ok) { handleRateLimitError(result.error ?? "Signup failed"); setLoading(false); return; }
      const loginResult = await signIn(username, password);
      if (!loginResult.ok) { setError("Account created! Please sign in."); setLoading(false); setMode("signin"); return; }
      const uid = loginResult.userId ?? `local_${username}`;
      await login({ userId: uid, username, role, businessName, businessType: bizType as BusinessType, gstPercent: 5 });
      await loadMenuFromTemplate(bizType, uid);
    } else {
      const result = await signIn(username, password);
      if (!result.ok) { handleRateLimitError(result.error ?? "Sign in failed"); setLoading(false); return; }
      const uid = result.userId ?? `local_${username}`;
      await login({
        userId: uid, username,
        role: result.role ?? "cashier" as UserRole,
        businessName: result.businessName ?? "",
        businessType: (result.businessType ?? "restaurant") as BusinessType,
        gstPercent: result.gstPercent ?? 5,
        upiId: result.upiId,
      });
      await loadMenuFromTemplate(result.businessType ?? "restaurant", uid);
    }
    router.replace("/pos");
  };

  const isRateLimited = rateLimitSecs > 0;

  return (
    <div style={{ minHeight: "100vh", background: COAL, display: "flex" }}>

      {/* ── Left brand panel (desktop only) ── */}
      <div
        className="auth-left"
        style={{
          display: "none",
          width: 340, flexShrink: 0,
          background: "#110D06",
          borderRight: "0.5px solid rgba(255,255,255,0.06)",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 40px",
        }}
      >
        <div>
          <div
            style={{
              width: 48, height: 48,
              borderRadius: 11,
              background: FIRE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800,
                fontSize: 20,
                color: "white",
                letterSpacing: "-0.03em",
              }}
            >
              S1
            </span>
          </div>
          <div
            style={{
              marginTop: 14,
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 20,
              color: "white",
              letterSpacing: "-0.03em",
            }}
          >
            Sth1r
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.3)",
              fontFamily: "'DM Sans', sans-serif",
              marginTop: 3,
            }}
          >
            by Sthappit
          </div>
        </div>
        <div>
          <p
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: "italic",
              fontSize: 24,
              color: "white",
              lineHeight: 1.5,
              fontWeight: 400,
            }}
          >
            Billing that works<br />even offline.
          </p>
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.3)",
              marginTop: 14,
              lineHeight: 1.7,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Built for Indian F&amp;B · GST-ready · Offline-first
          </p>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "40px 20px", overflowY: "auto",
        }}
      >
        {/* Mobile logo */}
        <div
          className="auth-mobile-logo"
          style={{ marginBottom: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <div
            style={{
              width: 56, height: 56,
              borderRadius: 14,
              background: FIRE,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800, fontSize: 22, color: "white", letterSpacing: "-0.03em",
              }}
            >
              S1
            </span>
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: "white", letterSpacing: "-0.02em" }}>
            Sth1r
          </div>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif" }}>
            by Sthappit
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            width: "100%", maxWidth: 420,
            background: WHITE,
            borderRadius: 20,
            border: `1px solid ${EMBER}`,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(26,18,8,0.10)",
          }}
        >
          {/* Mode tabs */}
          <div style={{ display: "flex", borderBottom: `1px solid ${EMBER}` }}>
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); setRateLimitSecs(0); }}
                style={{
                  flex: 1, padding: "16px 0",
                  fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.08em",
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  color: mode === m ? FIRE6 : ASH,
                  borderBottom: mode === m ? `2px solid ${FIRE}` : "2px solid transparent",
                  transition: "all 0.15s",
                  marginBottom: -1,
                }}
              >
                {m === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
              </button>
            ))}
          </div>

          {/* Form body */}
          <div style={{ padding: "28px 28px 32px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>

              <Field
                icon={<User size={15} />}
                placeholder="Username"
                value={username}
                onChange={setUsername}
              />

              <Field
                icon={<Lock size={15} />}
                placeholder="Password"
                value={password}
                onChange={setPassword}
                type={showPwd ? "text" : "password"}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                right={
                  <button
                    onClick={() => setShowPwd((p) => !p)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: ASH, display: "flex", padding: 0 }}
                  >
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />

              {mode === "signup" && (
                <>
                  <Field
                    icon={<Store size={15} />}
                    placeholder="Business Name *"
                    value={businessName}
                    onChange={setBusinessName}
                  />
                  <Field
                    icon={<User size={15} />}
                    placeholder="Owner Name"
                    value={ownerName}
                    onChange={setOwnerName}
                  />

                  {/* Business type */}
                  <div style={{ position: "relative" }}>
                    <Store
                      size={15}
                      style={{
                        position: "absolute", left: 16, top: "50%",
                        transform: "translateY(-50%)", color: ASH, pointerEvents: "none",
                      }}
                    />
                    <select
                      value={bizType}
                      onChange={(e) => setBizType(e.target.value)}
                      style={{
                        width: "100%", height: 48,
                        paddingLeft: 44, paddingRight: 36,
                        borderRadius: 50,
                        border: `1px solid ${EMBER}`,
                        background: SAND,
                        fontSize: 14, color: COAL,
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 500,
                        outline: "none",
                        appearance: "none",
                        cursor: "pointer",
                      }}
                    >
                      {BIZ_TYPES.map((b) => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                      ))}
                    </select>
                    <ChevronDown
                      size={15}
                      style={{
                        position: "absolute", right: 16, top: "50%",
                        transform: "translateY(-50%)", color: ASH, pointerEvents: "none",
                      }}
                    />
                  </div>

                  {/* Role pills */}
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: "0.1em", color: ASH, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, marginBottom: 8 }}>
                      ROLE
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["owner", "cashier"] as UserRole[]).map((r) => (
                        <button
                          key={r}
                          onClick={() => setRole(r)}
                          style={{
                            flex: 1, padding: "10px 0",
                            borderRadius: 50, fontSize: 12, fontWeight: 600,
                            letterSpacing: "0.04em", textTransform: "capitalize",
                            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                            border: `1px solid ${role === r ? FIRE : EMBER}`,
                            color: role === r ? FIRE6 : ASH,
                            background: role === r ? FIRE50 : WHITE,
                            transition: "all 0.15s",
                          }}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Error / rate-limit banner */}
            {error && (
              <div
                style={{
                  fontSize: 12, color: FIRE6,
                  background: FIRE50, borderRadius: 12,
                  padding: "10px 14px", marginBottom: 16,
                  border: `1px solid rgba(184,62,6,0.15)`,
                  fontFamily: "'DM Sans', sans-serif",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}
              >
                <span>
                  {isRateLimited ? "Too many attempts — please wait:" : error}
                </span>
                {isRateLimited && (
                  <span
                    style={{
                      minWidth: 32, height: 32,
                      borderRadius: "50%",
                      border: `2px solid ${FIRE6}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: 12, flexShrink: 0,
                    }}
                  >
                    {rateLimitSecs}s
                  </span>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading || isRateLimited}
              style={{
                width: "100%", height: 48,
                background: isRateLimited ? ASH : FIRE, color: "white",
                border: "none", borderRadius: 50,
                fontSize: 14, fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: (loading || isRateLimited) ? "not-allowed" : "pointer",
                opacity: (loading || isRateLimited) ? 0.6 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                fontFamily: "'DM Sans', sans-serif",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { if (!loading && !isRateLimited) (e.target as HTMLElement).style.background = FIRE6; }}
              onMouseLeave={(e) => { if (!isRateLimited) (e.target as HTMLElement).style.background = FIRE; }}
            >
              {loading && <Loader2 size={15} className="spin" />}
              {isRateLimited
                ? `Wait ${rateLimitSecs}s…`
                : mode === "signin" ? "Sign In →" : "Create Account →"}
            </button>

            <p
              style={{
                textAlign: "center", fontSize: 12, color: ASH,
                marginTop: 20, fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {mode === "signin" ? "New to Sth1r? " : "Already have an account? "}
              <button
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setRateLimitSecs(0); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: FIRE6, fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                }}
              >
                {mode === "signin" ? "Set up your business →" : "Sign in"}
              </button>
            </p>
          </div>
        </div>

        <p
          style={{
            fontSize: 11, color: "rgba(255,255,255,0.18)",
            marginTop: 32, letterSpacing: "0.08em",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Sth1r · by Sthappit
        </p>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .auth-left { display: flex !important; }
          .auth-mobile-logo { display: none !important; }
        }
      `}</style>
    </div>
  );
}
