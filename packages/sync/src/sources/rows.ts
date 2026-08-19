import { SyncError } from '../errors.ts';
import { assertHeaders, type SheetSpec, type SourceRow } from '../schema.ts';

/**
 * A source is anything that can hand back a rectangle of cells: the Excel
 * workbook for the historical backfill, or a published Google Sheet tab for the
 * ongoing weekly sync. Both go through the same column maps and the same
 * validation, so the two paths cannot drift apart.
 */
export interface SheetSource {
  readonly label: string;
  /** Every cell as raw values, including the banner rows above the headers. */
  readGrid(sheetName: string): Promise<unknown[][]>;
  listSheets(): Promise<string[]>;
}

/**
 * Turns a raw grid into named rows using the spec's declared header row, then
 * validates the headers before a single value is read.
 *
 * The header row index is taken from the spec and never guessed. Every sheet in
 * this workbook has a title banner above its headers, and LineupData has a row
 * of loose integers at index 1 as well — reading row 0 yields headers like "5"
 * and "11" and produces a clean-looking import of complete garbage.
 */
export interface SheetRead {
  headers: string[];
  rows: SourceRow[];
  /** Fully blank rows skipped — spacer rows and trailing empties. */
  blankRows: number;
  /**
   * Rows that held something but had no value in the key column. These are the
   * formula-scaffolding rows below the real data. Counted so the run can report
   * them rather than hiding the fact that rows were skipped.
   */
  scaffoldingRows: number;
}

export async function readSheet(source: SheetSource, spec: SheetSpec): Promise<SheetRead> {
  const grid = await source.readGrid(spec.sheetName);

  const headerCells = grid[spec.headerRow];
  if (!headerCells) {
    throw new SyncError(
      `The "${spec.sheetName}" sheet has no row at index ${spec.headerRow}, where the ` +
        `column headers are expected.`,
      {
        sheet: spec.sheetName,
        hint:
          `The sheet may be empty, or rows may have been inserted or deleted above the ` +
          `header row. If a row was added above the headers, update headerRow for ` +
          `"${spec.key}" in packages/sync/src/columns.ts.`,
      },
    );
  }

  const headers = headerCells.map((c) => (c === null || c === undefined ? '' : String(c).trim()));

  // Fail before reading any data, so a renamed column produces one clear message
  // rather than thousands of null-value errors.
  assertHeaders(spec, headers);

  const keyIndex = headers.indexOf(spec.keyColumn);
  if (keyIndex === -1) {
    throw new SyncError(
      `The "${spec.sheetName}" sheet has no "${spec.keyColumn}" column, which is what ` +
        `identifies a row as real data.`,
      { sheet: spec.sheetName, column: spec.keyColumn },
    );
  }

  const rows: SourceRow[] = [];
  let blankRows = 0;
  let scaffoldingRows = 0;

  for (let r = spec.headerRow + 1; r < grid.length; r += 1) {
    const cells = grid[r];
    if (!cells) {
      blankRows += 1;
      continue;
    }
    // Skip rows that are entirely blank — hand-maintained sheets accumulate
    // trailing empties and spacer rows.
    if (cells.every((c) => c === null || c === undefined || String(c).trim() === '')) {
      blankRows += 1;
      continue;
    }
    // Skip rows that hold something but have no identity. These are the formula
    // rows dragged one past the data, holding sentinels like "__" and zeros.
    const key = cells[keyIndex];
    if (key === null || key === undefined || String(key).trim() === '') {
      scaffoldingRows += 1;
      continue;
    }

    const row: SourceRow = {};
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c];
      if (!key) continue;
      row[key] = cells[c] ?? null;
    }
    // Carry the sheet row number (1-based, as Excel shows it) for error messages.
    row.__rowNumber = r + 1;
    rows.push(row);
  }

  return { headers, rows, blankRows, scaffoldingRows };
}
