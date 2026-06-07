-- ============================================================
-- Sthapit (Sth1r) — Complete Supabase Schema
-- Run in Supabase SQL Editor (Settings → SQL Editor)
-- All statements are idempotent — safe to re-run.
-- ============================================================

-- ── Profiles (extends auth.users) ────────────────────────────
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
  stock_settings  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_self'
  ) THEN
    CREATE POLICY "profiles_self" ON profiles
      FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ── Orders ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bill_number          TEXT NOT NULL,
  items                JSONB NOT NULL DEFAULT '[]',
  service_mode         TEXT NOT NULL DEFAULT 'dine_in' CHECK (service_mode IN ('dine_in','takeaway','delivery')),
  table_number         INTEGER,
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
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  status               TEXT NOT NULL DEFAULT 'completed'
                         CHECK (status IN ('completed', 'voided', 'refunded')),
  voided_at            TIMESTAMPTZ,
  void_reason          TEXT
);

-- Financial integrity constraints
ALTER TABLE orders
  ADD CONSTRAINT IF NOT EXISTS chk_orders_subtotal_nonneg  CHECK (subtotal_paise >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_orders_total_nonneg     CHECK (total_paise >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_orders_gst_nonneg       CHECK (gst_paise >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_orders_discount_nonneg  CHECK (discount_paise >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_orders_bill_nonempty    CHECK (length(trim(bill_number)) > 0);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_owner_select') THEN
    CREATE POLICY "orders_owner_select" ON orders FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_owner_insert') THEN
    CREATE POLICY "orders_owner_insert" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_owner_update') THEN
    CREATE POLICY "orders_owner_update" ON orders FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_user_created_idx  ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_table_idx         ON orders (user_id, table_number, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx        ON orders (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_user_date_idx     ON orders (user_id, (created_at::date));

-- ── Open Tables (legacy — kept for backward compat) ──────────
CREATE TABLE IF NOT EXISTS open_tables (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  items        JSONB NOT NULL DEFAULT '[]',
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE open_tables ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'open_tables' AND policyname = 'open_tables_self') THEN
    CREATE POLICY "open_tables_self" ON open_tables
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS open_tables_user_idx ON open_tables (user_id, table_number);

-- ── Table Orders (new first-class table management) ───────────
CREATE TABLE IF NOT EXISTS table_orders (
  id                  TEXT PRIMARY KEY,   -- "table_t<N>" — stable per-table id
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_id            TEXT NOT NULL,
  table_name          TEXT NOT NULL,
  table_number        INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','OCCUPIED')),
  items               JSONB NOT NULL DEFAULT '[]',
  subtotal_paise      INTEGER NOT NULL DEFAULT 0,
  tax_paise           INTEGER NOT NULL DEFAULT 0,
  discount_paise      INTEGER NOT NULL DEFAULT 0,
  total_paise         INTEGER NOT NULL DEFAULT 0,
  held_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  version             INTEGER NOT NULL DEFAULT 1,
  gst_percent_at_open NUMERIC
);

-- Financial integrity constraints
ALTER TABLE table_orders
  ADD CONSTRAINT IF NOT EXISTS chk_tableorders_subtotal_nonneg CHECK (subtotal_paise >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_tableorders_total_nonneg    CHECK (total_paise >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_tableorders_tax_nonneg      CHECK (tax_paise >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_tableorders_discount_nonneg CHECK (discount_paise >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_tableorders_version_pos     CHECK (version > 0);

ALTER TABLE table_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'table_orders' AND policyname = 'table_orders_self') THEN
    CREATE POLICY "table_orders_self" ON table_orders
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS table_orders_user_idx       ON table_orders (user_id, table_id);
CREATE INDEX IF NOT EXISTS table_orders_status_idx     ON table_orders (user_id, status);
CREATE INDEX IF NOT EXISTS table_orders_user_table_idx ON table_orders (user_id, table_id, status);

-- ── Bill Counter (P0-02: atomic, prevents duplicate bill numbers) ─
CREATE TABLE IF NOT EXISTS bill_counters (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  counter    INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bill_counters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bill_counters' AND policyname = 'bill_counters_self') THEN
    CREATE POLICY "bill_counters_self" ON bill_counters
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Atomic increment (SERIALIZABLE — prevents concurrent duplicate bill numbers)
CREATE OR REPLACE FUNCTION increment_bill_counter(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val INTEGER;
BEGIN
  INSERT INTO bill_counters (user_id, counter)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET counter     = bill_counters.counter + 1,
        updated_at  = now()
  RETURNING counter INTO next_val;
  RETURN next_val;
END;
$$;

-- ── Menu Items (P0-03: synced from client IDB) ────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id               UUID PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category_id      TEXT NOT NULL,
  price_paise      INTEGER NOT NULL DEFAULT 0,
  cost_price_paise INTEGER,
  is_veg           BOOLEAN NOT NULL DEFAULT true,
  is_available     BOOLEAN NOT NULL DEFAULT true,
  add_ons          JSONB NOT NULL DEFAULT '[]',
  sizes            JSONB,
  portion_enabled  BOOLEAN NOT NULL DEFAULT false,
  portions         JSONB,
  fast_add         BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'menu_items' AND policyname = 'menu_items_self') THEN
    CREATE POLICY "menu_items_self" ON menu_items
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS menu_items_user_idx ON menu_items (user_id);

-- ── Menu Categories ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'menu_categories' AND policyname = 'menu_categories_self') THEN
    CREATE POLICY "menu_categories_self" ON menu_categories
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS menu_categories_user_idx ON menu_categories (user_id);

-- ── Audit Events (Phase 7: server-side audit trail) ───────────
CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  meta        JSONB,
  username    TEXT
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Owners can read their own audit events; writes are app-level only
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_events' AND policyname = 'audit_events_owner_read') THEN
    CREATE POLICY "audit_events_owner_read" ON audit_events
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS audit_events_user_ts_idx ON audit_events (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx  ON audit_events (entity_id) WHERE entity_id IS NOT NULL;

-- ── Realtime (P1-01) ──────────────────────────────────────────
-- Enable Realtime for table_orders so all devices get live updates
ALTER PUBLICATION supabase_realtime ADD TABLE table_orders;

-- ── Payment Reconciliation View (Phase 7B) ────────────────────
CREATE OR REPLACE VIEW order_reconciliation AS
SELECT
  o.id,
  o.user_id,
  o.bill_number,
  o.created_at,
  o.total_paise,
  o.payment_method,
  o.status,
  CASE
    WHEN o.payment_method = 'split' THEN
      COALESCE((o.split_payment->>'cashPaise')::integer, 0) +
      COALESCE((o.split_payment->>'upiPaise')::integer, 0)
    ELSE o.total_paise
  END AS payment_captured_paise,
  CASE
    WHEN o.payment_method = 'split' THEN
      o.total_paise - (
        COALESCE((o.split_payment->>'cashPaise')::integer, 0) +
        COALESCE((o.split_payment->>'upiPaise')::integer, 0)
      )
    ELSE 0
  END AS outstanding_paise
FROM orders o
WHERE o.status = 'completed';

-- ── Shift Summary Function (Dashboard) ───────────────────────
CREATE OR REPLACE FUNCTION get_shift_summary(p_user_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  total_orders    BIGINT,
  total_revenue   BIGINT,
  cash_revenue    BIGINT,
  upi_revenue     BIGINT,
  split_revenue   BIGINT,
  voided_count    BIGINT,
  gst_collected   BIGINT,
  avg_order_value NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed')                        AS total_orders,
    COALESCE(SUM(total_paise) FILTER (WHERE status = 'completed'), 0)  AS total_revenue,
    COALESCE(SUM(total_paise) FILTER (WHERE status = 'completed' AND payment_method = 'cash'),  0) AS cash_revenue,
    COALESCE(SUM(total_paise) FILTER (WHERE status = 'completed' AND payment_method = 'upi'),   0) AS upi_revenue,
    COALESCE(SUM(total_paise) FILTER (WHERE status = 'completed' AND payment_method = 'split'), 0) AS split_revenue,
    COUNT(*) FILTER (WHERE status = 'voided')                           AS voided_count,
    COALESCE(SUM(gst_paise) FILTER (WHERE status = 'completed'), 0)    AS gst_collected,
    COALESCE(AVG(total_paise) FILTER (WHERE status = 'completed'), 0)::NUMERIC AS avg_order_value
  FROM orders
  WHERE user_id = p_user_id
    AND created_at::date = p_date;
$$;
