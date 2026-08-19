/**
 * End-to-end: read a workbook, validate, transform, load into a real Postgres,
 * and assert the invariants that matter — above all that the A/B duplication in
 * the source has NOT doubled anything in the database.
 *
 * Skipped unless DATABASE_URL points at a throwaway database. To run it:
 *
 *   initdb -D /tmp/pg/data -A trust -U jff
 *   pg_ctl -D /tmp/pg/data -o "-h 127.0.0.1 -p 5433" -w start
 *   createdb -h 127.0.0.1 -p 5433 -U jff jff
 *   DATABASE_URL=postgresql://jff@127.0.0.1:5433/jff PGSSL_DISABLE=1 \
 *     pnpm --filter @jff/db migrate && pnpm --filter @jff/sync test
 *
 * It writes real rows, so it refuses to run against anything that does not look
 * like a local scratch database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { closePool, query } from '@jff/db';
import { createResolver } from '../src/managers.ts';
import { runRbbSync } from '../src/run.ts';
import { XlsxSource } from '../src/sources/xlsx.ts';
import { buildWorkbook, EXPECTED } from './fixtures/build-workbook.ts';

const url = process.env.DATABASE_URL ?? '';
const isLocalScratch = /(127\.0\.0\.1|localhost)/.test(url);
const shouldRun = url !== '' && isLocalScratch;

describe.skipIf(!shouldRun)('end-to-end sync against Postgres', () => {
  let dir: string;
  let workbookPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jff-e2e-'));
    workbookPath = join(dir, 'fixture.xlsx');
    XLSX.writeFile(buildWorkbook(), workbookPath);

    // Start from empty so counts are exact rather than cumulative.
    await query(`truncate leagues, managers, players cascade`);

    const resolver = await createResolver({ allowUnconfirmed: true });
    const result = await runRbbSync({
      source: new XlsxSource(workbookPath),
      resolver,
      leagueId: 'rbb',
      sourceLabel: 'xlsx-backfill',
      trigger: 'cli',
    });
    expect(result.status, result.error ?? '').toBe('success');
  }, 60_000);

  afterAll(async () => {
    await closePool();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('deduplicates the A/B rows into one game with two sides', async () => {
    const [games] = await query<{ n: string }>('select count(*)::text n from games');
    const [teams] = await query<{ n: string }>('select count(*)::text n from game_teams');
    expect(Number(games!.n)).toBe(EXPECTED.games);
    expect(Number(teams!.n)).toBe(EXPECTED.gameTeams);
    expect(Number(teams!.n)).toBe(Number(games!.n) * 2);
  });

  it('gives every single game exactly two team rows', async () => {
    const rows = await query<{ sides: number; games: string }>(
      `select sides, count(*)::text games from
         (select game_id, count(*) sides from game_teams group by game_id) t
       group by sides`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sides).toBe(2);
  });

  it('does not double-count a manager\'s games or points', async () => {
    // The failure this guards against: 4 games per manager reported as 8.
    const rows = await query<{ manager_id: string; games: string; wins: string }>(
      `select manager_id, count(*)::text games, count(*) filter (where is_winner)::text wins
       from v_team_games group by manager_id order by manager_id`,
    );
    expect(rows).toHaveLength(EXPECTED.managers);
    for (const r of rows) {
      expect(Number(r.games), r.manager_id).toBe(EXPECTED.games / 2);
    }
    // Exactly one winner per game, so wins across the league equal games played.
    const totalWins = rows.reduce((sum, r) => sum + Number(r.wins), 0);
    expect(totalWins).toBe(EXPECTED.games);
  });

  it('loads lineups, drafts and team-seasons at their expected sizes', async () => {
    const [lineups] = await query<{ n: string }>('select count(*)::text n from lineup_slots');
    const [picks] = await query<{ n: string }>('select count(*)::text n from draft_picks');
    const [teamSeasons] = await query<{ n: string }>('select count(*)::text n from team_seasons');
    expect(Number(lineups!.n)).toBe(EXPECTED.lineupSlots);
    expect(Number(picks!.n)).toBe(EXPECTED.draftPicks);
    expect(Number(teamSeasons!.n)).toBe(EXPECTED.teamSeasons);
  });

  it('stores finishes as integers and leaves an unrecorded postseason null', async () => {
    const rows = await query<{ year: number; final_finish: number | null; raw: string | null }>(
      `select s.year, ts.final_finish, ts.raw_final_finish raw
       from team_seasons ts join seasons s on s.id = ts.season_id
       order by s.year, ts.final_finish nulls last`,
    );
    const champ = rows.find((r) => r.final_finish === 1)!;
    expect(champ.year).toBe(2016);
    expect(champ.raw).toBe('1st');
    // The fixture's second season has a blank postseason, mirroring the real
    // 2024 gap. Blank must stay null, never become 0 or last place.
    expect(rows.filter((r) => r.year === 2017).every((r) => r.final_finish === null)).toBe(true);
  });

  it('keeps divisions attached to the season that had them', async () => {
    const rows = await query<{ year: number; divisions: string }>(
      `select s.year, count(d.id)::text divisions
       from seasons s left join divisions d on d.season_id = s.id
       group by s.year order by s.year`,
    );
    expect(rows.find((r) => r.year === 2016)!.divisions).toBe('2');
    expect(rows.find((r) => r.year === 2017)!.divisions).toBe('0');
  });

  it('imports the bench metrics rather than recomputing them', async () => {
    const rows = await query<{ n: string; max: number | null }>(
      `select count(*)::text n, max(best_bench_over_starter) max
       from lineup_slots where was_started = false`,
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
    expect(Number(rows[0]!.max)).toBeCloseTo(12.5);
  });

  it('is idempotent — a second sync changes no counts', async () => {
    const snapshot = async (): Promise<string> => {
      const [r] = await query<{ s: string }>(
        `select (select count(*) from games)||'/'||(select count(*) from game_teams)||'/'||
                (select count(*) from lineup_slots)||'/'||(select count(*) from draft_picks)||'/'||
                (select count(*) from team_seasons) s`,
      );
      return r!.s;
    };
    const before = await snapshot();
    const resolver = await createResolver({ allowUnconfirmed: true });
    const again = await runRbbSync({
      source: new XlsxSource(workbookPath),
      resolver,
      leagueId: 'rbb',
      sourceLabel: 'xlsx-backfill',
      trigger: 'cron',
    });
    expect(again.status).toBe('success');
    expect(await snapshot()).toBe(before);
  }, 60_000);

  it('records every run, including the warnings, for the admin page', async () => {
    const rows = await query<{ status: string; summary: string | null; warns: number }>(
      `select status, summary, jsonb_array_length(warnings) warns
       from sync_runs order by id desc limit 1`,
    );
    expect(rows[0]!.status).toBe('success');
    expect(rows[0]!.summary).toBeTruthy();
    // The blank postseason in the fixture must surface as a warning, not vanish.
    expect(rows[0]!.warns).toBeGreaterThan(0);
  });
});
