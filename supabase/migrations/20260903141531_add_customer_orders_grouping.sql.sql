/*
# Add Customer Order Grouping to Daily Orders

## Purpose
Supports multi-item customer orders where multiple products are grouped under a single customer.
Each customer order has a customer name, order date, grand total, and status (Pending, Completed, Shipped).

## New Columns on daily_orders
- `customer_name` (text, NOT NULL DEFAULT 'Walk-in') — the customer who placed the order
- `customer_order_id` (uuid, nullable) — groups multiple daily_orders rows into one customer order
- `status` (text, NOT NULL DEFAULT 'Pending', CHECK in 'Pending','Completed','Shipped') — fulfillment status

## New Indexes
- idx_orders_customer_order_id on daily_orders(customer_order_id)
- idx_orders_customer_name on daily_orders(customer_name)

## RLS
- No new tables; existing daily_orders policies already cover CRUD.
- Updated UPDATE policy is already in place from the original migration.
*/

-- Add columns idempotently
ALTER TABLE daily_orders ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT 'Walk-in';
ALTER TABLE daily_orders ADD COLUMN IF NOT EXISTS customer_order_id uuid;
ALTER TABLE daily_orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Pending'
  CHECK (status IN ('Pending', 'Completed', 'Shipped'));

-- Indexes for grouping and search
CREATE INDEX IF NOT EXISTS idx_orders_customer_order_id ON daily_orders(customer_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON daily_orders(customer_name);
