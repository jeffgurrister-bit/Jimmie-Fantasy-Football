/**
 * Regenerates docs/COLUMN-CONTRACT.md from the column maps.
 *
 *   pnpm --filter @jff/sync exec tsx src/generate-contract.ts
 *
 * Generated rather than hand-written so the document cannot drift from the code
 * it describes — a stale contract is worse than none, because it is the thing
 * the commissioner will be pointed at when a column rename breaks the site.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SHEETS } from './columns.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'COLUMN-CONTRACT.md');

const lines: string[] = [
  '# Column contract',
  '',
  '<!-- GENERATED FILE — do not edit by hand.',
  '     Source: packages/sync/src/columns.ts',
  '     Regenerate: pnpm --filter @jff/sync exec tsx src/generate-contract.ts -->',
  '',
  'This is the agreement between the spreadsheets and the website.',
  '',
  '**The short version, for Jimmie:** you can add rows, add whole new years, fix',
  'values, and reorder columns whenever you like — none of that breaks anything.',
  'What breaks the site is **renaming or deleting** one of the columns listed below,',
  'or **inserting a row above the header row** on a sheet.',
  '',
  'If you do rename one, nothing silently goes wrong: the update simply refuses to',
  'run and tells you which column it can no longer find, and the site keeps showing',
  'the last good data until it is fixed.',
  '',
  '---',
  '',
];

for (const spec of ALL_SHEETS) {
  lines.push(
    `## \`${spec.sheetName}\``,
    '',
    spec.description,
    '',
    `Headers are on **row ${spec.headerRow + 1}** of the sheet (the rows above it are the`,
    'title banner). Adding or removing a row above the headers breaks this.',
    '',
    '### Columns the website reads',
    '',
    '| Column in the sheet | Read as | Type | Must have a value |',
    '| --- | --- | --- | --- |',
  );
  for (const col of spec.columns) {
    lines.push(
      `| \`${col.source}\` | \`${col.field}\` | ${col.kind} | ${col.requireValue ? '**yes**' : 'no'} |`,
    );
  }
  lines.push('');

  const noted = spec.columns.filter((c) => c.note);
  if (noted.length > 0) {
    lines.push('### Notes on particular columns', '');
    for (const col of noted) lines.push(`- **\`${col.source}\`** — ${col.note}`);
    lines.push('');
  }

  if (spec.ignored.length > 0) {
    lines.push(
      '### Columns the website deliberately ignores',
      '',
      'These are your own helper columns — formula scaffolding, lookup helpers and',
      'dedupe counters. The website knows about them and skips them. Renaming or',
      'deleting these is safe.',
      '',
      ...spec.ignored.map((i) => `- \`${i}\``),
      '',
    );
  }
  lines.push('---', '');
}

lines.push(
  '## For whoever maintains the code',
  '',
  'To change any of the above, edit `packages/sync/src/columns.ts` — that is the only',
  'file that knows the sheet header strings, and it is the only file that needs to',
  'change when a column is renamed. Then regenerate this document.',
  '',
  'Rules that hold across the whole sync:',
  '',
  '- Columns are addressed **by header name only**. There is no positional column',
  '  access anywhere, so inserting a column in Excel cannot shift fields.',
  '- Header matching is **exact**, never fuzzy. Fuzzy matching is how `Opp. Score`',
  '  ends up imported into `score`.',
  '- Header row indexes are **declared, never inferred**. Every sheet has a banner',
  '  row above its headers, and `LineupData` has a row of loose integers as well.',
  '- A missing or unexpected column **stops the run**. It never imports nulls over',
  '  real history.',
  '',
);

await writeFile(OUT, lines.join('\n'), 'utf8');
console.log(`Wrote ${OUT}`);
