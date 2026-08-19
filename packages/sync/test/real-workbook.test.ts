/**
 * Verification against the commissioner's ACTUAL workbook.
 *
 * The workbook is private and not committed, so this suite skips unless you point
 * it at a copy:
 *
 *   RBB_WORKBOOK_PATH=/path/to/RBB_League_History.xlsx pnpm --filter @jff/sync test
 *
 * Every number below was observed in the real file. They are here as a regression
 * guard: if a future edit to the column maps or the transforms changes any of
 * them, that is a real behaviour change and worth knowing about.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ALL_SHEETS, DRAFT_HISTORY, FINISHES, GAME_DATA, LINEUP_DATA, PLAYERS } from '../src/columns.ts';
import { ManagerResolver, loadManagerMap } from '../src/managers.ts';
import { readSheet } from '../src/sources/rows.ts';
import { XlsxSource } from '../src/sources/xlsx.ts';
import { transformGames } from '../src/transform/games.ts';
import { transformSeasons } from '../src/transform/seasons.ts';
import { transformLineups } from '../src/transform/lineups.ts';
import { transformDrafts } from '../src/transform/drafts.ts';

const path = process.env.RBB_WORKBOOK_PATH ?? '';
const shouldRun = path !== '' && existsSync(path);

describe.skipIf(!shouldRun)('the real RBB workbook', () => {
  // Parse the 12 MB workbook once and read each sheet once. A fresh source per
  // assertion would re-parse the whole file every time.
  let src: XlsxSource;
  let resolver: ManagerResolver;
  const reads = new Map<string, Awaited<ReturnType<typeof readSheet>>>();

  beforeAll(async () => {
    src = new XlsxSource(path);
    resolver = new ManagerResolver(await loadManagerMap());
    for (const spec of ALL_SHEETS) reads.set(spec.key, await readSheet(src, spec));
  }, 120_000);

  const read = (spec: typeof GAME_DATA) => reads.get(spec.key)!;

  it('contains the five sheets the sync needs', async () => {
    const sheets = await src.listSheets();
    for (const spec of ALL_SHEETS) expect(sheets).toContain(spec.sheetName);
  });

  it('matches the column contract exactly — no missing or unexpected headers', () => {
    // readSheet throws on any drift, so every sheet having been read in beforeAll
    // is itself the assertion.
    for (const spec of ALL_SHEETS) {
      expect(read(spec).headers.length, spec.sheetName).toBeGreaterThan(0);
    }
  });

  it('has the expected number of data rows per sheet', () => {
    const counts: Array<[typeof GAME_DATA, number, number]> = [
      // [spec, data rows, scaffolding rows skipped]
      [GAME_DATA, 1608, 1],
      [LINEUP_DATA, 24668, 0],
      [DRAFT_HISTORY, 1494, 0],
      [FINISHES, 102, 0],
      // The handoff notes said 778; that figure counted the scaffolding row.
      // 777 real names, plus one row with no Name.
      [PLAYERS, 777, 1],
    ];
    for (const [spec, expectedRows, expectedScaffolding] of counts) {
      expect(read(spec).rows.length, `${spec.sheetName} data rows`).toBe(expectedRows);
      expect(read(spec).scaffoldingRows, `${spec.sheetName} scaffolding`).toBe(expectedScaffolding);
    }
  });

  it('splits GameData into 804 games from a perfectly balanced A/B column', () => {
    const result = transformGames(GAME_DATA, read(GAME_DATA).rows, resolver);
    // 804 'A' + 804 'B' = the 1,608 data rows.
    expect(result.games).toHaveLength(804);
    expect(result.gameTeams).toHaveLength(1608);
    // No imbalance, no orphans, no unrecognised sides.
    expect(result.warnings.map((w) => w.code)).toEqual([]);
  });

  it('covers nine seasons and 102 team-seasons, 10 teams then 12', () => {
    const { seasons, teamSeasons } = transformSeasons(FINISHES, read(FINISHES).rows, resolver);
    expect(seasons.map((s) => s.year)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]);
    expect(teamSeasons).toHaveLength(102);
    // 10 managers 2016-2018, 12 from 2019.
    expect(seasons.filter((s) => s.num_teams === 10).map((s) => s.year)).toEqual([2016, 2017, 2018]);
    expect(seasons.filter((s) => s.num_teams === 12)).toHaveLength(6);
  });

  it('has divisions in 2016, 2023 and 2024 only', () => {
    const { seasons } = transformSeasons(FINISHES, read(FINISHES).rows, resolver);
    const withDivisions = seasons.filter((s) => s.has_divisions).map((s) => s.year);
    expect(withDivisions).toEqual([2016, 2023, 2024]);
    expect(seasons.find((s) => s.year === 2016)!.division_names).toEqual(['Biscuits', 'Gravy']);
    expect(seasons.find((s) => s.year === 2023)!.division_names).toEqual([
      'Bun Spreaders', 'Burnt Biscuits', 'Gravy Goons',
    ]);
  });

  it('reports the champions recorded in Finishes, and 2024 having none', () => {
    const { teamSeasons, warnings } = transformSeasons(FINISHES, read(FINISHES).rows, resolver);
    const champs = teamSeasons
      .filter((t) => t.final_finish === 1)
      .map((t) => [t.year, t.manager_id] as const)
      .sort((a, b) => a[0] - b[0]);

    // Confirmed by Jimmie: "Yisha" is Josh Baker and bare "Josh" is Josh Jones.
    // So Josh Baker is a two-time champion and Josh Jones won 2019 — which is
    // exactly what the Google Banners tab said, reconciling the two sources.
    expect(champs).toEqual([
      [2016, 'jimmie-perkins'],
      [2017, 'ryan-hangartner'],
      [2018, 'josh-baker'],
      [2019, 'josh-jones'],
      [2020, 'ryan-hangartner'],
      [2021, 'jimmie-perkins'],
      [2022, 'josh-baker'],
      [2023, 'austin-jones'],
    ]);
    // Josh Baker holds two of the eight recorded titles.
    expect(champs.filter(([, id]) => id === 'josh-baker')).toHaveLength(2);
    // 2024's postseason was never fully entered.
    expect(warnings.map((w) => w.code)).toContain('season_without_champion');
  });

  it('reads 24,668 lineup rows with no Reason/slot contradictions', () => {
    const { slots, warnings } = transformLineups(LINEUP_DATA, read(LINEUP_DATA).rows, resolver);
    expect(slots).toHaveLength(24668);
    expect(warnings.map((w) => w.code)).not.toContain('lineup_started_ambiguous');

    // 13,820 starters against 10,848 bench/IR rows.
    expect(slots.filter((s) => s.was_started)).toHaveLength(13820);
    // 6,734 rows are waiver pickups with no drafting manager.
    expect(slots.filter((s) => s.drafted_by_manager_id === null)).toHaveLength(6734);
  });

  it('needs more players than the Players sheet lists', () => {
    // The Players sheet is the commissioner's working normalisation table, not an
    // exhaustive dimension: lineups and drafts reference names it does not carry.
    // Folding those in is what keeps every lineup row attached to a player.
    const sheetNames = new Set(
      read(PLAYERS).rows.map((r) => String(r['Name']).trim().toLowerCase()),
    );
    const lineupNames = new Set(
      read(LINEUP_DATA).rows
        .map((r) => String(r['Name'] ?? '').trim().toLowerCase())
        .filter((n) => n !== '' && n !== 'null'),
    );
    const missing = [...lineupNames].filter((n) => !sheetNames.has(n));
    expect(sheetNames.size).toBe(777);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('reads all 1,494 draft picks', () => {
    const { picks, warnings } = transformDrafts(DRAFT_HISTORY, read(DRAFT_HISTORY).rows, resolver);
    expect(picks).toHaveLength(1494);
    expect(warnings.map((w) => w.code)).toEqual([]);
    // "1.1" and "1.10" are different picks, which is why pick stays text.
    expect(picks.every((p) => typeof p.pick === 'string' || p.pick === null)).toBe(true);
  });

  it('resolves every manager name in every sheet through the identity map', () => {
    // 15 short names appear across the workbook. If any were unmapped, the
    // transforms above would already have thrown — this asserts the count.
    const fresh = new ManagerResolver(resolver.map);
    transformGames(GAME_DATA, read(GAME_DATA).rows, fresh);
    transformLineups(LINEUP_DATA, read(LINEUP_DATA).rows, fresh);
    transformDrafts(DRAFT_HISTORY, read(DRAFT_HISTORY).rows, fresh);
    transformSeasons(FINISHES, read(FINISHES).rows, fresh);
    expect(fresh.seen.size).toBe(15);
  });
});
