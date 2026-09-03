import { useState, useEffect, FormEvent, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/utils';
import { CATEGORIES } from '@/types';
import type { Product, ProductVariant, Category } from '@/types';
import { Modal } from '@/components/ConfirmDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import { subscribeProducts, fetchProducts as storeFetch, invalidateProducts } from '@/lib/productsStore';
import {
  Pencil,
  Trash2,
  Search,
  Boxes,
  PackagePlus,
  AlertCircle,
  Plus,
  X,
  Layers,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react';

interface VariantForm {
  id: string;
  variation_value: string;
  sku: string;
  unit_price: string;
  stock_quantity: string;
}

interface ProductForm {
  category: Category;
  product_name: string;
  has_variants: boolean;
  variation_type: string;
  size: string;
  unit_price: string;
  stock_quantity: string;
  sku: string;
  variants: VariantForm[];
}

const EMPTY_FORM: ProductForm = {
  category: 'Mattress Topper',
  product_name: '',
  has_variants: true,
  variation_type: 'Bedding Size',
  size: '',
  unit_price: '',
  stock_quantity: '',
  sku: '',
  variants: [
    { id: 'v1', variation_value: '', sku: '', unit_price: '', stock_quantity: '' },
  ],
};

let variantCounter = 100;
function newVariant(): VariantForm {
  variantCounter++;
  return { id: `v${variantCounter}`, variation_value: '', sku: '', unit_price: '', stock_quantity: '' };
}

const COMMON_SIZES = ['Single', 'Small Double / 4FT', 'Double', 'King', 'Super King'];

export default function Products() {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<Category | 'All'>('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = subscribeProducts((data) => {
      setProducts(data);
      setLoading(false);
    });
    storeFetch();
    return unsub;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = products.filter((p) => {
    const matchesSearch =
      p.product_name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase());
    const matchesCat = filterCat === 'All' || p.category === filterCat;
    return matchesSearch && matchesCat;
  });

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, variants: [newVariant()] });
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    let variants: VariantForm[];
    if (p.variants && p.variants.length > 0) {
      variants = p.variants.map((v) => ({
        id: v.id,
        variation_value: v.variation_value,
        sku: v.sku || '',
        unit_price: String(v.unit_price),
        stock_quantity: String(v.stock_quantity),
      }));
    } else {
      variants = [{
        id: 'v1',
        variation_value: p.size || '',
        sku: p.sku || '',
        unit_price: String(p.unit_price),
        stock_quantity: String(p.stock_quantity),
      }];
    }
    setForm({
      category: p.category,
      product_name: p.product_name,
      has_variants: true,
      variation_type: p.variation_type || 'Bedding Size',
      size: '',
      unit_price: '',
      stock_quantity: '',
      sku: '',
      variants,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function addVariant() {
    setForm((prev) => ({ ...prev, variants: [...prev.variants, newVariant()] }));
  }

  function removeVariant(id: string) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.length > 1 ? prev.variants.filter((v) => v.id !== id) : prev.variants,
    }));
  }

  function updateVariant(id: string, field: keyof VariantForm, value: string) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.product_name.trim()) {
      setFormError('Product name is required');
      return;
    }

    const validVariants = form.variants.filter(
      (v) =>
        v.variation_value.trim() &&
        v.unit_price.trim() &&
        v.stock_quantity.trim()
    );
    if (validVariants.length === 0) {
      setFormError('Add at least one variation with a size name, unit price, and stock quantity.');
      return;
    }

    setSaving(true);

    try {
      const productPayload = {
        category: form.category,
        product_name: form.product_name.trim(),
        has_variants: true,
        variation_type: form.variation_type.trim() || 'Bedding Size',
        size: '',
        unit_price: 0,
        stock_quantity: 0,
        sku: '',
      };

      let productId = editing?.id;

      if (editing) {
        const { error } = await supabase.from('products').update(productPayload).eq('id', editing.id);
        if (error) throw error;
        await supabase.from('product_variants').delete().eq('product_id', editing.id);
      } else {
        const { data, error } = await supabase.from('products').insert(productPayload).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to create product');
        productId = data[0].id;
      }

      if (productId) {
        const variantPayloads = validVariants.map((v) => ({
          product_id: productId,
          variation_value: v.variation_value.trim(),
          sku: v.sku.trim(),
          unit_price: parseFloat(v.unit_price) || 0,
          stock_quantity: parseInt(v.stock_quantity) || 0,
        }));

        const { error: vError } = await supabase.from('product_variants').insert(variantPayloads);
        if (vError) throw vError;
      }

      setForm({ ...EMPTY_FORM, variants: [newVariant()] });
      setModalOpen(false);
      setToast({ type: 'success', message: editing ? 'Product updated successfully.' : 'Product added successfully.' });
      invalidateProducts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred while saving.';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await supabase.from('product_variants').delete().eq('product_id', deleteTarget.id);
      await supabase.from('products').delete().eq('id', deleteTarget.id);
      setToast({ type: 'success', message: 'Product deleted successfully.' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete product.' });
    }
    setDeleteTarget(null);
    invalidateProducts();
  }

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getProductStock(p: Product): number {
    if (p.has_variants && p.variants?.length) {
      return p.variants.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
    }
    return p.stock_quantity || 0;
  }

  function getProductPriceDisplay(p: Product): string {
    if (p.has_variants && p.variants?.length) {
      const prices = p.variants.map((v) => Number(v.unit_price) || 0).filter((pr) => pr > 0);
      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
      }
      return '—';
    }
    return p.unit_price ? formatCurrency(Number(p.unit_price)) : '—';
  }

  if (!isAdmin) {
    return (
      <div className="glass-card p-8 text-center">
        <AlertCircle className="mx-auto text-slate-400 mb-3" size={32} />
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          You need Admin access to manage the product catalog. You can view products on the Daily Orders page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border animate-scale-in ${
            toast.type === 'success'
              ? 'bg-white dark:bg-slate-800 border-emerald-200 dark:border-emerald-700'
              : 'bg-white dark:bg-slate-800 border-red-200 dark:border-red-700'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={20} className="text-emerald-500" />
          ) : (
            <AlertCircle size={20} className="text-red-500" />
          )}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search products or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-10 py-2"
              />
            </div>
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value as Category | 'All')}
              className="input-field py-2 w-auto"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <button onClick={openAdd} className="btn-primary">
            <PackagePlus size={18} />
            Add Product
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
            Loading products...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Boxes className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {search || filterCat !== 'All'
                ? 'No products match your filters.'
                : 'No products yet. Click "Add Product" to create your first one.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                  <th className="w-8"></th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Product</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Category</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Variation</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase">Price Range</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase">Stock</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const stock = getProductStock(p);
                  const isExpanded = expandedRows.has(p.id);
                  const hasVariants = !!(p.has_variants && p.variants?.length);
                  const priceDisplay = getProductPriceDisplay(p);

                  return (
                    <Fragment key={p.id}>
                      <tr
                        className={`border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                          hasVariants ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => hasVariants && toggleRow(p.id)}
                      >
                        <td className="py-3 px-2 text-center">
                          {hasVariants && (
                            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-100">
                          {p.product_name}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{p.category}</td>
                        <td className="py-3 px-4">
                          {hasVariants ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400">
                                <Layers size={12} />
                                {p.variation_type || 'Size'} ({p.variants!.length})
                              </span>
                              {p.variants!.map((v) => (
                                <span key={v.id} className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                  {v.variation_value}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">{p.size || '—'}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700 dark:text-slate-200">
                          {priceDisplay}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              stock === 0
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                : stock < 10
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  : 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-400'
                            }`}
                          >
                            {stock}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(p)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && hasVariants && (
                        <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                          <td></td>
                          <td colSpan={6} className="py-3 px-4">
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="text-left py-2 px-3 font-medium text-slate-500 uppercase">{p.variation_type || 'Size'}</th>
                                    <th className="text-left py-2 px-3 font-medium text-slate-500 uppercase">SKU</th>
                                    <th className="text-right py-2 px-3 font-medium text-slate-500 uppercase">Unit Price</th>
                                    <th className="text-right py-2 px-3 font-medium text-slate-500 uppercase">Stock</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.variants!.map((v) => (
                                    <tr key={v.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                                      <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-200">{v.variation_value}</td>
                                      <td className="py-2 px-3 text-slate-400">{v.sku || '—'}</td>
                                      <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">{formatCurrency(Number(v.unit_price) || 0)}</td>
                                      <td className="py-2 px-3 text-right">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                          (v.stock_quantity || 0) === 0
                                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                            : (v.stock_quantity || 0) < 10
                                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                              : 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-400'
                                        }`}>
                                          {v.stock_quantity || 0}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        title={editing ? 'Edit Product' : 'Add Product'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-text">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              className="input-field"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Product Name</label>
            <input
              type="text"
              value={form.product_name}
              onChange={(e) => setForm({ ...form, product_name: e.target.value })}
              placeholder="e.g. Memory Foam Topper"
              required
              className="input-field"
            />
          </div>

          {/* Variations List */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Layers size={16} className="text-brand-500" />
              Variations List
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_100px_90px_32px] gap-2 px-1">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Size Name</span>
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide text-right">Unit Price</span>
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide text-right">Stock</span>
              <span></span>
            </div>

            {/* Variant rows */}
            <div className="space-y-2">
              {form.variants.map((v) => (
                <div
                  key={v.id}
                  className="grid grid-cols-[1fr_100px_90px_32px] gap-2 items-center p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 animate-scale-in"
                >
                  <input
                    type="text"
                    value={v.variation_value}
                    onChange={(e) => updateVariant(v.id, 'variation_value', e.target.value)}
                    placeholder="e.g. Single, Double, King..."
                    className="input-field py-2 text-sm"
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={v.unit_price}
                    onChange={(e) => updateVariant(v.id, 'unit_price', e.target.value)}
                    placeholder="0.00"
                    required
                    className="input-field py-2 text-sm text-right"
                  />
                  <input
                    type="number"
                    min="0"
                    value={v.stock_quantity}
                    onChange={(e) => updateVariant(v.id, 'stock_quantity', e.target.value)}
                    placeholder="0"
                    required
                    className="input-field py-2 text-sm text-right"
                  />
                  <button
                    type="button"
                    onClick={() => removeVariant(v.id)}
                    disabled={form.variants.length <= 1}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors justify-self-center"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Quick-fill suggestions */}
            <div className="flex flex-wrap gap-1.5">
              {COMMON_SIZES.filter(
                (s) => !form.variants.some((v) => v.variation_value === s)
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const emptyRow = form.variants.find((v) => !v.variation_value.trim());
                    if (emptyRow) {
                      updateVariant(emptyRow.id, 'variation_value', s);
                    } else {
                      const nv = newVariant();
                      nv.variation_value = s;
                      setForm((prev) => ({ ...prev, variants: [...prev.variants, nv] }));
                    }
                  }}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-600 transition-colors"
                >
                  + {s}
                </button>
              ))}
            </div>

            {/* Add Size Variant button */}
            <button
              type="button"
              onClick={addVariant}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-500 dark:text-slate-400 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-900/10 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Add Size Variant
            </button>
          </div>

          {formError && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
              {formError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : editing ? 'Update' : 'Add Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.product_name}"? All variation data will also be removed. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
