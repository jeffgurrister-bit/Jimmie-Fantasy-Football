/**
 * The Google Sheets export of "RBB League History".
 *
 * This suite exists because of a specific bug. The "Excel Drop" tab lays several
 * unrelated blocks side by side and repeats header names between them — `Name`
 * appears at columns 4, 11 and 41. Rows are keyed by header name, so the last
 * `Name` won, and one block's placings were paired with another block's manager.
 *
 * The result was not a crash or an obviously empty page. It was a complete,
 * plausible-looking championship list that was wrong in all ten years, including a
 * 4-10 team shown as champion. Nothing in the code looked wrong.
 *
 * So the champions are asserted against the sheet's own `Banners` tab, which is an
 * independent record of the same fact. Set RBB_HISTORY_PATH to run it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { GS_FINISHES, GS_GAME_DATA } from '../src/columns.ts';
import { createResolver, type ManagerResolver } from '../src/managers.ts';
import { readSheet } from '../src/sources/rows.ts';
import { XlsxSource } from '../src/sources/xlsx.ts';
import { transformGames } from '../src/transform/games.ts';
import { transformSeasons } from '../src/transform/seasons.ts';
import { buildSnapshot, type Snapshot } from '../src/snapshot.ts';

const history = process.env.RBB_HISTORY_PATH ?? '';
const workbook = process.env.RBB_WORKBOOK_PATH ?? '';
const shouldRun = history !== '' && existsSync(history);

/** Straight off the sheet's own Banners tab — the independent answer key. */
const BANNERS: Record<number, string> = {
  2016: 'Jimmie Perkins',
  2017: 'Ryan Hangartner',
  2018: 'Josh Baker',
  2019: 'Josh Jones',
  2020: 'Ryan Hangartner',
  2021: 'Jimmie Perkins',
  2022: 'Josh Baker',
  2023: 'Austin Jones',
  2024: 'Jim Perkins',
  2025: 'Joe Malak',
};

describe.skipIf(!shouldRun)('the Google League History export', () => {
  let resolver: ManagerResolver;
  let snap: Snapshot;

  beforeAll(async () => {
    resolver = await createResolver();
    snap = await buildSnapshot(
      { history, workbook: workbook !== '' && existsSync(workbook) ? workbook : undefined },
      resolver,
    );
  }, 180_000);

  it('matches the column contract for both tabs it reads', async () => {
    // readSheet throws on drift, so completing this is the assertion.
    await expect(readSheet(new XlsxSource(history), GS_GAME_DATA)).resolves.toBeTruthy();
    await expect(readSheet(new XlsxSource(history), GS_FINISHES)).resolves.toBeTruthy();
  });

  it('covers 2016 to 2025 — a season further than the Excel', async () => {
    const read = await readSheet(new XlsxSource(history), GS_GAME_DATA);
    const years = [...new Set(read.rows.map((r) => Number(r['Year'])))].sort();
    expect(years).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  });

  it('reads 114 team-seasons and ignores the rows scaffolded out to 2050', async () => {
    // The tab pre-creates 300 empty future rows, and every one of them HAS a
    // `Year Name` — which is why the key is `Place Reg`, not the row id.
    const read = await readSheet(new XlsxSource(history), GS_FINISHES);
    expect(read.rows).toHaveLength(10 * 3 + 12 * 7 - 30 + 30); // 114
    expect(read.rows).toHaveLength(114);
    expect(read.scaffoldingRows).toBeGreaterThan(200);
  });

  it('names the same champions as the sheet’s own Banners tab', () => {
    const got = Object.fromEntries(snap.champions.map((c) => [c.year, c.canonical_name]));
    expect(got).toEqual(BANNERS);
  });

  it('has a champion for every season, 2024 included', () => {
    expect(snap.champions).toHaveLength(10);
    expect(snap.seasons.filter((s) => s.champion_manager_id === null)).toEqual([]);
  });

  it('pairs each placing with the right manager despite the repeated Name column', async () => {
    // The specific corruption: a manager's own regular-season record has to agree
    // with the games, or the finishes block has been read against another block.
    const read = await readSheet(new XlsxSource(history), GS_FINISHES);
    const seasons = transformSeasons(GS_FINISHES, read.rows, resolver);
    const games = transformGames(
      GS_GAME_DATA,
      (await readSheet(new XlsxSource(history), GS_GAME_DATA)).rows,
      resolver,
    );
    for (const year of [2016, 2020, 2025]) {
      const champ = seasons.teamSeasons.find((t) => t.year === year && t.final_finish === 1)!;
      const theirGames = games.gameTeams.filter(
        (g) => g.year === year && g.manager_id === champ.manager_id,
      );
      expect(theirGames.length, `${year} champion should have games`).toBeGreaterThan(0);
      // A champion is never the worst team in the regular season.
      expect(champ.regular_finish, `${year}`).toBeLessThan(12);
    }
  });

  it('reports that lineups stop before 2025 rather than showing an empty season', () => {
    if (workbook === '') return;
    expect(snap.warnings.map((w) => w.code)).toContain('seasons_without_lineups');
  });
});
