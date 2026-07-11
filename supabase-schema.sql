-- ============================================================
-- STH1R SAAS MIGRATION — PHASE 1
-- Paste into Supabase SQL Editor. Run TWICE — second run
-- completes backfill safely (all inserts use ON CONFLICT DO NOTHING).
-- ============================================================

-- ── 1. BUSINESSES (the tenant) ────────────────────────────────
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

-- ── 3. Add business_id to profiles ───────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 4. Add business_id to all data tables ─────────────────────
ALTER TABLE orders           ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE open_tables      ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE table_orders     ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE bill_counters    ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE menu_items       ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE menu_categories  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE audit_events     ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

-- ── 5. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_business_idx            ON orders (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS table_orders_business_idx      ON table_orders (business_id, table_id);
CREATE INDEX IF NOT EXISTS menu_items_business_idx        ON menu_items (business_id);
CREATE INDEX IF NOT EXISTS menu_categories_business_idx   ON menu_categories (business_id);
CREATE INDEX IF NOT EXISTS audit_events_business_idx      ON audit_events (business_id, ts DESC);
CREATE INDEX IF NOT EXISTS profiles_business_idx          ON profiles (business_id);
CREATE INDEX IF NOT EXISTS subscriptions_business_idx     ON subscriptions (business_id);
CREATE INDEX IF NOT EXISTS subscriptions_razorpay_sub_idx ON subscriptions (razorpay_subscription_id);

-- ── 6. Helper functions ───────────────────────────────────────
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

-- ── 7. Plan limits ────────────────────────────────────────────
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

-- ── 8. Bill counter v2 (keyed by business_id) ────────────────
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

-- ── 9. BACKFILL existing owners ───────────────────────────────
DO $$
DECLARE
  r RECORD;
  new_business_id UUID;
BEGIN
  FOR r IN SELECT * FROM profiles WHERE business_id IS NULL AND role = 'owner'
  LOOP
    INSERT INTO businesses (name, owner_name, business_type, gst_percent, currency_symbol, upi_id, stock_settings, owner_user_id)
    VALUES (
      COALESCE(r.business_name, 'My Business'),
      r.owner_name,
      COALESCE(r.business_type, 'restaurant'),
      COALESCE(r.gst_percent, 5),
      COALESCE(r.currency_symbol, '₹'),
      r.upi_id,
      r.stock_settings,
      r.id
    )
    RETURNING id INTO new_business_id;

    UPDATE profiles SET business_id = new_business_id WHERE id = r.id;

    UPDATE orders         SET business_id = new_business_id WHERE user_id = r.id AND business_id IS NULL;
    UPDATE open_tables    SET business_id = new_business_id WHERE user_id = r.id AND business_id IS NULL;
    UPDATE table_orders   SET business_id = new_business_id WHERE user_id = r.id AND business_id IS NULL;
    UPDATE bill_counters  SET business_id = new_business_id WHERE user_id = r.id AND business_id IS NULL;
    UPDATE menu_items     SET business_id = new_business_id WHERE user_id = r.id AND business_id IS NULL;
    UPDATE menu_categories SET business_id = new_business_id WHERE user_id = r.id AND business_id IS NULL;
    UPDATE audit_events   SET business_id = new_business_id WHERE user_id = r.id AND business_id IS NULL;

    INSERT INTO subscriptions (business_id, plan, status, trial_ends_at)
    VALUES (new_business_id, 'free', 'trialing', now() + interval '30 days')
    ON CONFLICT (business_id) DO NOTHING;
  END LOOP;
END $$;

-- ── 10. RLS Policies ─────────────────────────────────────────

-- businesses
DROP POLICY IF EXISTS "businesses_member_read"  ON businesses;
DROP POLICY IF EXISTS "businesses_owner_update" ON businesses;
CREATE POLICY "businesses_member_read"  ON businesses FOR SELECT USING (has_business_access(id));
CREATE POLICY "businesses_owner_update" ON businesses FOR UPDATE USING (is_business_owner(id)) WITH CHECK (is_business_owner(id));

-- subscriptions (read only for members; writes only via service_role webhook)
DROP POLICY IF EXISTS "subscriptions_read_own_business" ON subscriptions;
CREATE POLICY "subscriptions_read_own_business" ON subscriptions FOR SELECT USING (has_business_access(business_id));

-- profiles
DROP POLICY IF EXISTS "profiles_self"               ON profiles;
DROP POLICY IF EXISTS "profiles_business_read"      ON profiles;
DROP POLICY IF EXISTS "profiles_self_update"        ON profiles;
DROP POLICY IF EXISTS "profiles_owner_insert_staff" ON profiles;
CREATE POLICY "profiles_business_read"      ON profiles FOR SELECT USING (business_id = current_business_id() OR id = auth.uid());
CREATE POLICY "profiles_self_update"        ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_owner_insert_staff" ON profiles FOR INSERT WITH CHECK (
  business_id = current_business_id() AND is_business_owner(current_business_id())
);

-- orders
DROP POLICY IF EXISTS "orders_owner_select" ON orders;
DROP POLICY IF EXISTS "orders_owner_insert" ON orders;
DROP POLICY IF EXISTS "orders_owner_update" ON orders;
DROP POLICY IF EXISTS "orders_business_select" ON orders;
DROP POLICY IF EXISTS "orders_business_insert" ON orders;
DROP POLICY IF EXISTS "orders_business_update" ON orders;
CREATE POLICY "orders_business_select" ON orders FOR SELECT USING (has_business_access(business_id));
CREATE POLICY "orders_business_insert" ON orders FOR INSERT WITH CHECK (has_business_access(business_id));
CREATE POLICY "orders_business_update" ON orders FOR UPDATE USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- open_tables
DROP POLICY IF EXISTS "open_tables_self"     ON open_tables;
DROP POLICY IF EXISTS "open_tables_business" ON open_tables;
CREATE POLICY "open_tables_business" ON open_tables FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- table_orders
DROP POLICY IF EXISTS "table_orders_self"     ON table_orders;
DROP POLICY IF EXISTS "table_orders_business" ON table_orders;
CREATE POLICY "table_orders_business" ON table_orders FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- bill_counters
DROP POLICY IF EXISTS "bill_counters_self"     ON bill_counters;
DROP POLICY IF EXISTS "bill_counters_business" ON bill_counters;
CREATE POLICY "bill_counters_business" ON bill_counters FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- menu_items
DROP POLICY IF EXISTS "menu_items_self"     ON menu_items;
DROP POLICY IF EXISTS "menu_items_business" ON menu_items;
CREATE POLICY "menu_items_business" ON menu_items FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- menu_categories
DROP POLICY IF EXISTS "menu_categories_self"     ON menu_categories;
DROP POLICY IF EXISTS "menu_categories_business" ON menu_categories;
CREATE POLICY "menu_categories_business" ON menu_categories FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id));

-- audit_events
DROP POLICY IF EXISTS "audit_events_owner_read"   ON audit_events;
DROP POLICY IF EXISTS "audit_events_business_read" ON audit_events;
CREATE POLICY "audit_events_business_read" ON audit_events FOR SELECT USING (has_business_access(business_id));

-- ============================================================
-- STH1R SAAS MIGRATION — PHASE 2 (Order/KOT module)
-- Adds KOT-fired tracking to table_orders so "Print KOT" state
-- (and the auto-placement timer) survives reloads and syncs
-- across every device on the business. Re-runnable.
-- ============================================================
ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS kot_fired_at   TIMESTAMPTZ;
ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS kot_auto_placed BOOLEAN NOT NULL DEFAULT false;
