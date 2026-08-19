import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { SyncError } from '../errors.ts';
import type { SheetSource } from './rows.ts';

/**
 * Reads the commissioner's Excel workbook. This is the source for the one-time
 * historical backfill of 2016-2024 — the workbook, not the Google Sheet, is the
 * real database for those years.
 */
export class XlsxSource implements SheetSource {
  readonly label: string;
  private workbook: XLSX.WorkBook | undefined;

  constructor(private readonly path: string) {
    this.label = `xlsx:${path}`;
  }

  private async load(): Promise<XLSX.WorkBook> {
    if (!this.workbook) {
      let buf: Buffer;
      try {
        buf = await readFile(this.path);
      } catch {
        throw new SyncError(`Could not open the workbook at ${this.path}.`, {
          hint:
            'Pass the path with --file, or set RBB_WORKBOOK_PATH. The workbook is not ' +
            'committed to the repository — it is large and private.',
        });
      }
      // cellDates keeps real dates as Date objects instead of Excel serials;
      // raw values everywhere else so our own parsers decide the types.
      this.workbook = XLSX.read(buf, { cellDates: true, cellNF: false, cellText: false });
    }
    return this.workbook;
  }

  async listSheets(): Promise<string[]> {
    return (await this.load()).SheetNames;
  }

  async readGrid(sheetName: string): Promise<unknown[][]> {
    const wb = await this.load();
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      throw new SyncError(`The workbook has no sheet named "${sheetName}".`, {
        sheet: sheetName,
        hint: `Sheets present: ${wb.SheetNames.join(', ')}`,
      });
    }
    // header: 1 returns arrays of raw cell values — no header inference by the
    // library, because the header row is declared in our column map instead.
    return XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
  }
}
