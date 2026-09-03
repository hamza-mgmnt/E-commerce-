/*
# Add Product Variants (Multi-Variation Support)

1. New Tables
- `product_variants`: Individual variants for a product (e.g. different bedding sizes), each with its own SKU, unit_price, and stock_quantity.

2. Modified Tables
- `products`: Added `has_variants` (boolean, default false) and `variation_type` (text, e.g. "Bedding Size") columns.
- `daily_orders`: Added `variant_id` (uuid, FK to product_variants) to track which specific variant was sold.

3. Security
- RLS enabled on `product_variants` with same policy pattern as products: authenticated can SELECT, admin-only for INSERT/UPDATE/DELETE.

4. Trigger Updates
- `decrement_stock`: Now checks `variant_id` first — if set, decrements from `product_variants.stock_quantity`; otherwise falls back to `products.stock_quantity`.
- `increment_stock`: Same logic — restores stock to the variant if `variant_id` is set.
- `adjust_stock_on_update`: Handles variant-level stock adjustments when quantity changes.

5. Important Notes
- Products without variants continue to work as before (has_variants = false).
- When a product has variants, the product-level stock_quantity is ignored; each variant manages its own stock.
- Existing orders without variant_id continue to work with product-level stock.
*/

-- ============================================================
-- ADD COLUMNS TO PRODUCTS
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variation_type text NOT NULL DEFAULT '';

-- ============================================================
-- CREATE PRODUCT_VARIANTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variation_value text NOT NULL,
  sku text DEFAULT '',
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "variants_select_authenticated" ON product_variants;
CREATE POLICY "variants_select_authenticated" ON product_variants FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "variants_insert_admin" ON product_variants;
CREATE POLICY "variants_insert_admin" ON product_variants FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "variants_update_admin" ON product_variants;
CREATE POLICY "variants_update_admin" ON product_variants FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "variants_delete_admin" ON product_variants;
CREATE POLICY "variants_delete_admin" ON product_variants FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ============================================================
-- ADD VARIANT_ID TO DAILY_ORDERS
-- ============================================================
ALTER TABLE daily_orders ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_variant_id ON daily_orders(variant_id);
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);

-- ============================================================
-- UPDATE TRIGGERS FOR VARIANT-AWARE STOCK
-- ============================================================

-- Replace decrement_stock to handle variant_id
CREATE OR REPLACE FUNCTION decrement_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL THEN
    UPDATE product_variants
    SET stock_quantity = stock_quantity - NEW.quantity,
        updated_at = now()
    WHERE id = NEW.variant_id;

    IF (SELECT stock_quantity FROM product_variants WHERE id = NEW.variant_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for variant: %', NEW.product_name;
    END IF;
  ELSEIF NEW.product_id IS NOT NULL THEN
    UPDATE products
    SET stock_quantity = stock_quantity - NEW.quantity,
        updated_at = now()
    WHERE id = NEW.product_id;

    IF (SELECT stock_quantity FROM products WHERE id = NEW.product_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product: %', NEW.product_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Replace increment_stock to handle variant_id
CREATE OR REPLACE FUNCTION increment_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.variant_id IS NOT NULL THEN
    UPDATE product_variants
    SET stock_quantity = stock_quantity + OLD.quantity,
        updated_at = now()
    WHERE id = OLD.variant_id;
  ELSEIF OLD.product_id IS NOT NULL THEN
    UPDATE products
    SET stock_quantity = stock_quantity + OLD.quantity,
        updated_at = now()
    WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END;
$$;

-- Replace adjust_stock_on_update to handle variant_id
CREATE OR REPLACE FUNCTION adjust_stock_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only adjust if quantity changed and it's the same variant/product
  IF NEW.quantity != OLD.quantity THEN
    IF OLD.variant_id IS NOT NULL AND (NEW.variant_id IS NULL OR NEW.variant_id = OLD.variant_id) THEN
      UPDATE product_variants
      SET stock_quantity = stock_quantity + OLD.quantity - NEW.quantity,
          updated_at = now()
      WHERE id = OLD.variant_id;
    ELSEIF OLD.product_id IS NOT NULL AND (NEW.product_id IS NULL OR NEW.product_id = OLD.product_id) THEN
      UPDATE products
      SET stock_quantity = stock_quantity + OLD.quantity - NEW.quantity,
          updated_at = now()
      WHERE id = OLD.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
