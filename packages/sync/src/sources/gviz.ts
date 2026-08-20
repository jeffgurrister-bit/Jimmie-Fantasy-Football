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

/**
 * All FIVE spreadsheets the commissioner shared — the single list, so nothing that
 * iterates them can quietly cover only some. An earlier version of the sheet probe
 * kept its own copy and silently omitted the Monte Carlo simulator.
 *
 * `key` is what the CLI and the workflow accept as an argument.
 */
export const SPREADSHEETS = [
  {
    key: 'rbb-main',
    id: '1hy6u3L3yBNlSYOb2luy1PYT1yPnFBLA4ZfdseJLKFXQ',
    league: 'rbb',
    label: 'RBB — Main League File (the live draft runs through here)',
  },
  {
    key: 'rbb-history',
    id: '1_jhoVbxloZG8lxDaDXMIkG7SEoKBfU1_2MBI4qSPRYg',
    league: 'rbb',
    label: 'RBB — League History',
  },
  {
    key: 'rbb-monte-carlo',
    id: '1z2b6-CFyY6Fvj0zwzZTyElyQKe-IGvBiazP_YoPavlY',
    league: 'rbb',
    label: 'RBB — Monte Carlo playoff simulator',
  },
  {
    key: 'rbb-power-rankings',
    id: '1YANpO-Mzht6FJpc93ul1jCHONEswHCp85Ah_rFskR4g',
    league: 'rbb',
    label: 'RBB — Power Rankings',
  },
  {
    key: 'dyno-mites',
    id: '1HHJ5uu8wu45E58-dB9pNZl-PGkU1DmZVwQfNDmI3HTw',
    league: 'dm',
    label: 'Dyno Mites — Main Doc',
  },
] as const;

export type SpreadsheetKey = (typeof SPREADSHEETS)[number]['key'];

export function spreadsheet(key: string): (typeof SPREADSHEETS)[number] | undefined {
  return SPREADSHEETS.find((s) => s.key === key);
}
