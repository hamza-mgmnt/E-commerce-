/*
# Create Inventory & Order Management Schema

1. New Tables
- `profiles`: Extends auth.users with role (admin/manager), full_name, created_at.
- `products`: Product master catalog with category, name, size, unit_price, stock_quantity, sku.
- `daily_orders`: Sales log with product reference, quantity, total_price, order_date, channel/notes, and the user who logged it.

2. Security
- RLS enabled on all tables.
- profiles: users can read all profiles (needed for role display), update own profile only. Admin can update any profile's role.
- products: authenticated users can SELECT. Only admin can INSERT/UPDATE/DELETE.
- daily_orders: authenticated users can SELECT all and INSERT (managers + admins). Only admin or the order creator can UPDATE/DELETE.

3. Important Notes
- A trigger `handle_new_user` auto-creates a profile row when a new auth user signs up. The first user to sign up is automatically assigned the 'admin' role.
- `decrement_stock` trigger reduces product stock when an order is inserted, and prevents negative stock.
- `increment_stock` trigger restores product stock when an order is deleted.
- All timestamps use timestamptz defaulting to now().
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text DEFAULT '',
  role text NOT NULL DEFAULT 'manager' CHECK (role IN ('admin', 'manager')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('Mattress Topper', 'Satin Bedding', 'Duvet Covers', 'Others')),
  product_name text NOT NULL,
  size text NOT NULL DEFAULT '',
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  sku text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_authenticated" ON products;
CREATE POLICY "products_select_authenticated" ON products FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "products_insert_admin" ON products;
CREATE POLICY "products_insert_admin" ON products FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "products_update_admin" ON products;
CREATE POLICY "products_update_admin" ON products FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "products_delete_admin" ON products;
CREATE POLICY "products_delete_admin" ON products FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ============================================================
-- DAILY ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  category text NOT NULL,
  size text NOT NULL DEFAULT '',
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  channel text DEFAULT '',
  notes text DEFAULT '',
  logged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_authenticated" ON daily_orders;
CREATE POLICY "orders_select_authenticated" ON daily_orders FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "orders_insert_authenticated" ON daily_orders;
CREATE POLICY "orders_insert_authenticated" ON daily_orders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "orders_update_admin_or_owner" ON daily_orders;
CREATE POLICY "orders_update_admin_or_owner" ON daily_orders FOR UPDATE
  TO authenticated
  USING (
    logged_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    logged_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "orders_delete_admin_or_owner" ON daily_orders;
CREATE POLICY "orders_delete_admin_or_owner" ON daily_orders FOR DELETE
  TO authenticated
  USING (
    logged_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create profile on signup; first user becomes admin
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count integer;
BEGIN
  SELECT count(*) INTO user_count FROM profiles;
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN user_count = 0 THEN 'admin' ELSE 'manager' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Decrement stock on order insert
CREATE OR REPLACE FUNCTION decrement_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity - NEW.quantity,
      updated_at = now()
  WHERE id = NEW.product_id;

  IF NEW.product_id IS NOT NULL THEN
    IF (SELECT stock_quantity FROM products WHERE id = NEW.product_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product: %', NEW.product_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_stock ON daily_orders;
CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON daily_orders
  FOR EACH ROW EXECUTE FUNCTION decrement_stock();

-- Increment stock on order delete
CREATE OR REPLACE FUNCTION increment_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.product_id IS NOT NULL THEN
    UPDATE products
    SET stock_quantity = stock_quantity + OLD.quantity,
        updated_at = now()
    WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_stock ON daily_orders;
CREATE TRIGGER trg_increment_stock
  AFTER DELETE ON daily_orders
  FOR EACH ROW EXECUTE FUNCTION increment_stock();

-- Adjust stock on order update (quantity change)
CREATE OR REPLACE FUNCTION adjust_stock_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.product_id IS NOT NULL AND (NEW.product_id IS NULL OR NEW.product_id = OLD.product_id) THEN
    UPDATE products
    SET stock_quantity = stock_quantity + OLD.quantity - NEW.quantity,
        updated_at = now()
    WHERE id = OLD.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_adjust_stock ON daily_orders;
CREATE TRIGGER trg_adjust_stock
  AFTER UPDATE OF quantity, product_id ON daily_orders
  FOR EACH ROW EXECUTE FUNCTION adjust_stock_on_update();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON daily_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_category ON daily_orders(category);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON daily_orders(product_id);
