export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function getDateRange(preset: string): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { start: today.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const ys = y.toISOString().split('T')[0];
      return { start: ys, end: ys };
    }
    case 'this_week': {
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      return { start: monday.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
    }
    case 'this_month': {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: firstOfMonth.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
    }
    default:
      return { start: today.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
  }
}

export function getPastDays(days: number): string[] {
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().split('T')[0]);
  }
  return result;
}

export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportToPDF(title: string, headers: string[], rows: (string | number)[][]) {
  const win = window.open('', '_blank');
  if (!win) return;

  const tableRows = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${String(cell ?? '')}</td>`)
          .join('')}</tr>`
    )
    .join('');

  win.document.write(`
    <!doctype html><html><head><title>${title}</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; margin: 40px; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { text-align: left; padding: 10px 12px; background: #f8fafc; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #334155; }
    </style>
    </head><body>
    <h1>${title}</h1>
    <div class="meta">Generated on ${new Date().toLocaleString('en-GB')}</div>
    <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody></table>
    </body></html>
  `);
  win.document.close();
  win.print();
}
