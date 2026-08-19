/** Display helpers. Ordinal formatting matches the source spreadsheets. */

export function ordinal(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

export function num(v: number | string | null | undefined, digits = 1): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function int(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isNaN(n) ? '—' : Math.round(n).toLocaleString('en-US');
}

/** '.636' — win percentage the way a standings table shows it. */
export function pct(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  if (Number.isNaN(n)) return '—';
  return n.toFixed(3).replace(/^0/, '');
}

export function record(wins: number, losses: number): string {
  return `${wins}-${losses}`;
}
