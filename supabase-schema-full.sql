-- ============================================================
-- STH1R — COMPLETE SUPABASE SCHEMA (single-file, run-once)
-- ------------------------------------------------------------
-- Paste the WHOLE file into: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (every statement is idempotent).
-- Reconstructed from the app's own read/write code:
--   lib/supabase/sync.ts, tableSync.ts, auth.ts, lib/store/AppContext.tsx
-- Money is stored as integer paise. All IDs are UUID (crypto.randomUUID()).
-- Tenant isolation is by business_id, enforced by Row Level Security.
-- ============================================================

-- ── 1. BUSINESSES (the tenant) ───────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL DEFAULT '',
  owner_name      TEXT,
  business_type   TEXT NOT NULL DEFAULT 'restaurant',
  phone           TEXT,
  city            TEXT,
  gst_percent     NUMERIC NOT NULL DEFAULT 5,
  currency_symbol TEXT NOT NULL DEFAULT '₹',
  upi_id          TEXT,
  stock_settings  JSONB,
  owner_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- ── 2. SUBSCRIPTIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id              UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  plan                     TEXT NOT NULL DEFAULT 'free'
                             CHECK (plan IN ('free','starter','pro')),
  status                   TEXT NOT NULL DEFAULT 'trialing'
                             CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  trial_ends_at            TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  razorpay_customer_id     TEXT,
  razorpay_subscription_id TEXT,
  razorpay_plan_id         TEXT,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ── 3. PROFILES (one row per auth user; owner or cashier) ────
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT,
  role            TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','cashier')),
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE,
  business_name   TEXT,
  owner_name      TEXT,
  business_type   TEXT DEFAULT 'restaurant',
  gst_percent     NUMERIC DEFAULT 5,
  currency_symbol TEXT DEFAULT '₹',
  upi_id          TEXT,
  stock_settings  JSONB,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ── 4. ORDERS (completed POS + counter sales) ────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id          UUID REFERENCES businesses(id) ON DELETE CASCADE,
  bill_number          INTEGER,
  items                JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_mode         TEXT,
  table_number         INTEGER,
  subtotal_paise       BIGINT NOT NULL DEFAULT 0,
  discount_paise       BIGINT NOT NULL DEFAULT 0,
  discount_type        TEXT,
  discount_value       NUMERIC,
  gst_percent          NUMERIC,
  gst_paise            BIGINT NOT NULL DEFAULT 0,
  total_paise          BIGINT NOT NULL DEFAULT 0,
  payment_method       TEXT,
  split_payment        JSONB,
  cash_received_paise  BIGINT,
  change_paise         BIGINT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  status               TEXT NOT NULL DEFAULT 'completed',
  voided_at            TIMESTAMPTZ,
  void_reason          TEXT
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ── 5. OPEN_TABLES (legacy live-table snapshot, read-synced) ─
CREATE TABLE IF NOT EXISTS open_tables (
  id            UUID PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  table_number  INTEGER,
  items         JSONB NOT NULL DEFAULT '[]'::jsonb,
  opened_at     TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE open_tables ENABLE ROW LEVEL SECURITY;

-- ── 6. TABLE_ORDERS (live dine-in state, realtime-synced) ────
CREATE TABLE IF NOT EXISTS table_orders (
  id                   UUID PRIMARY KEY,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id          UUID REFERENCES businesses(id) ON DELETE CASCADE,
  table_id             TEXT,
  table_name           TEXT,
  table_number         INTEGER,
  status               TEXT NOT NULL DEFAULT 'AVAILABLE'
                         CHECK (status IN ('AVAILABLE','OCCUPIED')),
  items                JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_paise       BIGINT NOT NULL DEFAULT 0,
  tax_paise            BIGINT NOT NULL DEFAULT 0,
  discount_paise       BIGINT NOT NULL DEFAULT 0,
  total_paise          BIGINT NOT NULL DEFAULT 0,
  held_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  version              INTEGER NOT NULL DEFAULT 0,
  gst_percent_at_open  NUMERIC,
  kot_fired_at         TIMESTAMPTZ,
  kot_auto_placed      BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE table_orders ENABLE ROW LEVEL SECURITY;

-- ── 7. BILL_COUNTERS (one running sequence per user) ─────────
CREATE TABLE IF NOT EXISTS bill_counters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE,
  counter      INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bill_counters ENABLE ROW LEVEL SECURITY;

-- ── 8. MENU_CATEGORIES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id           UUID PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

-- ── 9. MENU_ITEMS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id                UUID PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id       UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT '',
  category_id       UUID,
  price_paise       BIGINT NOT NULL DEFAULT 0,
  cost_price_paise  BIGINT,
  is_veg            BOOLEAN,
  is_available      BOOLEAN NOT NULL DEFAULT true,
  add_ons           JSONB,
  sizes             JSONB,
  portion_enabled   BOOLEAN NOT NULL DEFAULT false,
  portions          JSONB,
  fast_add          BOOLEAN NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- ── 10. AUDIT_EVENTS (append-only audit trail) ───────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  type         TEXT,
  detail       JSONB
);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- ── 11. INDEXES ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_business_idx            ON orders (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS table_orders_business_idx      ON table_orders (business_id, table_id);
CREATE INDEX IF NOT EXISTS open_tables_business_idx       ON open_tables (business_id);
CREATE INDEX IF NOT EXISTS menu_items_business_idx        ON menu_items (business_id);
CREATE INDEX IF NOT EXISTS menu_categories_business_idx   ON menu_categories (business_id);
CREATE INDEX IF NOT EXISTS bill_counters_business_idx     ON bill_counters (business_id);
CREATE INDEX IF NOT EXISTS audit_events_business_idx      ON audit_events (business_id, ts DESC);
CREATE INDEX IF NOT EXISTS profiles_business_idx          ON profiles (business_id);
CREATE INDEX IF NOT EXISTS subscriptions_business_idx     ON subscriptions (business_id);
CREATE INDEX IF NOT EXISTS subscriptions_razorpay_sub_idx ON subscriptions (razorpay_subscription_id);

-- ── 12. HELPER FUNCTIONS (SECURITY DEFINER — used by RLS) ─────
CREATE OR REPLACE FUNCTION has_business_access(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND business_id = p_business_id
  );
$$;

CREATE OR REPLACE FUNCTION current_business_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT business_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_business_owner(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND business_id = p_business_id AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION business_is_entitled(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE business_id = p_business_id
      AND (
        (status = 'trialing' AND trial_ends_at > now())
        OR status = 'active'
        OR (status = 'past_due' AND current_period_end > now() - interval '3 days')
      )
  );
$$;

-- ── 13. PLAN LIMITS + ENFORCEMENT TRIGGERS ───────────────────
CREATE OR REPLACE FUNCTION get_plan_limits(p_plan TEXT)
RETURNS TABLE (max_menu_items INTEGER, max_staff INTEGER, max_tables INTEGER)
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    CASE p_plan WHEN 'free' THEN 30   WHEN 'starter' THEN 150  ELSE 100000 END,
    CASE p_plan WHEN 'free' THEN 1    WHEN 'starter' THEN 5    ELSE 100000 END,
    CASE p_plan WHEN 'free' THEN 4    WHEN 'starter' THEN 20   ELSE 100000 END;
$$;

CREATE OR REPLACE FUNCTION enforce_menu_item_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_plan TEXT; v_max INTEGER; v_count INTEGER;
BEGIN
  SELECT plan INTO v_plan FROM subscriptions WHERE business_id = NEW.business_id;
  SELECT max_menu_items INTO v_max FROM get_plan_limits(COALESCE(v_plan,'free'));
  SELECT COUNT(*) INTO v_count FROM menu_items WHERE business_id = NEW.business_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED: menu item limit (%) reached for plan %', v_max, COALESCE(v_plan,'free');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_menu_item_limit ON menu_items;
CREATE TRIGGER trg_enforce_menu_item_limit
  BEFORE INSERT ON menu_items FOR EACH ROW EXECUTE FUNCTION enforce_menu_item_limit();

CREATE OR REPLACE FUNCTION enforce_staff_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_plan TEXT; v_max INTEGER; v_count INTEGER;
BEGIN
  IF NEW.role <> 'cashier' THEN RETURN NEW; END IF;
  SELECT plan INTO v_plan FROM subscriptions WHERE business_id = NEW.business_id;
  SELECT max_staff INTO v_max FROM get_plan_limits(COALESCE(v_plan,'free'));
  SELECT COUNT(*) INTO v_count FROM profiles WHERE business_id = NEW.business_id AND role = 'cashier';
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED: staff limit (%) reached for plan %', v_max, COALESCE(v_plan,'free');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_staff_limit ON profiles;
CREATE TRIGGER trg_enforce_staff_limit
  BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION enforce_staff_limit();

-- ── 14. BILL COUNTER RPC (atomic, per user) ──────────────────
CREATE OR REPLACE FUNCTION increment_bill_counter_v2(p_business_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE next_val INTEGER;
BEGIN
  INSERT INTO bill_counters (user_id, business_id, counter)
  VALUES (auth.uid(), p_business_id, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET counter = bill_counters.counter + 1, updated_at = now()
  RETURNING counter INTO next_val;
  RETURN next_val;
END;
$$;

-- ── 15. RLS POLICIES ─────────────────────────────────────────

-- businesses
DROP POLICY IF EXISTS "businesses_member_read"  ON businesses;
DROP POLICY IF EXISTS "businesses_owner_update" ON businesses;
DROP POLICY IF EXISTS "businesses_owner_insert" ON businesses;
CREATE POLICY "businesses_member_read"  ON businesses FOR SELECT USING (has_business_access(id));
CREATE POLICY "businesses_owner_update" ON businesses FOR UPDATE USING (is_business_owner(id)) WITH CHECK (is_business_owner(id));
CREATE POLICY "businesses_owner_insert" ON businesses FOR INSERT WITH CHECK (owner_user_id = auth.uid());

-- subscriptions (members read; owner may create own trial; webhook writes via service_role)
DROP POLICY IF EXISTS "subscriptions_read_own_business" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_owner_insert"      ON subscriptions;
CREATE POLICY "subscriptions_read_own_business" ON subscriptions FOR SELECT USING (has_business_access(business_id));
CREATE POLICY "subscriptions_owner_insert"      ON subscriptions FOR INSERT WITH CHECK (has_business_access(business_id));

-- profiles
DROP POLICY IF EXISTS "profiles_self"               ON profiles;
DROP POLICY IF EXISTS "profiles_business_read"      ON profiles;
DROP POLICY IF EXISTS "profiles_self_update"        ON profiles;
DROP POLICY IF EXISTS "profiles_self_insert"        ON profiles;
DROP POLICY IF EXISTS "profiles_owner_insert_staff" ON profiles;
CREATE POLICY "profiles_business_read"      ON profiles FOR SELECT USING (business_id = current_business_id() OR id = auth.uid());
CREATE POLICY "profiles_self_update"        ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_self_insert"        ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_owner_insert_staff" ON profiles FOR INSERT WITH CHECK (
  business_id = current_business_id() AND is_business_owner(current_business_id())
);

-- orders
DROP POLICY IF EXISTS "orders_business_select" ON orders;
DROP POLICY IF EXISTS "orders_business_insert" ON orders;
DROP POLICY IF EXISTS "orders_business_update" ON orders;
CREATE POLICY "orders_business_select" ON orders FOR SELECT USING (has_business_access(business_id));
CREATE POLICY "orders_business_insert" ON orders FOR INSERT WITH CHECK (has_business_access(business_id));
CREATE POLICY "orders_business_update" ON orders FOR UPDATE USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- open_tables
DROP POLICY IF EXISTS "open_tables_business" ON open_tables;
CREATE POLICY "open_tables_business" ON open_tables FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- table_orders
DROP POLICY IF EXISTS "table_orders_business" ON table_orders;
CREATE POLICY "table_orders_business" ON table_orders FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- bill_counters
DROP POLICY IF EXISTS "bill_counters_business" ON bill_counters;
CREATE POLICY "bill_counters_business" ON bill_counters FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- menu_items
DROP POLICY IF EXISTS "menu_items_business" ON menu_items;
CREATE POLICY "menu_items_business" ON menu_items FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- menu_categories
DROP POLICY IF EXISTS "menu_categories_business" ON menu_categories;
CREATE POLICY "menu_categories_business" ON menu_categories FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- audit_events (members read; inserts via service_role / SECURITY DEFINER)
DROP POLICY IF EXISTS "audit_events_business_read" ON audit_events;
CREATE POLICY "audit_events_business_read" ON audit_events FOR SELECT USING (has_business_access(business_id));

-- ── 16. REALTIME (live table sync across devices) ────────────
-- Adds table_orders to Supabase's realtime publication if not already present.
-- On a plain Postgres (no supabase_realtime publication) this block is skipped.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'table_orders'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.table_orders';
    END IF;
  END IF;
END $$;

-- ============================================================
-- DONE. Next: confirm the Data API is enabled for the public
-- schema (Dashboard -> Integrations -> Data API -> Enable).
-- ============================================================
