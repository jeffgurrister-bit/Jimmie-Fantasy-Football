/**
 * Builds a page-ready JSON snapshot straight from the workbook — no database.
 *
 *   pnpm snapshot --file RBB_League_History.xlsx
 *
 * WHY THIS EXISTS
 * ---------------
 * Everything the site currently shows is small: nine seasons of standings,
 * champions, per-season results and a top-25 bench list add up to a few hundred
 * kilobytes. Precomputing that at build time means the deployed site needs no
 * database, no connection string and no environment variables — which is a much
 * lower-maintenance thing to hand over.
 *
 * The database path is not going away. The lineup explorer, which filters all
 * 24,668 roster rows live, genuinely needs indexed queries and is what Postgres
 * is for. This snapshot covers the pages that do not.
 *
 * SHAPES ARE BORROWED, NOT REDEFINED
 * ----------------------------------
 * Every function here returns one of the interfaces exported by `@jff/db`, the
 * same ones the SQL queries return. That is deliberate: if the two ever disagree
 * about a field, this file stops compiling. `test/snapshot-parity.test.ts` goes
 * further and checks the computed VALUES against the equivalent SQL.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  BenchRegret, ChampionRow, DraftSlotRow, GameRow, HeadToHead, LeagueTotals,
  ManagerProfile, ManagerSeason, PowerRankingRow, RecordGame, SeasonStanding,
  SeasonSummary, StandingRow, TitleCount,
} from '@jff/db';
import {
  DRAFT_HISTORY, FINISHES, GAME_DATA, GS_FINISHES, GS_GAME_DATA, LINEUP_DATA, PLAYERS,
  PR_ALL_WEEKS,
} from './columns.ts';
import { SyncError } from './errors.ts';
import { createResolver, type ManagerResolver } from './managers.ts';
import { readSheet } from './sources/rows.ts';
import { XlsxSource } from './sources/xlsx.ts';
import { transformDrafts } from './transform/drafts.ts';
import { transformGames, type GameTeamRecord } from './transform/games.ts';
import { transformLineups } from './transform/lineups.ts';
import { transformPowerRankings } from './transform/power-rankings.ts';
import { transformSeasons } from './transform/seasons.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SNAPSHOT_PATH = join(REPO_ROOT, 'apps', 'rbb', 'data', 'snapshot.json');

/** Everything the site reads. One file, committed, no runtime dependencies. */
export interface Snapshot {
  generatedAt: string;
  leagueId: 'rbb';
  leagueName: string;
  totals: LeagueTotals;
  champions: ChampionRow[];
  titleCounts: TitleCount[];
  standings: { regular: StandingRow[]; all: StandingRow[] };
  seasons: SeasonSummary[];
  seasonStandings: Record<string, SeasonStanding[]>;
  seasonGames: Record<string, GameRow[]>;
  managers: Record<
    string,
    { profile: ManagerProfile; seasons: ManagerSeason[]; headToHead: HeadToHead[] }
  >;
  records: {
    careerHigh: RecordGame[];
    careerLow: RecordGame[];
    blowouts: RecordGame[];
    nailbiters: RecordGame[];
  };
  benchRegret: BenchRegret[];
  draftSlots: DraftSlotRow[];
  /** Weekly power rankings by season, newest week first within each. */
  powerRankings: Record<string, PowerRankingRow[]>;
  /** Non-fatal things the run noticed, shown on the site's about page. */
  warnings: Array<{ code: string; message: string }>;
}

/** A team-game flattened the way the aggregations below want it. */
interface TeamGame {
  year: number;
  week: number;
  timeOfSeason: string;
  roundGame: string | null;
  managerId: string;
  opponentManagerId: string | null;
  score: number | null;
  opponentScore: number | null;
  projectedScore: number | null;
  isWinner: boolean | null;
  pointDiff: number | null;
  draftedFrom: number | null;
  isHomeSide: boolean;
  gameKey: string;
  careerHigh: boolean;
  careerLow: boolean;
  seasonHigh: boolean;
  seasonLow: boolean;
  wasPlayed: boolean;
  divisionName: string | null;
}

function n(v: unknown): number | null {
  return typeof v === 'number' ? v : v === null || v === undefined || v === '' ? null : Number(v);
}
function b(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}
function sum(xs: Array<number | null>): number {
  return xs.reduce<number>((total, x) => total + (x ?? 0), 0);
}
function round(v: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export interface SnapshotSources {
  /**
   * The Excel workbook. The only source of lineup data, so bench regret and
   * anything roster-level comes from here. Optional when `history` is given: the
   * scheduled update reads Google alone, and lineups are historical and unchanging
   * anyway.
   */
  workbook?: string | undefined;
  /**
   * The Google Sheets export of "RBB League History", if available.
   *
   * Preferred for games and season finishes because it is ahead of the workbook: it
   * carries 2025, and it has every playoff placing filled in including 2024's,
   * which are blank in the Excel. Omit it and everything falls back to the
   * workbook — the site simply stops at 2024 and 2024 has no champion.
   */
  history?: string | undefined;
  /**
   * The Power Rankings Google export. Optional — without it the rankings pages are
   * simply absent rather than the build failing.
   */
  powerRankings?: string | undefined;
}

export async function buildSnapshot(
  sources: SnapshotSources | string,
  resolver: ManagerResolver,
): Promise<Snapshot> {
  // A bare path still means "just the workbook", which keeps existing callers
  // and the parity test working.
  const paths: SnapshotSources = typeof sources === 'string' ? { workbook: sources } : sources;
  if (!paths.workbook && !paths.history) {
    throw new Error('buildSnapshot needs at least one of `workbook` or `history`.');
  }
  const workbook = paths.workbook ? new XlsxSource(paths.workbook) : null;
  const history = paths.history ? new XlsxSource(paths.history) : null;
  const rankingsBook = paths.powerRankings ? new XlsxSource(paths.powerRankings) : null;
  const warnings: Array<{ code: string; message: string }> = [];

  // Games and finishes come from whichever source is further ahead.
  const gameSpec = history ? GS_GAME_DATA : GAME_DATA;
  const finishSpec = history ? GS_FINISHES : FINISHES;
  const seasonSource = history ?? workbook!;

  const [gameData, finishesData] = await Promise.all([
    readSheet(seasonSource, gameSpec),
    readSheet(seasonSource, finishSpec),
  ]);

  // Lineups and drafts live only in the workbook. Players is read but not carried
  // into the snapshot — the pages that need a player's name get it from the
  // bench-regret rows — but reading it means a rename there is still caught.
  const [lineupData, draftData] = workbook
    ? await Promise.all([
        readSheet(workbook, LINEUP_DATA),
        readSheet(workbook, DRAFT_HISTORY),
        readSheet(workbook, PLAYERS),
      ])
    : [null, null];

  const rankingsData = rankingsBook ? await readSheet(rankingsBook, PR_ALL_WEEKS) : null;
  const rankingsResult = rankingsData
    ? transformPowerRankings(PR_ALL_WEEKS, rankingsData.rows, resolver)
    : { rankings: [], warnings: [] };

  const seasonsResult = transformSeasons(finishSpec, finishesData.rows, resolver);
  const gamesResult = transformGames(gameSpec, gameData.rows, resolver);
  const lineupsResult = lineupData
    ? transformLineups(LINEUP_DATA, lineupData.rows, resolver)
    : { slots: [], warnings: [] };
  const draftsResult = draftData
    ? transformDrafts(DRAFT_HISTORY, draftData.rows, resolver)
    : { picks: [], warnings: [] };

  for (const w of [
    ...seasonsResult.warnings, ...gamesResult.warnings,
    ...lineupsResult.warnings, ...draftsResult.warnings, ...rankingsResult.warnings,
  ]) {
    warnings.push({ code: w.code, message: w.message });
  }

  const displayName = (id: string): string => resolver.get(id)?.display_name ?? id;
  const canonicalName = (id: string): string => resolver.get(id)?.canonical_name ?? id;

  // Games are keyed so a team-game can find its opponent's row.
  const gameByKey = new Map(gamesResult.games.map((g) => [g.source_key, g]));

  const teamGames: TeamGame[] = gamesResult.gameTeams.map((gt: GameTeamRecord) => {
    const game = gameByKey.get(gt.game_source_key)!;
    return {
      year: gt.year,
      week: game.week,
      timeOfSeason: game.time_of_season,
      roundGame: game.round_game,
      managerId: gt.manager_id,
      opponentManagerId: gt.opponent_manager_id,
      score: n(gt.score),
      opponentScore: n(gt.opponent_score),
      projectedScore: n(gt.projected_score),
      // The source writes W as 1/0 rather than a boolean.
      isWinner: gt.wins === null || gt.wins === undefined ? null : Number(gt.wins) > 0,
      pointDiff: n(gt.point_diff),
      draftedFrom: n(gt.drafted_from),
      isHomeSide: gt.is_home_side,
      gameKey: gt.game_source_key,
      careerHigh: b(gt.career_high),
      careerLow: b(gt.career_low),
      seasonHigh: b(gt.season_high),
      seasonLow: b(gt.season_low),
      wasPlayed: game.was_played,
      divisionName: (gt.division as string | null) ?? null,
    };
  });

  if (!workbook) {
    warnings.push({
      code: 'no_workbook',
      message:
        'Built from the Google export alone, which holds no lineup or draft data, so ' +
        'bench regret and the draft pages come from the last uploaded workbook rather ' +
        'than from this run.',
    });
  } else if (history) {
    const lineupYears = new Set(lineupsResult.slots.map((s) => s.year));
    const gameYears = [...new Set(gamesResult.gameTeams.map((g) => g.year))].sort();
    const without = gameYears.filter((y) => !lineupYears.has(y));
    if (without.length > 0) {
      warnings.push({
        code: 'seasons_without_lineups',
        message:
          `Games are loaded for ${without.join(', ')} but the workbook has no lineup ` +
          `rows for ${without.length === 1 ? 'that season' : 'those seasons'}, so bench ` +
          `regret and roster detail stop before ${without[0]}.`,
      });
    }
  }

  const played = teamGames.filter((t) => t.wasPlayed);
  const teamSeasons = seasonsResult.teamSeasons;
  const seasonYears = seasonsResult.seasons.map((s) => s.year);

  // ---- champions -----------------------------------------------------------
  const championSeasons = teamSeasons.filter((t) => t.final_finish === 1);
  const champions: ChampionRow[] = championSeasons
    .map((t) => ({
      year: t.year,
      manager_id: t.manager_id,
      display_name: displayName(t.manager_id),
      canonical_name: canonicalName(t.manager_id),
      regular_finish: t.regular_finish,
      score_for: round(
        sum(teamGames.filter((g) => g.year === t.year && g.managerId === t.manager_id).map((g) => g.score)),
        2,
      ),
    }))
    .sort((a, b2) => b2.year - a.year);

  const titlesByManager = new Map<string, number[]>();
  for (const t of championSeasons) {
    titlesByManager.set(t.manager_id, [...(titlesByManager.get(t.manager_id) ?? []), t.year]);
  }
  const titleCounts: TitleCount[] = [...titlesByManager.entries()]
    .map(([id, years]) => ({
      manager_id: id,
      display_name: displayName(id),
      canonical_name: canonicalName(id),
      titles: years.length,
      years: years.sort((a, b2) => a - b2).join(', '),
    }))
    .sort(
      (a, b2) =>
        b2.titles - a.titles ||
        a.display_name.localeCompare(b2.display_name) ||
        a.manager_id.localeCompare(b2.manager_id),
    );

  // ---- all-time standings --------------------------------------------------
  const buildStandings = (scope: 'Regular' | 'all'): StandingRow[] => {
    const pool = played.filter((t) => scope === 'all' || t.timeOfSeason === 'Regular');
    const byManager = new Map<string, TeamGame[]>();
    for (const t of pool) {
      byManager.set(t.managerId, [...(byManager.get(t.managerId) ?? []), t]);
    }
    return [...byManager.entries()]
      .map(([id, gs]) => {
        const league = resolver.leagueEntry(id, 'rbb');
        const wins = gs.filter((g) => g.isWinner === true).length;
        const losses = gs.filter((g) => g.isWinner === false).length;
        const pf = sum(gs.map((g) => g.score));
        return {
          manager_id: id,
          display_name: displayName(id),
          canonical_name: canonicalName(id),
          is_active: league?.active ?? true,
          is_confirmed: resolver.get(id)?.confirmed ?? false,
          first_year: league?.first_year ?? null,
          last_year: league?.last_year ?? null,
          games: gs.length,
          wins,
          losses,
          win_pct: gs.length > 0 ? round(wins / gs.length, 4) : 0,
          points_for: round(pf, 2),
          points_against: round(sum(gs.map((g) => g.opponentScore)), 2),
          ppg: gs.length > 0 ? round(pf / gs.length, 1) : 0,
          titles: titlesByManager.get(id)?.length ?? 0,
          playoff_games: gs.filter((g) => g.timeOfSeason !== 'Regular').length,
        } satisfies StandingRow;
      })
      .sort(
        (a, b2) =>
          b2.wins - a.wins ||
          b2.win_pct - a.win_pct ||
          b2.points_for - a.points_for ||
          a.manager_id.localeCompare(b2.manager_id),
      );
  };

  // ---- seasons -------------------------------------------------------------
  const seasons: SeasonSummary[] = seasonsResult.seasons
    .map((s) => {
      const champ = championSeasons.find((t) => t.year === s.year);
      const scores = teamGames.filter((g) => g.year === s.year).map((g) => g.score ?? 0);
      return {
        year: s.year,
        num_teams: s.num_teams,
        has_divisions: s.has_divisions,
        champion_display_name: champ ? displayName(champ.manager_id) : null,
        champion_manager_id: champ?.manager_id ?? null,
        games: gamesResult.games.filter((g) => g.year === s.year).length,
        high_score: scores.length > 0 ? round(Math.max(...scores), 2) : null,
      } satisfies SeasonSummary;
    })
    .sort((a, b2) => b2.year - a.year);

  const seasonStandings: Record<string, SeasonStanding[]> = {};
  const seasonGames: Record<string, GameRow[]> = {};

  for (const year of seasonYears) {
    seasonStandings[String(year)] = teamSeasons
      .filter((t) => t.year === year)
      .map((t) => {
        const gs = played.filter(
          (g) => g.year === year && g.managerId === t.manager_id && g.timeOfSeason === 'Regular',
        );
        return {
          manager_id: t.manager_id,
          display_name: displayName(t.manager_id),
          division_name: t.division,
          wins: gs.filter((g) => g.isWinner === true).length,
          losses: gs.filter((g) => g.isWinner === false).length,
          points_for: round(sum(gs.map((g) => g.score)), 2),
          points_against: round(sum(gs.map((g) => g.opponentScore)), 2),
          regular_finish: t.regular_finish,
          final_finish: t.final_finish,
          made_finals: t.made_finals,
          draft_slot: t.draft_slot,
        } satisfies SeasonStanding;
      })
      .sort(
        (a, b2) =>
          (a.regular_finish ?? 99) - (b2.regular_finish ?? 99) || b2.wins - a.wins,
      );

    // One row per game, from the home ('A') side, with the away side attached.
    seasonGames[String(year)] = played
      .filter((g) => g.year === year && g.isHomeSide)
      .map((home, i) => ({
        game_id: i + 1,
        week: home.week,
        time_of_season: home.timeOfSeason,
        round_game: home.roundGame,
        home_manager_id: home.managerId,
        home_name: displayName(home.managerId),
        home_score: home.score,
        away_manager_id: home.opponentManagerId,
        away_name: home.opponentManagerId ? displayName(home.opponentManagerId) : null,
        away_score: home.opponentScore,
      }))
      .sort((a, b2) => a.week - b2.week);
  }

  // ---- managers ------------------------------------------------------------
  const managers: Snapshot['managers'] = {};
  for (const m of resolver.inLeague('rbb')) {
    const mine = played.filter((g) => g.managerId === m.id);
    const regular = mine.filter((g) => g.timeOfSeason === 'Regular');
    const league = resolver.leagueEntry(m.id, 'rbb');
    const scores = mine.map((g) => g.score ?? 0);

    const profile: ManagerProfile = {
      manager_id: m.id,
      display_name: m.display_name,
      canonical_name: m.canonical_name,
      is_active: league?.active ?? true,
      is_confirmed: m.confirmed,
      first_year: league?.first_year ?? null,
      last_year: league?.last_year ?? null,
      notes: null, // the YAML notes are developer-facing, not for the site
      titles: titlesByManager.get(m.id)?.length ?? 0,
      seasons: teamSeasons.filter((t) => t.manager_id === m.id).length,
      games: mine.length,
      wins: regular.filter((g) => g.isWinner === true).length,
      losses: regular.filter((g) => g.isWinner === false).length,
      points_for: round(sum(mine.map((g) => g.score)), 2),
      ppg: mine.length > 0 ? round(sum(mine.map((g) => g.score)) / mine.length, 1) : 0,
      best_game: scores.length > 0 ? round(Math.max(...scores), 2) : null,
      worst_game: scores.length > 0 ? round(Math.min(...scores), 2) : null,
    };

    const seasonsList: ManagerSeason[] = teamSeasons
      .filter((t) => t.manager_id === m.id)
      .map((t) => {
        const gs = regular.filter((g) => g.year === t.year);
        return {
          year: t.year,
          wins: gs.filter((g) => g.isWinner === true).length,
          losses: gs.filter((g) => g.isWinner === false).length,
          points_for: round(sum(gs.map((g) => g.score)), 2),
          regular_finish: t.regular_finish,
          final_finish: t.final_finish,
          division_name: t.division,
        } satisfies ManagerSeason;
      })
      .sort((a, b2) => b2.year - a.year);

    const byOpponent = new Map<string, TeamGame[]>();
    for (const g of mine) {
      if (!g.opponentManagerId) continue;
      byOpponent.set(g.opponentManagerId, [...(byOpponent.get(g.opponentManagerId) ?? []), g]);
    }
    const h2h: HeadToHead[] = [...byOpponent.entries()]
      .map(([oid, gs]) => ({
        opponent_manager_id: oid,
        opponent_name: displayName(oid),
        games: gs.length,
        wins: gs.filter((g) => g.isWinner === true).length,
        losses: gs.filter((g) => g.isWinner === false).length,
      }))
      .sort((a, b2) => b2.games - a.games || a.opponent_name.localeCompare(b2.opponent_name));

    managers[m.id] = { profile, seasons: seasonsList, headToHead: h2h };
  }

  // ---- records -------------------------------------------------------------
  const toRecord = (t: TeamGame): RecordGame => ({
    year: t.year,
    week: t.week,
    manager_id: t.managerId,
    display_name: displayName(t.managerId),
    opponent_name: t.opponentManagerId ? displayName(t.opponentManagerId) : null,
    score: t.score,
    opponent_score: t.opponentScore,
    point_diff: t.pointDiff,
  });

  const byFlag = (flag: keyof TeamGame, dir: 'desc' | 'asc', limit: number): RecordGame[] =>
    teamGames
      .filter((t) => t[flag] === true)
      .sort(
        (a, b2) =>
          (dir === 'desc' ? (b2.score ?? 0) - (a.score ?? 0) : (a.score ?? 0) - (b2.score ?? 0)) ||
          a.year - b2.year ||
          a.week - b2.week ||
          a.managerId.localeCompare(b2.managerId),
      )
      .slice(0, limit)
      .map(toRecord);

  const margins = (dir: 'desc' | 'asc', limit: number): RecordGame[] =>
    played
      .filter((t) => t.isWinner === true && t.pointDiff !== null)
      .sort(
        (a, b2) =>
          (dir === 'desc'
            ? (b2.pointDiff ?? 0) - (a.pointDiff ?? 0)
            : (a.pointDiff ?? 0) - (b2.pointDiff ?? 0)) ||
          a.year - b2.year ||
          a.week - b2.week ||
          a.managerId.localeCompare(b2.managerId),
      )
      .slice(0, limit)
      .map(toRecord);

  // ---- bench regret --------------------------------------------------------
  const benchRegret: BenchRegret[] = lineupsResult.slots
    .filter((s) => s.was_started === false && s.bench_gap !== null && s.bench_gap !== undefined)
    // Ties on bench_gap are real, so break them the same way the SQL does.
    .sort(
      (a, b2) =>
        Number(b2.bench_gap) - Number(a.bench_gap) ||
        a.year - b2.year ||
        a.week - b2.week ||
        a.manager_id.localeCompare(b2.manager_id),
    )
    .slice(0, 25)
    .map((s) => ({
      year: s.year,
      week: s.week,
      manager_id: s.manager_id,
      display_name: displayName(s.manager_id),
      player_name: s.player_name,
      points: n(s.points),
      bench_gap: n(s.bench_gap),
    }));

  // ---- draft slots ---------------------------------------------------------
  const bySlot = new Map<number, TeamGame[]>();
  for (const t of played) {
    if (t.timeOfSeason !== 'Regular' || t.draftedFrom === null) continue;
    bySlot.set(t.draftedFrom, [...(bySlot.get(t.draftedFrom) ?? []), t]);
  }
  const draftSlots: DraftSlotRow[] = [...bySlot.entries()]
    .map(([slot, gs]) => {
      const wins = gs.filter((g) => g.isWinner === true).length;
      return {
        draft_slot: slot,
        games: gs.length,
        wins,
        win_pct: gs.length > 0 ? round(wins / gs.length, 4) : 0,
      } satisfies DraftSlotRow;
    })
    .sort((a, b2) => a.draft_slot - b2.draft_slot);

  return {
    generatedAt: new Date().toISOString(),
    leagueId: 'rbb',
    leagueName: 'Risky Biscuit Brigade',
    totals: {
      seasons: seasonsResult.seasons.length,
      games: gamesResult.games.length,
      lineup_rows: lineupsResult.slots.length,
      draft_picks: draftsResult.picks.length,
      managers: resolver.inLeague('rbb').length,
    },
    champions,
    titleCounts,
    standings: { regular: buildStandings('Regular'), all: buildStandings('all') },
    seasons,
    seasonStandings,
    seasonGames,
    managers,
    records: {
      careerHigh: byFlag('careerHigh', 'desc', 20),
      careerLow: byFlag('careerLow', 'asc', 20),
      blowouts: margins('desc', 10),
      nailbiters: margins('asc', 10),
    },
    benchRegret,
    draftSlots,
    powerRankings: (() => {
      const byYear: Record<string, PowerRankingRow[]> = {};
      for (const r of rankingsResult.rankings) {
        (byYear[String(r.year)] ??= []).push(r);
      }
      // Newest week first, and within a week ordered by rank, which is how a
      // rankings post reads.
      for (const list of Object.values(byYear)) {
        list.sort((a, b2) => b2.week - a.week || a.rank - b2.rank);
      }
      return byYear;
    })(),
    warnings,
  };
}

/**
 * Keeps sections whose source was not part of this run, instead of emptying them.
 *
 * The sources are deliberately independent: the two Google sheets are downloaded
 * every morning, while the Excel workbook holds lineup and draft history that does
 * not change week to week and is not committed to the repo. So the scheduled run
 * genuinely has no workbook, and rebuilding from Google alone would drop bench
 * regret and the draft pages every single time.
 *
 * Recomputing them is impossible — the data is not there. Failing is wrong, because
 * nothing is actually broken. So the previous snapshot's copy is carried over: the
 * Google half refreshes daily, the Excel half persists until someone uploads a newer
 * workbook. It is stale by construction and says so in the run log.
 *
 * Only a source that was ABSENT gets this treatment. A source that was present and
 * produced nothing is a different thing entirely — that is schema drift or real data
 * loss, and `refuseToLoseASection` below stops it.
 */
export async function carryForwardUnsourcedSections(
  next: Snapshot,
  provided: { workbook: boolean; powerRankings: boolean },
  currentPath: string = SNAPSHOT_PATH,
): Promise<void> {
  let current: Snapshot;
  try {
    current = JSON.parse(await readFile(currentPath, 'utf8')) as Snapshot;
  } catch {
    return; // Nothing to carry forward from.
  }

  const carried: string[] = [];

  if (!provided.workbook && current.benchRegret?.length && next.benchRegret.length === 0) {
    next.benchRegret = current.benchRegret;
    next.draftSlots = current.draftSlots;
    // These totals count workbook rows, so they have to travel with the sections
    // they describe or the site reports zero lineups while showing bench regret.
    next.totals.lineup_rows = current.totals.lineup_rows;
    next.totals.draft_picks = current.totals.draft_picks;
    carried.push('bench regret and draft history (from the Excel workbook)');
  }

  const hadRankings = Object.keys(current.powerRankings ?? {}).length > 0;
  if (!provided.powerRankings && hadRankings && Object.keys(next.powerRankings).length === 0) {
    next.powerRankings = current.powerRankings;
    carried.push('power rankings');
  }

  if (carried.length === 0) return;

  // How old the carried data is belongs in the run log, not in the message stored
  // in the snapshot. Baking today's date into the file would change its contents
  // every single day, which defeats the "nothing changed, do not deploy" check the
  // scheduled job makes — and it did, for two runs, before this was spotted.
  console.log(
    `Kept ${carried.join(' and ')} from the previous run ` +
      `(generated ${current.generatedAt.slice(0, 10)}).`,
  );

  next.warnings.push({
    code: 'carried_forward',
    message:
      `Kept the previous data for ${carried.join(' and ')}, because ` +
      `${carried.length === 1 ? 'that source was' : 'those sources were'} not part of ` +
      `this run.`,
  });
}

/**
 * Stops a rebuild that would empty a section the site is already serving.
 *
 * The snapshot is assembled from several sources, and each is optional so that a
 * partial rebuild is possible. That flexibility has a sharp edge: leave a source
 * off the command line and the build still succeeds, writes a snapshot with that
 * section empty, and the scheduled job commits it. Whole pages then disappear from
 * the live site and nothing anywhere reports an error — the same shape of failure
 * as the Excel Drop column mix-up, which also produced confident, wrong output.
 *
 * So a section going from populated to empty is treated as a mistake until someone
 * says otherwise. Shrinking is fine; vanishing is not.
 */
export async function refuseToLoseASection(
  next: Snapshot,
  allowed: boolean,
  currentPath: string = SNAPSHOT_PATH,
): Promise<void> {
  let current: Snapshot;
  try {
    current = JSON.parse(await readFile(currentPath, 'utf8')) as Snapshot;
  } catch {
    return; // No snapshot yet, so nothing can be lost.
  }

  const size = (v: unknown): number =>
    Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;

  const sections: Array<[string, keyof Snapshot, string]> = [
    ['power rankings', 'powerRankings', '--power-rankings-id'],
    ['seasons', 'seasons', '--history-id or --file'],
    ['champions', 'champions', '--history-id'],
    ['bench regret', 'benchRegret', '--file'],
    ['draft slots', 'draftSlots', '--file'],
  ];

  const lost = sections.filter(
    ([, key]) => size(current[key]) > 0 && size(next[key]) === 0,
  );
  if (lost.length === 0) return;

  const lines = lost.map(
    ([label, key, flagName]) =>
      `  • ${label}: ${size(current[key])} → 0, missing ${flagName}`,
  );
  const message =
    `This rebuild would empty ${lost.length} section(s) the site is already serving:\n` +
    `${lines.join('\n')}\n\n` +
    'That usually means a source was left off the command line rather than that the\n' +
    'data is really gone. Nothing was written. Add the flags above and re-run, or\n' +
    'pass --allow-losing-sections if the removal is intended.';

  if (!allowed) throw new SyncError(message);
  console.log(`${message}\n\nProceeding anyway (--allow-losing-sections).`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const next = argv[i + 1];
    return next && !next.startsWith('--') ? next : undefined;
  };

  const workbook = flag('--file') ?? process.env.RBB_WORKBOOK_PATH;

  // Each Google source can be given either as a local export or as a spreadsheet
  // id to download live. The scheduled update uses ids, so the sheets the
  // commissioner maintains are read directly and his weekly edit IS the update.
  //
  // A download failure is deliberately fatal rather than skipped. Carrying on
  // without a source would write a snapshot missing whole sections and commit it,
  // which takes those pages off the live site without anything looking wrong.
  const resolveSource = async (
    local: string | undefined,
    id: string | undefined,
    what: string,
    tmpName: string,
  ): Promise<string | undefined> => {
    if (local || !id) return local;
    const { downloadSheet } = await import('./probe-sheet.ts');
    const { tmpdir } = await import('node:os');
    console.log(`Downloading the ${what} sheet from Google…`);
    const buf = await downloadSheet(id);
    const path = join(tmpdir(), tmpName);
    await writeFile(path, buf);
    console.log(`  got ${(buf.byteLength / 1024).toFixed(0)} KB`);
    return path;
  };

  const history = await resolveSource(
    flag('--history') ?? process.env.RBB_HISTORY_PATH,
    flag('--history-id') ?? process.env.RBB_HISTORY_SHEET_ID,
    'League History',
    'rbb-history-live.xlsx',
  );
  const powerRankings = await resolveSource(
    flag('--power-rankings') ?? process.env.RBB_POWER_RANKINGS_PATH,
    flag('--power-rankings-id') ?? process.env.RBB_POWER_RANKINGS_SHEET_ID,
    'Power Rankings',
    'rbb-power-rankings-live.xlsx',
  );

  if (!workbook && !history) {
    console.error(
      'Usage: pnpm snapshot [--file <workbook.xlsx>] [--history <export.xlsx> | --history-id <id>]\n' +
        '\n' +
        '  --file        the Excel workbook — the only source of lineup and draft data\n' +
        '  --history     a Google Sheets export saved to disk\n' +
        '  --history-id  download the live Google sheet instead (needs internet)\n' +
        '  --power-rankings     the Power Rankings export, for the weekly rankings\n' +
        '  --power-rankings-id  download the live Power Rankings sheet instead\n' +
        '\n' +
        'The Google history is ahead of the Excel: it has 2025 and the 2024 placings.\n' +
        'At least one source is required.',
    );
    process.exitCode = 1;
    return;
  }

  const resolver = await createResolver({
    allowUnconfirmed: argv.includes('--allow-unconfirmed'),
  });
  if (!resolver.isCleanForProduction && !argv.includes('--allow-unconfirmed')) {
    console.error('Cannot build a snapshot yet.\n');
    console.error(resolver.readinessReport());
    process.exitCode = 1;
    return;
  }

  console.log(
    workbook && history
      ? 'Reading the workbook and the Google history…'
      : history
        ? 'Reading the Google history…'
        : 'Reading the workbook…',
  );
  const snapshot = await buildSnapshot({ workbook, history, powerRankings }, resolver);
  await carryForwardUnsourcedSections(snapshot, {
    workbook: Boolean(workbook),
    powerRankings: Boolean(powerRankings),
  });
  await refuseToLoseASection(snapshot, argv.includes('--allow-losing-sections'));

  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 0)}\n`, 'utf8');

  const bytes = (await readFile(SNAPSHOT_PATH)).byteLength;
  console.log(
    `\nWrote ${SNAPSHOT_PATH}\n` +
      `  ${(bytes / 1024).toFixed(0)} KB — ${snapshot.totals.seasons} seasons, ` +
      `${snapshot.totals.games} games, ${snapshot.champions.length} champions, ` +
      `${Object.keys(snapshot.managers).length} managers` +
      (Object.keys(snapshot.powerRankings).length > 0
        ? `, power rankings for ${Object.keys(snapshot.powerRankings).length} seasons`
        : ''),
  );
  if (snapshot.warnings.length > 0) {
    console.log(`\n${snapshot.warnings.length} thing(s) worth a look:`);
    for (const w of snapshot.warnings) console.log(`  • ${w.message}`);
  }
  console.log('\nCommit this file and the site will serve it. No database needed.');
}

if (process.argv[1]?.endsWith('snapshot.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.toString() : err);
    process.exitCode = 1;
  });
}
