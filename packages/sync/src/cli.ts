/**
 * Sync CLI.
 *
 *   pnpm check-managers                    readiness of the identity map, no DB needed
 *   pnpm backfill --file <workbook.xlsx>   one-time historical load, 2016-2024
 *   pnpm backfill --file <x> --dry-run     validate and transform, write nothing
 *   pnpm sync                              read the published Google Sheet
 *
 * Flags:
 *   --allow-unconfirmed   let unverified manager identities through (local only)
 */
import { closePool } from '@jff/db';
import { SyncError } from './errors.ts';
import { createResolver } from './managers.ts';
import { runRbbSync } from './run.ts';
import { GoogleSheetSource, SPREADSHEETS } from './sources/gviz.ts';
import { XlsxSource } from './sources/xlsx.ts';

interface Args {
  command: string;
  file?: string;
  dryRun: boolean;
  allowUnconfirmed: boolean;
  sheet?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    command: argv[0] ?? 'help',
    dryRun: argv.includes('--dry-run'),
    allowUnconfirmed: argv.includes('--allow-unconfirmed'),
  };
  const file = valueAfter(argv, '--file');
  if (file !== undefined) args.file = file;
  const sheet = valueAfter(argv, '--spreadsheet');
  if (sheet !== undefined) args.sheet = sheet;
  return args;
}

/** Reads the argument following `flag`, ignoring a flag with nothing after it. */
function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  return next === undefined || next.startsWith('--') ? undefined : next;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const resolver = await createResolver({ allowUnconfirmed: args.allowUnconfirmed });

  if (args.command === 'check-managers') {
    console.log(resolver.readinessReport());
    process.exitCode = resolver.isCleanForProduction ? 0 : 1;
    return;
  }

  if (args.command !== 'backfill' && args.command !== 'sync') {
    console.log(
      'Usage:\n' +
        '  check-managers                          check the identity map\n' +
        '  backfill --file <workbook.xlsx>         load history from Excel\n' +
        '  sync [--spreadsheet <id>]              load from the Google Sheet\n' +
        '\nFlags: --dry-run, --allow-unconfirmed',
    );
    process.exitCode = 1;
    return;
  }

  // Refuse a real write while identities are unverified, unless explicitly
  // overridden. This is the guard that keeps a guessed championship off a public
  // page, and it is deliberately annoying to bypass.
  if (!resolver.isCleanForProduction && !args.allowUnconfirmed) {
    console.error('Cannot sync yet.\n');
    console.error(resolver.readinessReport());
    console.error(
      '\nTo preview locally with unverified names: re-run with --allow-unconfirmed.',
    );
    process.exitCode = 1;
    return;
  }

  const source =
    args.command === 'backfill'
      ? new XlsxSource(
          args.file ??
            process.env.RBB_WORKBOOK_PATH ??
            (() => {
              throw new SyncError('Pass --file <path to RBB_League_History.xlsx>.');
            })(),
        )
      : new GoogleSheetSource(args.sheet ?? SPREADSHEETS.rbbLeagueHistory);

  const result = await runRbbSync({
    source,
    resolver,
    leagueId: 'rbb',
    sourceLabel: args.command === 'backfill' ? 'xlsx-backfill' : 'google-sheets',
    trigger: 'cli',
    dryRun: args.dryRun,
    onProgress: (m) => console.log(`  ${m}`),
  });

  console.log(`\n${result.summary}`);
  if (result.status === 'failed') {
    console.error(`\n${result.error}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof SyncError ? err.toString() : err);
    process.exitCode = 1;
  })
  .finally(closePool);
