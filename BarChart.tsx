import { useMemo } from 'react';

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
}

export default function BarChart({ data, height = 200, formatValue }: BarChartProps) {
  const maxVal = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);

  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / maxVal) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
              <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 dark:bg-slate-700 text-white text-xs px-2 py-1 rounded-md whitespace-nowrap z-10 pointer-events-none">
                {formatValue ? formatValue(d.value) : d.value}
              </div>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400 hover:from-brand-700 hover:to-brand-500 transition-colors min-h-[2px]"
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[10px] text-slate-400 truncate block">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
