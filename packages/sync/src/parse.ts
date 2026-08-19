import { SyncError } from './errors.ts';

/** Trims and collapses whitespace; returns null for anything empty. */
export function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

export function num(value: unknown, ctx?: { sheet: string; column: string; row: number }): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Strip thousands separators, currency, and stray whitespace, and read
  // parenthesised negatives — all three show up in hand-maintained sheets.
  const raw = String(value).trim();
  if (raw === '' || raw === '-' || raw === '#N/A' || raw === '#DIV/0!') return null;
  const negated = /^\((.*)\)$/.exec(raw);
  const body = (negated?.[1] ?? raw).replace(/[$,\s]/g, '');
  const parsed = Number.parseFloat(body);
  if (Number.isNaN(parsed)) {
    throw new SyncError(`Expected a number but found "${raw}".`, {
      ...ctx,
      hint: 'A cell that should hold a score or a count holds text. Check that row in the sheet.',
    });
  }
  return negated ? -parsed : parsed;
}

export function int(value: unknown, ctx?: { sheet: string; column: string; row: number }): number | null {
  const n = num(value, ctx);
  return n === null ? null : Math.trunc(n);
}

/**
 * The sheets spell booleans as YES/NO, and occasionally as Y/N or TRUE/FALSE.
 * Anything else is drift and raises rather than silently reading as false —
 * a mis-read `Game Played` flag would quietly add unplayed games to every total.
 */
export function yesNo(
  value: unknown,
  ctx?: { sheet: string; column: string; row: number },
): boolean | null {
  const s = str(value);
  if (s === null) return null;
  const up = s.toUpperCase();
  if (up === 'YES' || up === 'Y' || up === 'TRUE' || up === '1') return true;
  if (up === 'NO' || up === 'N' || up === 'FALSE' || up === '0') return false;
  throw new SyncError(`Expected YES or NO but found "${s}".`, {
    ...ctx,
    hint: 'Use YES or NO in this column, or tell the developer a new value is now valid.',
  });
}

const ORDINAL = /^(\d+)\s*(st|nd|rd|th)?$/i;

/**
 * '1st' -> 1, '12th' -> 12, 3 -> 3, '' -> null.
 * Finishes are ordinal strings in the source and integers in the database, so
 * that "who finished better" is a comparison rather than a string sort where
 * '10th' comes before '2nd'.
 */
export function ordinal(
  value: unknown,
  ctx?: { sheet: string; column: string; row: number },
): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  const s = str(value);
  if (s === null) return null;
  const m = ORDINAL.exec(s);
  if (!m?.[1]) {
    throw new SyncError(`Expected a finishing place like "1st" or "12th" but found "${s}".`, {
      ...ctx,
      hint: 'Finish columns must hold ordinals (1st, 2nd, 3rd, ... 12th) or be left blank.',
    });
  }
  return Number.parseInt(m[1], 10);
}

/** Formats an integer place back to its ordinal string for display. */
export function toOrdinal(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Casefolded key for alias lookup. Never used for display. */
export function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.'’`]/g, '');
}
