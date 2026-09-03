import { ReactNode, useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Package, LayoutDashboard, ShoppingCart, Boxes, LogOut, Moon, Sun, Menu, X } from 'lucide-react';

export type PageId = 'dashboard' | 'orders' | 'products';

interface LayoutProps {
  current: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orders', label: 'Daily Orders', icon: ShoppingCart },
  { id: 'products', label: 'Products', icon: Boxes },
];

export default function Layout({ current, onNavigate, children }: LayoutProps) {
  const { profile, signOut, isAdmin } = useAuth();
  const [dark, setDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored === 'dark' || (!stored && prefersDark);
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const handleNav = (page: PageId) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-200 dark:border-slate-800">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-600 text-white">
            <Package size={20} />
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-sm">StockFlow</p>
            <p className="text-xs text-slate-400">Inventory Manager</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = current === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300">
              {profile?.full_name?.charAt(0).toUpperCase() || profile?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {profile?.full_name || 'User'}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {isAdmin ? 'Admin / Boss' : 'Manager / Entry'}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-6">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden text-slate-600 dark:text-slate-300"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 hidden sm:block">
            {NAV_ITEMS.find((n) => n.id === current)?.label}
          </h2>
          <button
            onClick={toggleDark}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-6 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}
