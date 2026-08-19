import { describe, expect, it } from 'vitest';
import { PLAYERS } from '../src/columns.ts';
import { readSheet, type SheetSource } from '../src/sources/rows.ts';

/** A source backed by a literal grid, banner rows and all. */
function gridSource(grid: unknown[][]): SheetSource {
  return {
    label: 'test',
    readGrid: async () => grid,
    listSheets: async () => ['Players'],
  };
}

describe('readSheet', () => {
  it('takes headers from the declared row, not from row 0', () => {
    // The real sheets have a title banner above the headers. Reading row 0 would
    // produce a header called "PLAYERS" and import nothing usable.
    const grid = [
      ['PLAYERS'], // banner row — index 0
      ['POS', 'Name', 'Name Count', 'Draft Count', 'Fixed'], // headers — index 1
      ['WR', 'Antonio Brown', 3, 1, null],
      ['QB', 'Josh Allen', 2, 1, null],
    ];
    return readSheet(gridSource(grid), PLAYERS).then(({ headers, rows }) => {
      expect(headers[0]).toBe('POS');
      expect(rows).toHaveLength(2);
      expect(rows[0]!['Name']).toBe('Antonio Brown');
    });
  });

  it('addresses cells by header name, so an inserted column does not shift data', async () => {
    // Same data, but with an extra ignored column moved to the front.
    const grid = [
      ['PLAYERS'],
      ['Name Count', 'POS', 'Name', 'Draft Count', 'Fixed'],
      [3, 'WR', 'Antonio Brown', 1, null],
    ];
    const { rows } = await readSheet(gridSource(grid), PLAYERS);
    expect(rows[0]!['Name']).toBe('Antonio Brown');
    expect(rows[0]!['POS']).toBe('WR');
  });

  it('skips fully blank rows, which hand-maintained sheets accumulate', async () => {
    const grid = [
      ['PLAYERS'],
      ['POS', 'Name', 'Name Count', 'Draft Count', 'Fixed'],
      ['WR', 'Antonio Brown', 3, 1, null],
      [null, null, null, null, null],
      ['', '   ', '', '', ''],
      ['QB', 'Josh Allen', 2, 1, null],
    ];
    const { rows } = await readSheet(gridSource(grid), PLAYERS);
    expect(rows).toHaveLength(2);
  });

  it('records the Excel row number for error messages', async () => {
    const grid = [
      ['PLAYERS'],
      ['POS', 'Name', 'Name Count', 'Draft Count', 'Fixed'],
      ['WR', 'Antonio Brown', 3, 1, null],
    ];
    const { rows } = await readSheet(gridSource(grid), PLAYERS);
    // Grid index 2 is row 3 as Excel numbers it.
    expect(rows[0]!.__rowNumber).toBe(3);
  });

  it('fails before reading data when a column has been renamed', async () => {
    const grid = [
      ['PLAYERS'],
      ['POS', 'Player Name', 'Name Count', 'Draft Count', 'Fixed'],
      ['WR', 'Antonio Brown', 3, 1, null],
    ];
    await expect(readSheet(gridSource(grid), PLAYERS)).rejects.toThrow(/does not match/);
    // The message has to name both what vanished and what appeared.
    await expect(readSheet(gridSource(grid), PLAYERS)).rejects.toThrow(/"Name"/);
    await expect(readSheet(gridSource(grid), PLAYERS)).rejects.toThrow(/"Player Name"/);
  });

  it('says so plainly when the header row is missing entirely', async () => {
    await expect(readSheet(gridSource([['PLAYERS']]), PLAYERS)).rejects.toThrow(
      /no row at index 1/,
    );
  });
});
