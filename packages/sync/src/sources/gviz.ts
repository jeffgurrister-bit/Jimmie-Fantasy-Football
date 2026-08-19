import { SyncError } from '../errors.ts';
import { parseCsv } from './csv.ts';
import type { SheetSource } from './rows.ts';

/**
 * Reads a publicly-shared Google Sheet tab through the gviz CSV endpoint.
 *
 * This is the ongoing weekly sync path. It needs no credentials and no service
 * account, which matters because the acceptance criterion for this project is
 * that the commissioner can keep the site current on his own — a rotating API
 * key is one more thing that can quietly expire and take the site's freshness
 * with it. The trade-off is that the sheet must stay link-shared; if sharing is
 * revoked the sync fails loudly with a message that says so.
 *
 * `headers=0` tells gviz not to interpret any row as a header, so we get the
 * full grid including the banner rows and can apply the declared header row
 * ourselves — identical treatment to the Excel path.
 */
export class GoogleSheetSource implements SheetSource {
  readonly label: string;

  constructor(
    private readonly spreadsheetId: string,
    private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
  ) {
    this.label = `gsheet:${spreadsheetId}`;
  }

  async listSheets(): Promise<string[]> {
    // gviz exposes no tab listing. Enumerating tabs — including the hidden ones
    // the commissioner uses for his formula machinery — needs the Sheets API.
    // The sync does not require a listing: every tab it reads is named in the
    // column map.
    return [];
  }

  async readGrid(sheetName: string): Promise<unknown[][]> {
    const url =
      `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/gviz/tq` +
      `?tqx=out:csv&headers=0&sheet=${encodeURIComponent(sheetName)}`;

    const doFetch = this.options.fetchImpl ?? fetch;
    const res = await doFetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 60_000),
    });

    if (!res.ok) {
      throw new SyncError(
        `Google refused to serve the "${sheetName}" tab (HTTP ${res.status}).`,
        {
          sheet: sheetName,
          hint:
            res.status === 404
              ? `There is no tab called "${sheetName}" in that spreadsheet, or the ` +
                `spreadsheet id is wrong.`
              : `The spreadsheet needs to stay shared as "Anyone with the link can view". ` +
                `Check the Share button in Google Sheets.`,
        },
      );
    }

    const text = await res.text();
    // When a sheet is not link-shared, Google serves an HTML sign-in page with a
    // 200 status rather than an error, so the body has to be checked too.
    if (text.trimStart().toLowerCase().startsWith('<!doctype html')) {
      throw new SyncError(
        `Google returned a sign-in page instead of data for the "${sheetName}" tab.`,
        {
          sheet: sheetName,
          hint:
            'The spreadsheet is no longer publicly readable. Set sharing back to ' +
            '"Anyone with the link can view".',
        },
      );
    }

    return parseCsv(text);
  }
}

/** Spreadsheet ids from the handoff notes. */
export const SPREADSHEETS = {
  rbbLeagueHistory: '1_jhoVbxloZG8lxDaDXMIkG7SEoKBfU1_2MBI4qSPRYg',
  rbbMain: '1hy6u3L3yBNlSYOb2luy1PYT1yPnFBLA4ZfdseJLKFXQ',
  rbbPowerRankings: '1YANpO-Mzht6FJpc93ul1jCHONEswHCp85Ah_rFskR4g',
  rbbMonteCarlo: '1z2b6-CFyY6Fvj0zwzZTyElyQKe-IGvBiazP_YoPavlY',
  dynoMites: '1HHJ5uu8wu45E58-dB9pNZl-PGkU1DmZVwQfNDmI3HTw',
} as const;
