"use client";

import { useState } from "react";
import { useApp } from "@/lib/store/AppContext";
import { getSupabase } from "@/lib/supabase/client";
import { PLAN_LIMITS } from "@/lib/types";
import type { Plan } from "@/lib/types";

interface PlanCardProps {
  name: Plan;
  price: string;
  features: string[];
  isCurrent: boolean;
  onUpgrade: () => void;
  loading: boolean;
}

function PlanCard({
  name,
  price,
  features,
  isCurrent,
  onUpgrade,
  loading,
}: PlanCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        isCurrent
          ? "border-indigo-500/50 bg-indigo-500/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">
            {name}
          </p>
          <p className="text-2xl font-bold text-white">{price}</p>
        </div>
        {isCurrent && (
          <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-300">
            Current plan
          </span>
        )}
      </div>
      <ul className="mb-4 space-y-1">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-white/60">
            <span className="text-green-400">✓</span> {f}
          </li>
        ))}
      </ul>
      {!isCurrent && (
        <button
          onClick={onUpgrade}
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Loading…" : `Upgrade to ${name}`}
        </button>
      )}
    </div>
  );
}

type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;
type WindowWithRazorpay = { Razorpay: RazorpayConstructor };

export function BillingPanel() {
  const { state, showToast } = useApp();
  const [loading, setLoading] = useState<Plan | null>(null);

  if (state.session?.role !== "owner") return null;

  const sub = state.session.subscription;
  const currentPlan = sub?.plan ?? "free";
  const status = sub?.status ?? "trialing";
  const trialEndsAt = sub?.trialEndsAt;
  const isEntitled = sub?.isEntitled ?? true;

  const trialDaysLeft = trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(trialEndsAt).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : null;

  async function handleUpgrade(plan: Plan) {
    if (!state.session) return;
    setLoading(plan);
    try {
      const sb = getSupabase();
      if (!sb) {
        showToast("Cloud sync required to upgrade", "error");
        setLoading(null);
        return;
      }
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) {
        showToast("Please log in with cloud sync enabled", "error");
        setLoading(null);
        return;
      }

      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to start checkout", "error");
        setLoading(null);
        return;
      }

      // Load Razorpay checkout script if not already present
      await new Promise<void>((resolve, reject) => {
        if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.body.appendChild(script);
      });

      // Open Razorpay subscription checkout
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rzp = new (window as unknown as WindowWithRazorpay).Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "Sthappit",
        description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
        handler: () => {
          showToast(
            "Payment received! Your plan will activate shortly.",
            "success"
          );
          // Webhook activates the subscription server-side — reload to reflect new status
          setTimeout(() => window.location.reload(), 3000);
        },
        prefill: {
          name: state.session?.businessName ?? "",
        },
        theme: { color: "#6366f1" },
        modal: {
          ondismiss: () => setLoading(null),
        },
      });
      rzp.open();
    } catch {
      showToast("Something went wrong. Please try again.", "error");
      setLoading(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="mb-1 text-base font-semibold text-white">
        Plan &amp; Billing
      </h3>

      {/* Status banner */}
      <div className="mb-4">
        {status === "trialing" && trialDaysLeft !== null && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              trialDaysLeft <= 3
                ? "bg-red-500/10 border border-red-500/20 text-red-300"
                : "bg-blue-500/10 border border-blue-500/20 text-blue-300"
            }`}
          >
            {trialDaysLeft > 0
              ? `Free trial: ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`
              : "Your free trial has ended. Upgrade to continue using Sthappit."}
          </div>
        )}
        {status === "active" && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-300">
            ✓ Active —{" "}
            {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan
          </div>
        )}
        {(status === "past_due" ||
          status === "expired" ||
          status === "canceled") && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
            ⚠ Your subscription is {status.replace("_", " ")}. Upgrade to
            restore access.
          </div>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PlanCard
          name="starter"
          price="₹999/mo"
          features={[
            `${PLAN_LIMITS.starter.maxMenuItems} menu items`,
            `${PLAN_LIMITS.starter.maxStaff} cashier accounts`,
            `${PLAN_LIMITS.starter.maxTables} tables`,
            "Cloud sync",
            "Offline-first",
          ]}
          isCurrent={currentPlan === "starter"}
          onUpgrade={() => handleUpgrade("starter")}
          loading={loading === "starter"}
        />
        <PlanCard
          name="pro"
          price="₹2,499/mo"
          features={[
            "Unlimited menu items",
            "Unlimited staff accounts",
            "Unlimited tables",
            "Cloud sync",
            "Priority support",
          ]}
          isCurrent={currentPlan === "pro"}
          onUpgrade={() => handleUpgrade("pro")}
          loading={loading === "pro"}
        />
      </div>

      <p className="mt-4 text-xs text-white/30">
        Payments are processed securely via Razorpay. You can cancel anytime
        from the Razorpay dashboard.
      </p>
    </div>
  );
}
