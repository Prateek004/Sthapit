"use client";

import { useState } from "react";
import { useApp } from "@/lib/store/AppContext";
import { createStaffAccount } from "@/lib/supabase/auth";
import { PLAN_LIMITS } from "@/lib/types";

export function StaffManagement() {
  const { state, showToast } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (state.session?.role !== "owner") return null;

  const plan = state.session.subscription?.plan ?? "free";
  const maxStaff = PLAN_LIMITS[plan].maxStaff;
  const isEntitled = state.session.subscription?.isEntitled ?? true;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!state.session) return;
    setError("");

    if (!username.trim()) {
      setError("Username is required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const result = await createStaffAccount({
        username: username.trim(),
        password,
        businessId: state.session.businessId,
      });
      if (result.ok) {
        showToast(`Staff account "${username.trim()}" created`, "success");
        setUsername("");
        setPassword("");
      } else {
        setError(result.error ?? "Failed to create account");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="mb-1 text-base font-semibold text-white">
        Staff Accounts
      </h3>
      <p className="mb-4 text-sm text-white/50">
        Plan: <span className="capitalize font-medium text-white/70">{plan}</span>
        {" · "}
        Max cashiers: <span className="font-medium text-white/70">{maxStaff === 100000 ? "Unlimited" : maxStaff}</span>
      </p>

      {!isEntitled && (
        <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-300">
          Your trial has ended or plan is inactive. Upgrade to add staff.
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-white/60">
            Cashier username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. ravi_cashier"
            disabled={loading || !isEntitled}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-white/60">
            Password (min 6 chars)
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={loading || !isEntitled}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none disabled:opacity-50"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !isEntitled}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Creating…" : "Create Cashier Account"}
        </button>
      </form>

      <p className="mt-3 text-xs text-white/30">
        Cashiers log in with the same login screen using their username and password. They can take orders but cannot void bills or manage the menu.
      </p>
    </div>
  );
}
