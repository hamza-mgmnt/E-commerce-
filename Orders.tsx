import { useState, useEffect, useMemo, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDate, todayISO, exportToCSV, exportToPDF } from '@/lib/utils';
import { CATEGORIES } from '@/types';
import type { Product, DailyOrder, Category } from '@/types';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  Save,
  Trash2,
  Download,
  FileText,
  ShoppingCart,
  TrendingUp,
  Package,
  Search,
} from 'lucide-react';

interface OrderRow {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  size: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  order_date: string;
  channel: string;
  notes: string;
}

let rowCounter = 0;
function createEmptyRow(date: string): OrderRow {
  rowCounter++;
  return {
    id: `row-${rowCounter}`,
    product_id: '',
    variant_id: '',
    product_name: '',
    size: '',
    unit_price: 0,
    quantity: 1,
    total_price: 0,
    order_date: date,
    channel: '',
    notes: '',
  };
}

const CHANNELS = ['TikTok Shop UK', 'Direct', 'Cash on Delivery', 'Amazon', 'eBay', 'Website'];

export default function Orders() {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<DailyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>('Mattress Topper');
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [entryDate, setEntryDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DailyOrder | null>(null);
  const [search, setSearch] = useState('');
  const [orderDateFilter, setOrderDateFilter] = useState(todayISO());

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setRows([createEmptyRow(entryDate)]);
  }, [entryDate]);

  async function fetchData() {
    setLoading(true);
    const [{ data: productData }, { data: orderData }] = await Promise.all([
      supabase.from('products').select('*, variants(*)').order('product_name'),
      supabase.from('daily_orders').select('*').order('created_at', { ascending: false }),
    ]);
    setProducts((productData as Product[]) || []);
    setOrders((orderData as DailyOrder[]) || []);
    setLoading(false);
  }

  const categoryProducts = useMemo(
    () => products.filter((p) => p.category === activeCategory),
    [products, activeCategory]
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesDate = o.order_date === orderDateFilter;
      const matchesSearch =
        o.product_name.toLowerCase().includes(search.toLowerCase()) ||
        o.channel?.toLowerCase().includes(search.toLowerCase());
      return matchesDate && matchesSearch;
    });
  }, [orders, orderDateFilter, search]);

  const dayRevenue = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + Number(o.total_price), 0),
    [filteredOrders]
  );
  const dayUnits = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + o.quantity, 0),
    [filteredOrders]
  );

  function getProductStock(p: Product): number {
    if (p.has_variants && p.variants) {
      return p.variants.reduce((sum, v) => sum + v.stock_quantity, 0);
    }
    return p.stock_quantity;
  }

  function updateRow(id: string, field: keyof OrderRow, value: string | number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };

        if (field === 'product_id') {
          const product = categoryProducts.find((p) => p.id === value);
          if (product) {
            updated.product_name = product.product_name;
            updated.variant_id = '';
            updated.size = '';
            updated.unit_price = 0;
            updated.total_price = 0;

            // If product has no variants, auto-fill from product-level data
            if (!product.has_variants) {
              updated.size = product.size;
              updated.unit_price = Number(product.unit_price);
              updated.total_price = updated.unit_price * updated.quantity;
            }
          }
        }

        if (field === 'variant_id') {
          const product = categoryProducts.find((p) => p.id === r.product_id);
          if (product && product.variants && value) {
            const variant = product.variants.find((v) => v.id === value);
            if (variant) {
              updated.size = variant.variation_value;
              updated.unit_price = Number(variant.unit_price);
              updated.total_price = updated.unit_price * updated.quantity;
            }
          }
        }

        if (field === 'quantity') {
          updated.quantity = Math.max(1, parseInt(String(value)) || 1);
          updated.total_price = updated.unit_price * updated.quantity;
        }

        return updated;
      })
    );
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow(entryDate)]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);

    const validRows = rows.filter((r) => r.product_id && r.quantity > 0);

    if (validRows.length === 0) {
      setSaveMsg({ type: 'error', text: 'Please select at least one product to save.' });
      setSaving(false);
      return;
    }

    // Validate variant selection for variant products
    for (const r of validRows) {
      const product = categoryProducts.find((p) => p.id === r.product_id);
      if (product && product.has_variants && !r.variant_id) {
        setSaveMsg({ type: 'error', text: `Please select a size for "${r.product_name}".` });
        setSaving(false);
        return;
      }
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    const insertData = validRows.map((r) => ({
      product_id: r.product_id,
      variant_id: r.variant_id || null,
      product_name: r.product_name,
      category: activeCategory,
      size: r.size,
      unit_price: r.unit_price,
      quantity: r.quantity,
      total_price: r.total_price,
      order_date: r.order_date,
      channel: r.channel,
      notes: r.notes,
      logged_by: userId,
    }));

    const { error } = await supabase.from('daily_orders').insert(insertData);

    if (error) {
      setSaveMsg({ type: 'error', text: error.message });
      setSaving(false);
      return;
    }

    setSaveMsg({ type: 'success', text: `${validRows.length} order(s) saved successfully! Stock updated.` });
    setRows([createEmptyRow(entryDate)]);
    setSaving(false);
    fetchData();
  }

  async function handleDeleteOrder() {
    if (!deleteTarget) return;
    await supabase.from('daily_orders').delete().eq('id', deleteTarget.id);
    setDeleteTarget(null);
    fetchData();
  }

  function handleExportCSV() {
    const headers = ['Date', 'Product', 'Category', 'Size', 'Unit Price', 'Qty', 'Total', 'Channel', 'Notes'];
    const rowsData = filteredOrders.map((o) => [
      formatDate(o.order_date),
      o.product_name,
      o.category,
      o.size,
      Number(o.unit_price).toFixed(2),
      o.quantity,
      Number(o.total_price).toFixed(2),
      o.channel || '',
      o.notes || '',
    ]);
    exportToCSV(`orders-${orderDateFilter}.csv`, headers, rowsData);
  }

  function handleExportPDF() {
    const headers = ['Date', 'Product', 'Category', 'Size', 'Unit Price', 'Qty', 'Total', 'Channel'];
    const rowsData = filteredOrders.map((o) => [
      formatDate(o.order_date),
      o.product_name,
      o.category,
      o.size,
      formatCurrency(Number(o.unit_price)),
      o.quantity,
      formatCurrency(Number(o.total_price)),
      o.channel || '',
    ]);
    exportToPDF(`Order Log — ${formatDate(orderDateFilter)}`, headers, rowsData);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          Loading orders...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Category Tabs */}
      <div className="glass-card p-2">
        <div className="flex gap-1 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === cat ? 'tab-active' : 'tab-inactive'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Order Entry Form */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} className="text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              New Order Entry — {activeCategory}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Order Date:</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="input-field py-1.5 w-auto text-sm"
            />
          </div>
        </div>

        {categoryProducts.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">
            No products in the "{activeCategory}" category yet. Add products first from the Products page.
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 uppercase w-8">#</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 uppercase">Product</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 uppercase w-32">Size</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-slate-500 uppercase w-24">Unit Price</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-slate-500 uppercase w-20">Qty</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-slate-500 uppercase w-28">Total</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 uppercase w-36">Channel</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 uppercase w-32">Notes</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const selectedProduct = categoryProducts.find((p) => p.id === row.product_id);
                    const hasVariants = selectedProduct?.has_variants && selectedProduct?.variants && selectedProduct.variants.length > 0;

                    return (
                      <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <td className="py-2 px-2 text-slate-400 text-xs">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <select
                            value={row.product_id}
                            onChange={(e) => updateRow(row.id, 'product_id', e.target.value)}
                            className="input-field py-1.5 text-xs"
                            required
                          >
                            <option value="">Select product...</option>
                            {categoryProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.product_name} ({getProductStock(p)} in stock)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          {hasVariants ? (
                            <select
                              value={row.variant_id}
                              onChange={(e) => updateRow(row.id, 'variant_id', e.target.value)}
                              className="input-field py-1.5 text-xs"
                              required
                            >
                              <option value="">Select size...</option>
                              {selectedProduct!.variants!.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.variation_value} ({v.stock_quantity} in stock)
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={row.size}
                              onChange={(e) => updateRow(row.id, 'size', e.target.value)}
                              className="input-field py-1.5 text-xs"
                              placeholder="—"
                            />
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {row.unit_price > 0 ? formatCurrency(row.unit_price) : '—'}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min="1"
                            value={row.quantity}
                            onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                            className="input-field py-1.5 text-xs text-right w-16"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                            {formatCurrency(row.total_price)}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <select
                            value={row.channel}
                            onChange={(e) => updateRow(row.id, 'channel', e.target.value)}
                            className="input-field py-1.5 text-xs"
                          >
                            <option value="">—</option>
                            {CHANNELS.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={row.notes}
                            onChange={(e) => updateRow(row.id, 'notes', e.target.value)}
                            className="input-field py-1.5 text-xs"
                            placeholder="Optional"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRow(row.id)}
                              className="p-1 rounded-lg text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
              <button type="button" onClick={addRow} className="btn-secondary">
                <Package size={16} />
                Add Row
              </button>
              <div className="flex items-center gap-3">
                {rows.length > 1 && (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Grand Total:{' '}
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {formatCurrency(rows.reduce((sum, r) => sum + r.total_price, 0))}
                    </span>
                  </span>
                )}
                <button type="submit" disabled={saving} className="btn-primary">
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </div>

            {saveMsg && (
              <div
                className={`mt-4 text-sm rounded-xl px-4 py-3 ${
                  saveMsg.type === 'success'
                    ? 'text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800'
                    : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}
              >
                {saveMsg.text}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Order Log */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search orders..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field pl-10 py-2"
                />
              </div>
              <input
                type="date"
                value={orderDateFilter}
                onChange={(e) => setOrderDateFilter(e.target.value)}
                className="input-field py-2 w-auto"
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExportCSV} className="btn-secondary" disabled={filteredOrders.length === 0}>
                <Download size={16} />
                CSV
              </button>
              <button onClick={handleExportPDF} className="btn-secondary" disabled={filteredOrders.length === 0}>
                <FileText size={16} />
                PDF
              </button>
            </div>
          </div>

          {/* Mini stats */}
          <div className="flex items-center gap-6 mt-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-brand-500" />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Revenue: <span className="font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(dayRevenue)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Package size={16} className="text-accent-500" />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Units: <span className="font-semibold text-slate-800 dark:text-slate-100">{dayUnits}</span>
              </span>
            </div>
            <span className="text-sm text-slate-400">
              {filteredOrders.length} order(s) on {formatDate(orderDateFilter)}
            </span>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No orders found for this date. Add entries above to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">#</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Product</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Category</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Size</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase">Price</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase">Qty</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase">Total</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Channel</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Notes</th>
                  {isAdmin && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o, i) => (
                  <tr
                    key={o.id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 px-4 text-slate-400 text-xs">{i + 1}</td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-100">{o.product_name}</td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{o.category}</td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{o.size || '—'}</td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                      {formatCurrency(Number(o.unit_price))}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">{o.quantity}</td>
                    <td className="py-3 px-4 text-right font-semibold text-brand-600 dark:text-brand-400">
                      {formatCurrency(Number(o.total_price))}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {o.channel ? (
                        <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs">
                          {o.channel}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-xs">{o.notes || '—'}</td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setDeleteTarget(o)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                  <td colSpan={6} className="py-3 px-4 text-right text-xs font-medium text-slate-500 uppercase">
                    Total
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-brand-600 dark:text-brand-400">
                    {formatCurrency(dayRevenue)}
                  </td>
                  <td colSpan={isAdmin ? 3 : 2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Order"
        message={`Delete the order for "${deleteTarget?.product_name}"? Stock will be restored to the product.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteOrder}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
