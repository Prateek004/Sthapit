-- ============================================================
-- Servezy — Supabase Schema
-- Run in Supabase SQL Editor (Settings → SQL Editor)
-- ============================================================

-- ── Profiles (extends auth.users) ───────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT UNIQUE NOT NULL,
  role            TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'cashier')),
  business_name   TEXT NOT NULL DEFAULT '',
  owner_name      TEXT,
  business_type   TEXT NOT NULL DEFAULT 'restaurant',
  gst_percent     NUMERIC NOT NULL DEFAULT 5,
  currency_symbol TEXT NOT NULL DEFAULT '₹',
  upi_id          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self" ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── Orders ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bill_number          TEXT NOT NULL,
  items                JSONB NOT NULL DEFAULT '[]',
  service_mode         TEXT NOT NULL DEFAULT 'dine_in' CHECK (service_mode IN ('dine_in','takeaway','delivery')),
  subtotal_paise       INTEGER NOT NULL DEFAULT 0,
  discount_paise       INTEGER NOT NULL DEFAULT 0,
  discount_type        TEXT NOT NULL DEFAULT 'flat' CHECK (discount_type IN ('flat','percent')),
  discount_value       NUMERIC NOT NULL DEFAULT 0,
  gst_percent          NUMERIC NOT NULL DEFAULT 0,
  gst_paise            INTEGER NOT NULL DEFAULT 0,
  total_paise          INTEGER NOT NULL DEFAULT 0,
  payment_method       TEXT NOT NULL CHECK (payment_method IN ('cash','upi','split')),
  split_payment        JSONB,
  cash_received_paise  INTEGER,
  change_paise         INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_owner_select" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_owner_insert" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "orders_owner_update" ON orders FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders (user_id, created_at DESC);

-- ── Allow email suffix for synthetic auth ────────────────────
-- Note: users sign up as username@servezy.app
-- No extra config needed — Supabase accepts any email format.
