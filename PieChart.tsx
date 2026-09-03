import { useMemo } from 'react';

interface PieChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

export default function PieChart({ data, size = 180 }: PieChartProps) {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);
  const radius = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;

  let cumulativeAngle = -Math.PI / 2;

  const slices = data.map((d) => {
    const angle = total > 0 ? (d.value / total) * 2 * Math.PI : 0;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return { ...d, path, percentage: total > 0 ? (d.value / total) * 100 : 0 };
  });

  return (
    <div className="flex items-center gap-6 flex-wrap justify-center">
      <svg width={size} height={size} className="flex-shrink-0">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#cbd5e1" strokeWidth="2" />
        ) : (
          slices.map((s, i) => <path key={i} d={s.path} fill={s.color} className="hover:opacity-80 transition-opacity" />)
        )}
        <circle cx={cx} cy={cy} r={radius * 0.55} fill="white" className="dark:fill-slate-900" />
        {total > 0 && (
          <text x={cx} y={cy - 5} textAnchor="middle" className="text-sm font-bold fill-slate-800 dark:fill-slate-100">
            {total}
          </text>
        )}
        {total > 0 && (
          <text x={cx} y={cy + 12} textAnchor="middle" className="text-[10px] fill-slate-400">
            orders
          </text>
        )}
      </svg>
      <div className="space-y-2">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
            <span className="text-sm text-slate-600 dark:text-slate-300">{s.label}</span>
            <span className="text-xs text-slate-400 ml-auto">
              {s.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
