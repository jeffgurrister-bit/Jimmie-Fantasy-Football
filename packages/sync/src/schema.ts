import { SyncError } from './errors.ts';
import { highLow, int, num, ordinal, str, yesNo } from './parse.ts';

/** How a source cell is turned into a database value. */
export type CellKind =
  | 'string'
  | 'int'
  | 'number'
  | 'yesno'
  | 'ordinal'
  /** "HIGH" / "LOW" / blank marker columns, read as a flag. */
  | 'highlow'
  /** Kept verbatim as text. Used where we do not yet know the value domain. */
  | 'raw';

export interface ColumnSpec {
  /** The EXACT header string as it appears in the sheet, spaces and all. */
  readonly source: string;
  /** snake_case name used everywhere downstream. */
  readonly field: string;
  readonly kind: CellKind;
  /** Raise if this column is missing a value on any row. */
  readonly requireValue?: boolean;
  /**
   * Words this column uses to mean "no value", matched case-insensitively and
   * read as null.
   *
   * The sheets say things like "Undrafted" in a round-number column and "Bye" in
   * a points column. Those are meaningful, not errors — but they are not numbers.
   * Declaring them here keeps genuinely unexpected text failing loudly instead of
   * widening the number parser until it swallows everything.
   */
  readonly sentinels?: readonly string[];
  readonly note?: string;
}

export interface SheetSpec {
  readonly key: string;
  /** Sheet/tab name in the workbook. */
  readonly sheetName: string;
  /**
   * Zero-indexed row holding the real headers. NOT zero for any sheet in this
   * workbook — each one has a title banner above the headers, and LineupData
   * also has a row of loose integers. Reading row 0 produces silent garbage.
   */
  readonly headerRow: number;
  /**
   * The header whose value identifies a row as real data.
   *
   * Needed because the sheets carry formula scaffolding below the data: GameData's
   * last row holds `ID = "__"`, `YEAR_WK = "_"` and zeros, dragged one row past
   * the real games. Such rows are not blank, so "skip blank rows" does not catch
   * them, and importing one adds a phantom game to the site.
   *
   * Rows with no value here are skipped and counted, never silently dropped.
   */
  readonly keyColumn: string;
  readonly columns: readonly ColumnSpec[];
  /**
   * Headers we expect to see and deliberately do not import: Excel string
   * surgery, lookup helpers, dedupe counters. Listed explicitly so that a
   * genuinely NEW column still trips the drift check.
   */
  readonly ignored: readonly string[];
  readonly description: string;
}

export interface ValidationResult {
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
}

/**
 * Compares the headers actually present against the spec.
 *
 * Both directions matter. A missing column means the sync would import nulls
 * over real data. An unexpected column means the commissioner added something
 * the site does not know about — which is not itself an error in his workflow,
 * but it IS a signal that the sheet moved, and the whole point of this contract
 * is that the failure mode is a clear message rather than quietly wrong records
 * on a public website.
 */
export function validateHeaders(spec: SheetSpec, actual: readonly string[]): ValidationResult {
  const seen = new Set(actual.map((h) => h.trim()));
  const known = new Set<string>([
    ...spec.columns.map((c) => c.source),
    ...spec.ignored,
  ]);

  const missing = spec.columns.filter((c) => !seen.has(c.source)).map((c) => c.source);
  const unexpected = [...seen].filter(
    (h) =>
      h !== '' &&
      !known.has(h) &&
      // xlsx names blank header cells __EMPTY, __EMPTY_1, ... Trailing blank
      // columns are an artefact of the file, not a schema change.
      !/^__EMPTY(_\d+)?$/.test(h),
  );

  return { missing, unexpected };
}

/** Validates and raises a message aimed at whoever changed the sheet. */
export function assertHeaders(spec: SheetSpec, actual: readonly string[]): void {
  const { missing, unexpected } = validateHeaders(spec, actual);
  if (missing.length === 0 && unexpected.length === 0) return;

  const parts: string[] = [`The "${spec.sheetName}" sheet does not match what the website expects.`];
  if (missing.length > 0) {
    parts.push(
      `\n  These columns are GONE (renamed, deleted, or moved to another sheet):\n` +
        missing.map((m) => `    - "${m}"`).join('\n'),
    );
  }
  if (unexpected.length > 0) {
    parts.push(
      `\n  These columns are NEW and the website does not know what to do with them:\n` +
        unexpected.map((u) => `    - "${u}"`).join('\n'),
    );
  }
  throw new SyncError(parts.join(''), {
    sheet: spec.sheetName,
    hint:
      `Either restore the old column names in the sheet, or update the map for ` +
      `"${spec.key}" in packages/sync/src/columns.ts. Nothing else in the codebase ` +
      `needs to change. Until then the site keeps showing the last good data ` +
      `rather than importing blanks.`,
  });
}

export type SourceRow = Record<string, unknown>;
export type MappedRow = Record<string, string | number | boolean | null>;

/**
 * Maps one source row through a sheet spec. Access is by header name only —
 * there is no positional column access anywhere in this codebase, because
 * inserting a column in Excel would silently shift every field by one.
 */
export function mapRow(spec: SheetSpec, row: SourceRow, rowIndex: number): MappedRow {
  const out: MappedRow = {};
  for (const col of spec.columns) {
    const raw = row[col.source];
    const ctx = { sheet: spec.sheetName, column: col.source, row: rowIndex };

    // A declared sentinel means "no value" — checked before parsing, so the
    // number parser never sees it.
    if (col.sentinels && raw !== null && raw !== undefined) {
      const asText = String(raw).trim().toLowerCase();
      if (col.sentinels.some((sn) => sn.toLowerCase() === asText)) {
        if (col.requireValue) {
          throw new SyncError(`Required value is "${String(raw).trim()}".`, {
            ...ctx,
            hint: `"${col.source}" must hold a real value on every row.`,
          });
        }
        out[col.field] = null;
        continue;
      }
    }

    let value: string | number | boolean | null;
    switch (col.kind) {
      case 'string':
      case 'raw':
        value = str(raw);
        break;
      case 'int':
        value = int(raw, ctx);
        break;
      case 'number':
        value = num(raw, ctx);
        break;
      case 'yesno':
        value = yesNo(raw, ctx);
        break;
      case 'ordinal':
        value = ordinal(raw, ctx);
        break;
      case 'highlow':
        value = highLow(raw, ctx);
        break;
    }
    if (col.requireValue && value === null) {
      throw new SyncError(`Required value is empty.`, {
        ...ctx,
        hint: `Every row needs a value in "${col.source}". Row ${rowIndex} is blank.`,
      });
    }
    out[col.field] = value;
  }
  return out;
}
