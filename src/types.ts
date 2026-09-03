export type UserRole = 'admin' | 'manager';

export type Category = 'Mattress Topper' | 'Satin Bedding' | 'Duvet Covers' | 'Others';

export const CATEGORIES: Category[] = ['Mattress Topper', 'Satin Bedding', 'Duvet Covers', 'Others'];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  variation_value: string;
  sku: string;
  unit_price: number;
  stock_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  category: Category;
  product_name: string;
  size: string;
  unit_price: number;
  stock_quantity: number;
  sku: string;
  has_variants: boolean;
  variation_type: string;
  variants?: ProductVariant[];
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 'Pending' | 'Completed' | 'Shipped';

export interface DailyOrder {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  category: Category;
  size: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  order_date: string;
  channel: string;
  notes: string;
  logged_by: string | null;
  created_at: string;
  customer_name: string;
  customer_order_id: string | null;
  status: OrderStatus;
}

export interface CustomerOrderGroup {
  customer_order_id: string;
  customer_name: string;
  order_date: string;
  status: OrderStatus;
  channel: string;
  notes: string;
  items: DailyOrder[];
  grand_total: number;
  total_units: number;
}

export type DateRangePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';
