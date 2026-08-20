/**
 * Looks at a Google Sheet and reports what is actually in it.
 *
 *   pnpm probe-sheet <spreadsheetId>
 *
 * WHY THIS EXISTS
 * ---------------
 * The website needs to read the commissioner's Google Sheets so that his weekly
 * routine becomes the site's update. Writing that reader needs the sheets' real
 * layout — tab names, where the headers sit, which columns exist — and the
 * environment this was developed in cannot reach docs.google.com at all.
 *
 * GitHub Actions runners can. So this runs there instead, and prints what it finds
 * into the workflow log. It is a set of eyes, not part of the sync.
 *
 * HOW IT READS THE SHEET
 * ----------------------
 * Google will export an entire spreadsheet as .xlsx from a plain URL, which is a
 * far better door than the per-tab CSV endpoint:
 *
 *   - one request for the whole document rather than one per tab
 *   - it includes HIDDEN tabs, which the CSV endpoint cannot enumerate and which
 *     the commissioner is known to use for his formula machinery
 *   - the result goes through the exact same reader as the local workbook, so
 *     whatever this reports is what the importer would genuinely see
 *
 * It requires the sheet to be link-shared ("anyone with the link can view"). If it
 * is not, Google returns a sign-in page instead of a file, and this says so rather
 * than failing obscurely.
 */
import { writeFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

/** The four spreadsheets from the handoff notes, for convenience. */
export const SHEETS: Record<string, { id: string; label: string }> = {
  'rbb-history': {
    id: '1_jhoVbxloZG8lxDaDXMIkG7SEoKBfU1_2MBI4qSPRYg',
    label: 'RBB — League History',
  },
  'rbb-main': {
    id: '1hy6u3L3yBNlSYOb2luy1PYT1yPnFBLA4ZfdseJLKFXQ',
    label: 'RBB — Main League File',
  },
  'rbb-power-rankings': {
    id: '1YANpO-Mzht6FJpc93ul1jCHONEswHCp85Ah_rFskR4g',
    label: 'RBB — Power Rankings',
  },
  'dyno-mites': {
    id: '1HHJ5uu8wu45E58-dB9pNZl-PGkU1DmZVwQfNDmI3HTw',
    label: 'Dyno Mites — Main Doc',
  },
};

const HIDDEN = ['visible', 'hidden', 'very hidden'];

export async function downloadSheet(spreadsheetId: string): Promise<Buffer> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  const res = await fetch(url, { redirect: 'follow' });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No such spreadsheet (HTTP 404) — check the id.`);
    }
    // A 403 has two causes that look identical from here: Google refusing an
    // unshared sheet, and a restricted network refusing to let the request out.
    // An earlier version tried to tell them apart from response headers and got it
    // wrong — a proxy's own refusal carries the same headers Google's does. So both
    // are named and the reader decides, which is honest and still actionable.
    throw new Error(
      `Could not download the sheet (HTTP ${res.status}). Two things cause this:\n` +
        '      1. The sheet is not link-shared — set it to "Anyone with the link\n' +
        '         can view" in Google Sheets.\n' +
        '      2. The network running this blocks docs.google.com, so the request\n' +
        '         never reached Google at all. A GitHub Actions runner does not.',
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());

  // A sign-in page comes back with a 200 and an HTML body, so the status alone is
  // not enough to tell success from "you are not allowed to see this".
  const head = buf.subarray(0, 64).toString('utf8').toLowerCase();
  if (head.includes('<!doctype html') || head.includes('<html')) {
    throw new Error(
      'Google returned a sign-in page rather than a file, which means the sheet is ' +
        'not readable without logging in. Set sharing to "Anyone with the link can view".',
    );
  }
  // .xlsx is a zip, so it starts with "PK".
  if (buf.subarray(0, 2).toString('binary') !== 'PK') {
    throw new Error(`Downloaded ${buf.byteLength} bytes that are not a spreadsheet.`);
  }
  return buf;
}

function describe(buf: Buffer, label: string): void {
  const wb = XLSX.read(buf, { cellDates: true, cellNF: false, cellText: false });

  console.log(`\n${'='.repeat(78)}`);
  console.log(`${label} — ${wb.SheetNames.length} tabs, ${(buf.byteLength / 1024).toFixed(0)} KB`);
  console.log('='.repeat(78));

  wb.SheetNames.forEach((name, i) => {
    const ws = wb.Sheets[name]!;
    const meta = wb.Workbook?.Sheets?.[i];
    const state = HIDDEN[meta?.Hidden ?? 0] ?? 'visible';
    const ref = ws['!ref'];
    if (!ref) {
      console.log(`\n--- ${name}  (${state}, empty)`);
      return;
    }
    const range = XLSX.utils.decode_range(ref);
    const rows = range.e.r - range.s.r + 1;
    const cols = range.e.c - range.s.c + 1;
    console.log(`\n--- ${name}  (${state}, ${rows} rows x ${cols} cols)`);

    // The first few rows are what identify the header row and the layout. Cells are
    // truncated so a tab full of long text does not bury the shape.
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1, raw: true, defval: null, blankrows: true,
    });
    for (let r = 0; r < Math.min(4, grid.length); r += 1) {
      const cells = (grid[r] ?? [])
        .slice(0, 14)
        .map((c) => (c === null || c === undefined ? '·' : String(c).slice(0, 16)));
      console.log(`    row${r}: ${JSON.stringify(cells)}`);
    }
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const saveTo = process.argv.includes('--save') ? 'downloaded' : null;
  const wanted = args.length > 0 ? args : Object.keys(SHEETS);

  let failures = 0;
  for (const key of wanted) {
    const entry = SHEETS[key] ?? { id: key, label: key };
    try {
      const buf = await downloadSheet(entry.id);
      describe(buf, entry.label);
      if (saveTo) {
        const file = `${saveTo}-${key}.xlsx`;
        await writeFile(file, buf);
        console.log(`\n    saved to ${file}`);
      }
    } catch (err) {
      failures += 1;
      console.log(`\n${'='.repeat(78)}`);
      console.log(`${entry.label} — COULD NOT READ`);
      console.log('='.repeat(78));
      console.log(`    ${(err as Error).message}`);
    }
  }

  console.log(
    `\n${wanted.length - failures} of ${wanted.length} spreadsheet(s) read successfully.`,
  );
  if (failures === wanted.length) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('probe-sheet.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
