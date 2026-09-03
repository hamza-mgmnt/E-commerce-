import { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  accent?: 'brand' | 'accent' | 'amber' | 'red';
  subtext?: string;
}

const ACCENT_STYLES = {
  brand: 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400',
  accent: 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400',
  amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
};

export default function MetricCard({ label, value, icon, accent = 'brand', subtext }: MetricCardProps) {
  return (
    <div className="glass-card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
        </div>
        <div className={`p-2.5 rounded-xl ${ACCENT_STYLES[accent]}`}>{icon}</div>
      </div>
    </div>
  );
}
