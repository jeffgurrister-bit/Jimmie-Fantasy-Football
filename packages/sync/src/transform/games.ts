import type { SyncWarning } from '@jff/db';
import { SyncError } from '../errors.ts';
import type { ManagerResolver } from '../managers.ts';
import { mapRow, type SheetSpec, type SourceRow } from '../schema.ts';

export interface GameRecord {
  source_key: string;
  year: number;
  week: number;
  game_number: number | null;
  time_of_season: string;
  round: number | null;
  round_game: string | null;
  num_teams: number | null;
  was_played: boolean;
}

export interface GameTeamRecord {
  game_source_key: string;
  year: number;
  manager_id: string;
  opponent_manager_id: string | null;
  is_home_side: boolean;
  division: string | null;
  opp_division: string | null;
  [field: string]: string | number | boolean | null;
}

export interface GamesResult {
  games: GameRecord[];
  gameTeams: GameTeamRecord[];
  warnings: SyncWarning[];
}

/**
 * Builds the stable identity of a game from the two managers in it.
 *
 * Sorting the pair is the whole trick: the A row and the B row of the same game
 * describe it from opposite sides, and sorting makes both produce the same key,
 * so the two rows attach to one game instead of creating two.
 *
 * `time_of_season` is part of the key because week 14 is both the last regular
 * week and the first playoff week — the same pairing could legitimately appear
 * twice in that week, and those are two different games.
 */
export function gameSourceKey(input: {
  year: number;
  week: number;
  timeOfSeason: string;
  managerA: string;
  managerB: string | null;
}): string {
  const pair = [input.managerA, input.managerB ?? 'bye'].sort();
  return `${input.year}|w${input.week}|${input.timeOfSeason}|${pair[0]}|${pair[1]}`;
}

/**
 * Splits GameData into deduplicated games and two-perspective game_teams.
 *
 * The source stores every game twice, flagged in its `A/B` column: 804 'A' rows
 * and 804 'B' rows across nine seasons. Unique games come from the 'A' rows
 * alone; per-team stats need every row. Conflating the two doubles every number
 * on the site, so this function is the only place that decision is made, and it
 * audits its own output afterwards.
 */
export function transformGames(
  spec: SheetSpec,
  rows: readonly SourceRow[],
  resolver: ManagerResolver,
): GamesResult {
  const games = new Map<string, GameRecord>();
  const gameTeams: GameTeamRecord[] = [];
  const warnings: SyncWarning[] = [];
  const sideCounts = { A: 0, B: 0, other: 0 };

  rows.forEach((raw, index) => {
    const rowNumber = Number(raw.__rowNumber ?? index + 1);
    const row = mapRow(spec, raw, rowNumber);

    const year = row.year as number;
    const week = row.week as number;
    const timeOfSeason = row.time_of_season as string;
    const side = String(row.ab_side ?? '').toUpperCase();

    if (side === 'A') sideCounts.A += 1;
    else if (side === 'B') sideCounts.B += 1;
    else sideCounts.other += 1;

    const managerId = resolver.resolve(row.team as string, spec.sheetName);
    const opponentName = row.opponent as string | null;
    const opponentId = opponentName ? resolver.resolve(opponentName, spec.sheetName) : null;

    const key = gameSourceKey({
      year,
      week,
      timeOfSeason,
      managerA: managerId,
      managerB: opponentId,
    });

    // Games are created from the 'A' side only. This is the deduplication.
    if (side === 'A') {
      if (games.has(key)) {
        throw new SyncError(
          `Two different games in ${year} week ${week} resolve to the same identity ` +
            `(${key}).`,
          {
            sheet: spec.sheetName,
            row: rowNumber,
            hint:
              'This happens when the same two managers appear to play each other twice in ' +
              'one week within the same part of the season. Check that week in the sheet — ' +
              'it usually means a row was duplicated or a manager name is wrong.',
          },
        );
      }
      games.set(key, {
        source_key: key,
        year,
        week,
        game_number: row.game_number as number | null,
        time_of_season: timeOfSeason,
        round: row.round as number | null,
        round_game: row.round_game as string | null,
        num_teams: row.num_teams as number | null,
        was_played: row.game_played !== false,
      });
    }

    // game_teams gets every row, both perspectives.
    gameTeams.push({
      ...row,
      game_source_key: key,
      year,
      manager_id: managerId,
      opponent_manager_id: opponentId,
      is_home_side: side === 'A',
      division: row.division as string | null,
      opp_division: row.opp_division as string | null,
    });
  });

  // --- integrity checks on our own dedup ------------------------------------
  if (sideCounts.other > 0) {
    warnings.push({
      code: 'ab_side_unrecognised',
      message:
        `${sideCounts.other} row(s) in GameData have an A/B value that is neither "A" nor ` +
        `"B". Those rows contributed team stats but no game record.`,
      context: { ...sideCounts },
    });
  }
  if (sideCounts.A !== sideCounts.B) {
    warnings.push({
      code: 'ab_side_imbalance',
      message:
        `GameData's A/B column is not balanced: ${sideCounts.A} "A" rows against ` +
        `${sideCounts.B} "B" rows. It should be exactly even — one of each per game.`,
      context: { ...sideCounts },
    });
  }

  // Every game must have exactly two sides. A game with one means the opposite
  // row is missing or its manager name did not match, and that would show up as
  // a phantom result on the site.
  const perGame = new Map<string, number>();
  for (const gt of gameTeams) {
    perGame.set(gt.game_source_key, (perGame.get(gt.game_source_key) ?? 0) + 1);
  }
  const orphans = [...perGame.entries()].filter(([, n]) => n !== 2);
  if (orphans.length > 0) {
    warnings.push({
      code: 'game_missing_opponent_row',
      message:
        `${orphans.length} game(s) do not have exactly two team rows. Their scores will ` +
        `still show, but head-to-head records for those weeks are incomplete.`,
      context: { examples: orphans.slice(0, 10).map(([k, n]) => ({ game: k, rows: n })) },
    });
  }

  // Every game key referenced by a team row must exist. A missing one means a
  // 'B' row arrived with no 'A' counterpart.
  const missingGames = [...perGame.keys()].filter((k) => !games.has(k));
  if (missingGames.length > 0) {
    warnings.push({
      code: 'game_team_without_game',
      message:
        `${missingGames.length} game(s) have team rows but no "A"-side row to define the ` +
        `game itself. Those rows are skipped.`,
      context: { examples: missingGames.slice(0, 10) },
    });
  }

  return {
    games: [...games.values()],
    gameTeams: gameTeams.filter((gt) => games.has(gt.game_source_key)),
    warnings,
  };
}
