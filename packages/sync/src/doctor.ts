/**
 * `pnpm doctor` — checks a deployment end to end and prints a plain report.
 *
 * Written for the moment after someone has set up Supabase and wants to know
 * whether it actually worked. It never prints the connection string or the
 * password, so the output is safe to paste into a chat when asking for help.
 */
import { closePool, isDatabaseConfigured, query } from '@jff/db';
import { createResolver } from './managers.ts';

type Status = 'ok' | 'warn' | 'fail';

interface CountRow {
  seasons: number;
  games: number;
  game_teams: number;
  lineup_slots: number;
  draft_picks: number;
  managers: number;
}

const results: Array<{ status: Status; label: string; detail?: string }> = [];

function add(status: Status, label: string, detail?: string): void {
  results.push(detail === undefined ? { status, label } : { status, label, detail });
}

/** Reports where the database is without ever revealing the credentials. */
function describeTarget(): string {
  const url = process.env.DATABASE_URL ?? '';
  try {
    const u = new URL(url);
    const port = u.port || '5432';
    const kind = u.hostname.includes('pooler.supabase')
      ? port === '6543'
        ? 'Supabase transaction pooler — correct for the deployed site'
        : 'Supabase session pooler — correct for migrations and the backfill'
      : u.hostname.startsWith('db.') && u.hostname.endsWith('.supabase.co')
        ? 'Supabase DIRECT connection — IPv6 only, prefer a pooler'
        : 'custom host';
    return `${u.hostname}:${port} (${kind})`;
  } catch {
    return 'unparseable DATABASE_URL';
  }
}

async function main(): Promise<void> {
  // --- 1. is a database configured at all -----------------------------------
  if (!isDatabaseConfigured()) {
    add('fail', 'DATABASE_URL is not set', 'Export it, or add it to Vercel and redeploy.');
    report();
    return;
  }
  add('ok', 'DATABASE_URL is set', describeTarget());

  // --- 2. can we reach it ---------------------------------------------------
  try {
    await query('select 1');
    add('ok', 'Connected to the database');
  } catch (err) {
    const msg = (err as Error).message;
    add('fail', 'Cannot connect', msg);
    if (/ENETUNREACH|ETIMEDOUT/.test(msg)) {
      add('fail', 'Looks like the IPv6 problem', 'Use the session pooler host instead.');
    } else if (/password/i.test(msg)) {
      add('fail', 'Password rejected', 'Percent-encode special characters in the password.');
    }
    report();
    return;
  }

  // --- 3. schema ------------------------------------------------------------
  const migrations = await query<{ filename: string }>(
    `select filename from schema_migrations order by filename`,
  ).catch(() => []);
  if (migrations.length === 0) {
    add('fail', 'No migrations applied', 'Run: pnpm migrate');
  } else {
    add('ok', `Schema applied — ${migrations.length} migration(s)`,
      migrations.map((m) => m.filename).join(', '));
  }

  // --- 4. data --------------------------------------------------------------
  const counts = await query<CountRow>(
    `select
       (select count(*)::int from seasons)      as seasons,
       (select count(*)::int from games)        as games,
       (select count(*)::int from game_teams)   as game_teams,
       (select count(*)::int from lineup_slots) as lineup_slots,
       (select count(*)::int from draft_picks)  as draft_picks,
       (select count(*)::int from managers)     as managers`,
  ).catch(() => []);
  const c = counts[0];

  if (!c || c.seasons === 0) {
    add('fail', 'No league data loaded', 'Run the backfill against RBB_League_History.xlsx');
  } else {
    add('ok', `Data loaded — ${c.seasons} seasons, ${c.games} games`,
      `${c.lineup_slots} lineup rows, ${c.draft_picks} draft picks, ${c.managers} managers`);

    // The one invariant worth re-checking on every deployment: the A/B
    // duplication must not have doubled anything.
    const bad = await query<{ n: number }>(
      `select count(*)::int as n from
         (select game_id from game_teams group by game_id having count(*) <> 2) t`,
    );
    if ((bad[0]?.n ?? 0) > 0) {
      add('fail', `${bad[0]!.n} game(s) do not have exactly two team rows`,
        'The A/B deduplication is off — do not trust any totals on the site.');
    } else {
      add('ok', 'Every game has exactly two team rows', 'A/B deduplication is intact');
    }

    if (c.game_teams !== c.games * 2) {
      add('fail', `game_teams (${c.game_teams}) is not twice games (${c.games})`);
    }

    const champs = await query<{ n: number }>(
      `select count(*)::int as n from team_seasons where final_finish = 1`,
    );
    add('ok', `${champs[0]?.n ?? 0} champion(s) recorded`);
  }

  // --- 5. identity map ------------------------------------------------------
  try {
    const resolver = await createResolver();
    if (resolver.isCleanForProduction) {
      add('ok', `All ${resolver.all.length} manager identities confirmed`);
    } else {
      add('warn', `${resolver.unconfirmed.length} manager identit(y/ies) unconfirmed`,
        resolver.unconfirmed.map((m) => m.display_name).join(', '));
    }
  } catch (err) {
    add('warn', 'Could not read data/managers.yaml', (err as Error).message);
  }

  // --- 6. last sync ---------------------------------------------------------
  const runs = await query<{ status: string; started_at: Date; summary: string | null }>(
    `select status, started_at, summary from sync_runs order by started_at desc limit 1`,
  ).catch(() => []);
  if (runs[0]) {
    const r = runs[0];
    add(r.status === 'success' ? 'ok' : 'warn',
      `Last sync: ${r.status} at ${new Date(r.started_at).toISOString()}`,
      r.summary?.split('\n')[0]);
  } else {
    add('warn', 'No sync has been recorded');
  }

  report();
}

function report(): void {
  const mark = { ok: '  OK  ', warn: ' WARN ', fail: ' FAIL ' };
  console.log('\nDeployment check\n');
  for (const r of results) {
    console.log(`[${mark[r.status]}] ${r.label}`);
    if (r.detail) console.log(`           ${r.detail}`);
  }
  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  console.log('');
  if (failed > 0) {
    console.log(`${failed} problem(s) to fix. See docs/OPTIONAL-DATABASE.md.`);
    process.exitCode = 1;
  } else if (warned > 0) {
    console.log(`Everything essential works. ${warned} thing(s) worth a look.`);
  } else {
    console.log('Everything checks out. The site has data and the totals are sound.');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  // Without this the open pool keeps the process alive after the report prints.
  .finally(closePool);
