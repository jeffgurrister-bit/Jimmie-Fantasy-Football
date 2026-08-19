/**
 * The snapshot's aggregations are written in TypeScript; the same aggregations
 * also exist as SQL in `@jff/db`. Two implementations of one thing can drift, and
 * a drift here means the site quietly shows different numbers from the database.
 *
 * So this compares them on real data: load the workbook into Postgres, build the
 * snapshot from the same workbook, and assert the answers match.
 *
 * Needs both a throwaway Postgres and the real workbook, and skips otherwise:
 *
 *   DATABASE_URL=postgresql://jff@127.0.0.1:5433/jff PGSSL_DISABLE=1 \
 *   RBB_WORKBOOK_PATH=/path/to/RBB_League_History.xlsx \
 *     pnpm --filter @jff/sync test
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import {
  allTimeStandings, benchRegret, champions, closePool, draftSlotPerformance,
  headToHead, managerProfile, managerSeasons, marginRecords, query, recordGames,
  seasonStandings, seasonSummaries, titleCounts,
} from '@jff/db';
import { createResolver } from '../src/managers.ts';
import { runRbbSync } from '../src/run.ts';
import { buildSnapshot, type Snapshot } from '../src/snapshot.ts';
import { XlsxSource } from '../src/sources/xlsx.ts';

const workbook = process.env.RBB_WORKBOOK_PATH ?? '';
const url = process.env.DATABASE_URL ?? '';
const shouldRun =
  workbook !== '' && existsSync(workbook) && /(127\.0\.0\.1|localhost)/.test(url);

/** Compares two numbers that came from a float sum, ignoring the last cent. */
function near(a: unknown, b: unknown, tolerance = 0.05): void {
  expect(Number(a)).toBeCloseTo(Number(b), Math.abs(tolerance) < 0.01 ? 2 : 1);
}

describe.skipIf(!shouldRun)('snapshot matches the SQL results', () => {
  let snap: Snapshot;

  beforeAll(async () => {
    const resolver = await createResolver();

    // Load the same workbook into Postgres…
    await query('truncate leagues, managers, players cascade').catch(() => {});
    const loaded = await runRbbSync({
      source: new XlsxSource(workbook),
      resolver,
      leagueId: 'rbb',
      sourceLabel: 'xlsx-backfill',
      trigger: 'cli',
    });
    expect(loaded.status, loaded.error ?? '').toBe('success');

    // …and build the snapshot from it.
    snap = await buildSnapshot(workbook, resolver);
  }, 180_000);

  it('agrees on the league totals', async () => {
    const [row] = await query<{ seasons: number; games: number; lineups: number; picks: number }>(
      `select
         (select count(*)::int from seasons) as seasons,
         (select count(*)::int from games) as games,
         (select count(*)::int from lineup_slots) as lineups,
         (select count(*)::int from draft_picks) as picks`,
    );
    expect(snap.totals.seasons).toBe(row!.seasons);
    expect(snap.totals.games).toBe(row!.games);
    expect(snap.totals.draft_picks).toBe(row!.picks);
    // The snapshot counts every lineup row it read; the database stores only those
    // it could attach to a game, so the database figure is the floor.
    expect(snap.totals.lineup_rows).toBeGreaterThanOrEqual(row!.lineups);
  });

  it('agrees on the champions, in the same order', async () => {
    const sql = await champions('rbb');
    expect(snap.champions.map((c) => [c.year, c.manager_id])).toEqual(
      sql.map((c) => [c.year, c.manager_id]),
    );
  });

  it('agrees on the title counts', async () => {
    const sql = await titleCounts('rbb');
    expect(snap.titleCounts.map((t) => [t.manager_id, t.titles, t.years])).toEqual(
      sql.map((t) => [t.manager_id, t.titles, t.years]),
    );
  });

  it('agrees on the all-time regular-season standings', async () => {
    const sql = await allTimeStandings('rbb', 'Regular');
    expect(snap.standings.regular).toHaveLength(sql.length);
    // Order matters: this is the table on the front page.
    expect(snap.standings.regular.map((r) => r.manager_id)).toEqual(
      sql.map((r) => r.manager_id),
    );
    for (const [i, row] of snap.standings.regular.entries()) {
      const other = sql[i]!;
      expect(row.games, row.manager_id).toBe(other.games);
      expect(row.wins, row.manager_id).toBe(other.wins);
      expect(row.losses, row.manager_id).toBe(other.losses);
      expect(row.titles, row.manager_id).toBe(other.titles);
      near(row.points_for, other.points_for);
      near(row.points_against, other.points_against);
      near(row.ppg, other.ppg);
      near(row.win_pct, other.win_pct, 0.001);
    }
  });

  it('agrees on the all-games standings too', async () => {
    const sql = await allTimeStandings('rbb', 'all');
    expect(snap.standings.all.map((r) => [r.manager_id, r.wins, r.losses])).toEqual(
      sql.map((r) => [r.manager_id, r.wins, r.losses]),
    );
  });

  it('agrees on the season summaries', async () => {
    const sql = await seasonSummaries('rbb');
    expect(snap.seasons.map((s) => [s.year, s.games, s.champion_manager_id, s.has_divisions])).toEqual(
      sql.map((s) => [s.year, s.games, s.champion_manager_id, s.has_divisions]),
    );
    for (const [i, s] of snap.seasons.entries()) near(s.high_score, sql[i]!.high_score);
  });

  it('agrees on every season’s standings', async () => {
    for (const season of snap.seasons) {
      const sql = await seasonStandings('rbb', season.year);
      const mine = snap.seasonStandings[String(season.year)]!;
      expect(mine.map((r) => r.manager_id), `${season.year} order`).toEqual(
        sql.map((r) => r.manager_id),
      );
      for (const [i, row] of mine.entries()) {
        const other = sql[i]!;
        expect(row.wins, `${season.year} ${row.manager_id}`).toBe(other.wins);
        expect(row.losses, `${season.year} ${row.manager_id}`).toBe(other.losses);
        expect(row.final_finish, `${season.year} ${row.manager_id}`).toBe(other.final_finish);
        expect(row.division_name ?? null).toBe(other.division_name ?? null);
        near(row.points_for, other.points_for);
      }
    }
  });

  it('agrees on every manager’s profile and head-to-head', async () => {
    for (const id of Object.keys(snap.managers)) {
      const sql = await managerProfile('rbb', id);
      const mine = snap.managers[id]!.profile;
      expect(sql, id).toBeDefined();
      expect(mine.games, id).toBe(sql!.games);
      expect(mine.wins, id).toBe(sql!.wins);
      expect(mine.losses, id).toBe(sql!.losses);
      expect(mine.titles, id).toBe(sql!.titles);
      expect(mine.seasons, id).toBe(sql!.seasons);
      near(mine.points_for, sql!.points_for);
      near(mine.best_game, sql!.best_game);
      near(mine.worst_game, sql!.worst_game);

      const h2hSql = await headToHead('rbb', id);
      const h2hMine = snap.managers[id]!.headToHead;
      expect(h2hMine.map((h) => [h.opponent_manager_id, h.games, h.wins, h.losses])).toEqual(
        h2hSql.map((h) => [h.opponent_manager_id, h.games, h.wins, h.losses]),
      );

      const seasonsSql = await managerSeasons('rbb', id);
      const seasonsMine = snap.managers[id]!.seasons;
      expect(seasonsMine.map((s) => [s.year, s.wins, s.losses]), id).toEqual(
        seasonsSql.map((s) => [s.year, s.wins, s.losses]),
      );
    }
  });

  it('agrees on the records book', async () => {
    const careerHigh = await recordGames('rbb', 'career_high', 20);
    expect(snap.records.careerHigh.map((r) => [r.manager_id, r.year, r.week])).toEqual(
      careerHigh.map((r) => [r.manager_id, r.year, r.week]),
    );

    const blowouts = await marginRecords('rbb', 'blowout', 10);
    expect(snap.records.blowouts.map((r) => [r.manager_id, r.year, r.week])).toEqual(
      blowouts.map((r) => [r.manager_id, r.year, r.week]),
    );

    const nailbiters = await marginRecords('rbb', 'nailbiter', 10);
    expect(snap.records.nailbiters.map((r) => [r.manager_id, r.year, r.week])).toEqual(
      nailbiters.map((r) => [r.manager_id, r.year, r.week]),
    );
  });

  it('agrees on the bench-regret leaderboard', async () => {
    const sql = await benchRegret('rbb', 25);
    expect(snap.benchRegret).toHaveLength(sql.length);
    for (const [i, row] of snap.benchRegret.entries()) {
      const other = sql[i]!;
      expect(row.manager_id, `row ${i}`).toBe(other.manager_id);
      expect(row.year, `row ${i}`).toBe(other.year);
      expect(row.week, `row ${i}`).toBe(other.week);
      expect(row.player_name, `row ${i}`).toBe(other.player_name);
      near(row.bench_gap, other.bench_gap);
    }
  });

  it('agrees on draft-slot performance', async () => {
    const sql = await draftSlotPerformance('rbb');
    expect(snap.draftSlots.map((d) => [d.draft_slot, d.games, d.wins])).toEqual(
      sql.map((d) => [d.draft_slot, d.games, d.wins]),
    );
  });

  it('closes the pool', async () => {
    await closePool();
  });
});
