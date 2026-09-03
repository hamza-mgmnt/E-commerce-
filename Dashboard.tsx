import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDateShort, getDateRange, getPastDays } from '@/lib/utils';
import { CATEGORIES } from '@/types';
import type { DailyOrder, Product, DateRangePreset } from '@/types';
import MetricCard from '@/components/MetricCard';
import BarChart from '@/components/BarChart';
import PieChart from '@/components/PieChart';
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  Trophy,
  Package,
  Calendar,
} from 'lucide-react';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

export default function Dashboard() {
  const [orders, setOrders] = useState<DailyOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState<DateRangePreset>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [chartRange, setChartRange] = useState<7 | 30>(7);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [{ data: orderData }, { data: productData }] = await Promise.all([
      supabase.from('daily_orders').select('*').order('order_date', { ascending: false }),
      supabase.from('products').select('*, variants(*)').order('product_name'),
    ]);
    setOrders((orderData as DailyOrder[]) || []);
    setProducts((productData as Product[]) || []);
    setLoading(false);
  }

  const dateRange = useMemo(() => {
    if (rangePreset === 'custom') {
      return { start: customStart, end: customEnd };
    }
    return getDateRange(rangePreset);
  }, [rangePreset, customStart, customEnd]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const d = o.order_date;
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [orders, dateRange]);

  const todayOrders = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return orders.filter((o) => o.order_date === today);
  }, [orders]);

  const todayRevenue = useMemo(
    () => todayOrders.reduce((sum, o) => sum + Number(o.total_price), 0),
    [todayOrders]
  );

  const rangeRevenue = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + Number(o.total_price), 0),
    [filteredOrders]
  );

  const rangeUnits = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + o.quantity, 0),
    [filteredOrders]
  );

  const lowStockItems = useMemo(() => {
    const items: { product_name: string; category: string; size: string; stock_quantity: number }[] = [];
    products.forEach((p) => {
      if (p.has_variants && p.variants && p.variants.length > 0) {
        p.variants.forEach((v) => {
          if (v.stock_quantity < 10) {
            items.push({
              product_name: p.product_name,
              category: p.category,
              size: v.variation_value,
              stock_quantity: v.stock_quantity,
            });
          }
        });
      } else if (p.stock_quantity < 10) {
        items.push({
          product_name: p.product_name,
          category: p.category,
          size: p.size,
          stock_quantity: p.stock_quantity,
        });
      }
    });
    return items;
  }, [products]);

  // Monthly sales
  const monthRevenue = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    return orders
      .filter((o) => o.order_date >= monthStart)
      .reduce((sum, o) => sum + Number(o.total_price), 0);
  }, [orders]);

  const monthUnits = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    return orders
      .filter((o) => o.order_date >= monthStart)
      .reduce((sum, o) => sum + o.quantity, 0);
  }, [orders]);

  // Daily revenue chart data
  const chartData = useMemo(() => {
    const days = getPastDays(chartRange);
    return days.map((day) => {
      const dayRevenue = orders
        .filter((o) => o.order_date === day)
        .reduce((sum, o) => sum + Number(o.total_price), 0);
      return { label: formatDateShort(day), value: dayRevenue };
    });
  }, [orders, chartRange]);

  // Category breakdown
  const categoryData = useMemo(() => {
    return CATEGORIES.map((cat, i) => {
      const catOrders = filteredOrders.filter((o) => o.category === cat);
      return {
        label: cat,
        value: catOrders.reduce((sum, o) => sum + o.quantity, 0),
        color: PIE_COLORS[i],
      };
    }).filter((d) => d.value > 0);
  }, [filteredOrders]);

  // Top products
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    filteredOrders.forEach((o) => {
      const key = o.product_name;
      const existing = map.get(key) || { name: key, qty: 0, revenue: 0 };
      existing.qty += o.quantity;
      existing.revenue += Number(o.total_price);
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [filteredOrders]);

  // Top sizes
  const topSizes = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((o) => {
      if (o.size) {
        map.set(o.size, (map.get(o.size) || 0) + o.quantity);
      }
    });
    return Array.from(map.entries())
      .map(([size, qty]) => ({ size, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [filteredOrders]);

  const maxProductQty = Math.max(...topProducts.map((p) => p.qty), 1);
  const maxSizeQty = Math.max(...topSizes.map((s) => s.qty), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium mr-2">
            <Calendar size={16} />
            Filter:
          </div>
          {(['today', 'yesterday', 'this_week', 'this_month', 'custom'] as DateRangePreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => setRangePreset(preset)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                rangePreset === preset
                  ? 'tab-active'
                  : 'tab-inactive'
              }`}
            >
              {preset.replace('_', ' ')}
            </button>
          ))}
          {rangePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="input-field py-1.5 text-xs" />
              <span className="text-slate-400 text-sm">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="input-field py-1.5 text-xs" />
            </div>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Today's Revenue"
          value={formatCurrency(todayRevenue)}
          icon={<DollarSign size={20} />}
          accent="brand"
          subtext={`${todayOrders.length} orders today`}
        />
        <MetricCard
          label="Today's Orders"
          value={todayOrders.length}
          icon={<ShoppingBag size={20} />}
          accent="accent"
          subtext={`${todayOrders.reduce((s, o) => s + o.quantity, 0)} units sold`}
        />
        <MetricCard
          label="Monthly Sales"
          value={formatCurrency(monthRevenue)}
          icon={<TrendingUp size={20} />}
          accent="amber"
          subtext={`${monthUnits} units this month`}
        />
        <MetricCard
          label="Low Stock Alert"
          value={lowStockItems.length}
          icon={<AlertTriangle size={20} />}
          accent="red"
          subtext={`${lowStockItems.length} items under 10 units`}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Trend */}
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Daily Revenue Trend</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {rangePreset === 'custom' ? 'Custom range' : `Last ${chartRange} days`}
              </p>
            </div>
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setChartRange(7)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  chartRange === 7 ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400'
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setChartRange(30)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  chartRange === 30 ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400'
                }`}
              >
                30 Days
              </button>
            </div>
          </div>
          <BarChart data={chartData} formatValue={formatCurrency} height={220} />
        </div>

        {/* Category Pie */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">
            Category Breakdown
          </h3>
          {categoryData.length > 0 ? (
            <PieChart data={categoryData} />
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-slate-400">
              No data for this range
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2 — Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Top Selling Products
            </h3>
          </div>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {p.name}
                    </p>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
                        style={{ width: `${(p.qty / maxProductQty) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{p.qty}</p>
                    <p className="text-xs text-slate-400">{formatCurrency(p.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">No data for this range</p>
          )}
        </div>

        {/* Top Sizes */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Package size={18} className="text-brand-500" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Top Selling Sizes
            </h3>
          </div>
          {topSizes.length > 0 ? (
            <div className="space-y-3">
              {topSizes.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.size}</p>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400"
                        style={{ width: `${(s.qty / maxSizeQty) * 100}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.qty} units</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">No data for this range</p>
          )}
        </div>
      </div>

      {/* Low Stock Table */}
      {lowStockItems.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-red-500" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Low Stock Items
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 px-3 text-xs font-medium text-slate-500 uppercase">Product</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-slate-500 uppercase">Category</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-slate-500 uppercase">Size</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-slate-500 uppercase">Stock</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((p, i) => (
                  <tr key={`${p.product_name}-${p.size}-${i}`} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200">{p.product_name}</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{p.category}</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{p.size || '—'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        p.stock_quantity === 0
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      }`}>
                        {p.stock_quantity} left
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
