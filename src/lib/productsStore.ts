import { supabase } from '@/lib/supabase';
import type { Product } from '@/types';

const STORAGE_KEY = 'stockflow_products_cache';
const listeners = new Set<(products: Product[]) => void>();
let cache: Product[] | null = null;
let fetching: Promise<Product[]> | null = null;

function readLocal(): Product[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Product[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(products: Product[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch {
    // ignore quota errors
  }
}

function notify() {
  if (cache) {
    const snapshot = cache;
    listeners.forEach((fn) => fn(snapshot));
  }
}

export function subscribeProducts(fn: (products: Product[]) => void): () => void {
  listeners.add(fn);
  if (cache) fn(cache);
  return () => listeners.delete(fn);
}

export function getProducts(): Product[] {
  return cache ?? readLocal();
}

export async function fetchProducts(): Promise<Product[]> {
  if (fetching) return fetching;
  fetching = (async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, variants:product_variants(*)')
        .order('product_name');
      if (error) throw error;
      cache = (data as Product[]) || [];
      writeLocal(cache);
    } catch {
      cache = readLocal();
    } finally {
      fetching = null;
    }
    notify();
    return cache;
  })();
  return fetching;
}

export function setProducts(products: Product[]) {
  cache = products;
  writeLocal(cache);
  notify();
}

export function invalidateProducts() {
  fetchProducts();
}
