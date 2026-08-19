import { query, transaction } from '@jff/db';
import type { PoolClient, SyncWarning } from '@jff/db';
import { SyncError } from '../errors.ts';
import type { ManagerDef, ManagerResolver } from '../managers.ts';
import { normalizeName } from '../parse.ts';
import { batchInsert } from './batch.ts';
import type { GameRecord, GameTeamRecord } from '../transform/games.ts';
import type { SeasonRecord, TeamSeasonRecord } from '../transform/seasons.ts';
import type { LineupSlotRecord } from '../transform/lineups.ts';
import type { DraftPickRecord, PlayerRecord } from '../transform/drafts.ts';

export interface LoadPayload {
  leagueId: string;
  leagueName: string;
  leagueShortName: string;
  leagueFirstYear: number;
  identityDisplay: 'manager' | 'franchise';
  managers: readonly ManagerDef[];
  seasons: readonly SeasonRecord[];
  teamSeasons: readonly TeamSeasonRecord[];
  games: readonly GameRecord[];
  gameTeams: readonly GameTeamRecord[];
  players: readonly PlayerRecord[];
  lineupSlots: readonly LineupSlotRecord[];
  draftPicks: readonly DraftPickRecord[];
}

export interface LeagueMeta {
  id: string;
  name: string;
  shortName: string;
  firstYear: number;
  identityDisplay: 'manager' | 'franchise';
}

/**
 * Upserts the league row.
 *
 * Called before a sync run is recorded as well as during the load, because
 * `sync_runs.league_id` references `leagues` — a failed first-ever sync still has
 * to be able to record that it failed.
 */
export async function ensureLeague(meta: LeagueMeta): Promise<void> {
  await query(
    `insert into leagues (id, name, short_name, first_year, identity_display)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       name = excluded.name,
       short_name = excluded.short_name,
       first_year = excluded.first_year,
       identity_display = excluded.identity_display`,
    [meta.id, meta.name, meta.shortName, meta.firstYear, meta.identityDisplay],
  );
}

export interface LoadResult {
  rowCounts: Record<string, number>;
  warnings: SyncWarning[];
}

/**
 * Writes a whole league's history in one transaction.
 *
 * All-or-nothing on purpose: a partial load would leave the public site showing
 * games whose lineups had not arrived yet, which reads as data loss to anyone
 * looking at it. Every write is an upsert keyed on a natural key, so re-running
 * the sync is safe and idempotent — that is what makes a cron schedule and a
 * "refresh now" button viable.
 */
export async function loadLeague(payload: LoadPayload): Promise<LoadResult> {
  const warnings: SyncWarning[] = [];
  const rowCounts: Record<string, number> = {};

  await ensureLeague({
    id: payload.leagueId,
    name: payload.leagueName,
    shortName: payload.leagueShortName,
    firstYear: payload.leagueFirstYear,
    identityDisplay: payload.identityDisplay,
  });

  await transaction(async (client) => {
    rowCounts.managers = await loadManagers(client, payload);
    const seasonIds = await loadSeasons(client, payload);
    rowCounts.seasons = seasonIds.size;
    const divisionIds = await loadDivisions(client, payload, seasonIds);
    rowCounts.divisions = divisionIds.size;
    const teamSeasonIds = await loadTeamSeasons(client, payload, seasonIds, divisionIds);
    rowCounts.team_seasons = teamSeasonIds.size;
    const gameIds = await loadGames(client, payload, seasonIds);
    rowCounts.games = gameIds.size;
    const gameTeamIds = await loadGameTeams(
      client, payload, seasonIds, gameIds, teamSeasonIds, divisionIds,
    );
    rowCounts.game_teams = gameTeamIds.size;
    const playerIds = await loadPlayers(client, payload);
    rowCounts.players = playerIds.size;
    rowCounts.lineup_slots = await loadLineups(
      client,
      payload,
      seasonIds,
      teamSeasonIds,
      gameIds,
      gameTeamIds,
      playerIds,
      warnings,
    );
    rowCounts.draft_picks = await loadDraftPicks(client, payload, seasonIds, playerIds);
  });

  return { rowCounts, warnings };
}

async function loadManagers(client: PoolClient, payload: LoadPayload): Promise<number> {
  const rows = payload.managers.map((m) => ({
    id: m.id,
    canonical_name: m.canonical_name,
    display_name: m.display_name,
    is_confirmed: m.confirmed,
    first_year: m.first_year ?? null,
    last_year: m.last_year ?? null,
    is_active: m.is_active,
    notes: m.notes ?? null,
  }));
  await batchInsert(
    client,
    'managers',
    ['id', 'canonical_name', 'display_name', 'is_confirmed', 'first_year', 'last_year', 'is_active', 'notes'],
    rows,
    { conflictTarget: '(id)' },
  );

  // Several spellings of one name collapse to the same normalised key —
  // "JIMMIE PERKINS" and "Jimmie Perkins" both fold to "jimmie perkins". Lookup
  // is by the normalised key, so only one row per key is needed, and inserting
  // both would violate the uniqueness that keeps one name from meaning two
  // people. The first spelling in the YAML wins as the stored representative.
  //
  // Two aliases of DIFFERENT managers colliding is a real error, and is caught
  // earlier when the identity map is parsed.
  const aliasByNorm = new Map<string, { alias: string; alias_norm: string; manager_id: string }>();
  for (const m of payload.managers) {
    for (const alias of m.aliases) {
      const norm = normalizeName(alias);
      if (!aliasByNorm.has(norm)) {
        aliasByNorm.set(norm, { alias, alias_norm: norm, manager_id: m.id });
      }
    }
  }
  await batchInsert(
    client,
    'manager_aliases',
    ['alias', 'alias_norm', 'manager_id'],
    [...aliasByNorm.values()],
    { conflictTarget: '(alias_norm)', updateColumns: ['alias', 'manager_id'] },
  );

  const leagueRows = payload.managers
    .filter((m) => m.leagues.includes(payload.leagueId))
    .map((m) => ({ manager_id: m.id, league_id: payload.leagueId }));
  await batchInsert(client, 'manager_leagues', ['manager_id', 'league_id'], leagueRows, {
    conflictTarget: '(manager_id, league_id)',
  });

  return rows.length;
}

async function loadSeasons(
  client: PoolClient,
  payload: LoadPayload,
): Promise<Map<number, number>> {
  const rows = payload.seasons.map((s) => ({
    league_id: payload.leagueId,
    year: s.year,
    num_teams: s.num_teams,
    // Regular season is weeks 1-14; playoffs and the toilet bowl run 14-17.
    num_regular_weeks: 14,
    playoff_start_week: 14,
    has_divisions: s.has_divisions,
  }));
  const returned = await batchInsert(
    client,
    'seasons',
    ['league_id', 'year', 'num_teams', 'num_regular_weeks', 'playoff_start_week', 'has_divisions'],
    rows,
    { conflictTarget: '(league_id, year)', returning: 'id, year' },
  );
  return new Map(returned.map((r) => [Number(r.year), Number(r.id)]));
}

async function loadDivisions(
  client: PoolClient,
  payload: LoadPayload,
  seasonIds: Map<number, number>,
): Promise<Map<string, number>> {
  const rows = payload.seasons.flatMap((s) =>
    s.division_names.map((name) => ({ season_id: seasonIds.get(s.year)!, name })),
  );
  const returned = await batchInsert(client, 'divisions', ['season_id', 'name'], rows, {
    conflictTarget: '(season_id, name)',
    returning: 'id, season_id, name',
  });
  return new Map(returned.map((r) => [`${r.season_id}|${r.name}`, Number(r.id)]));
}

async function loadTeamSeasons(
  client: PoolClient,
  payload: LoadPayload,
  seasonIds: Map<number, number>,
  divisionIds: Map<string, number>,
): Promise<Map<string, number>> {
  const rows = payload.teamSeasons.map((ts) => {
    const seasonId = seasonIds.get(ts.year);
    if (!seasonId) throw new SyncError(`No season row created for ${ts.year}.`);
    return {
      season_id: seasonId,
      manager_id: ts.manager_id,
      division_id: ts.division ? divisionIds.get(`${seasonId}|${ts.division}`) ?? null : null,
      franchise_name: null,
      draft_slot: ts.draft_slot,
      regular_finish: ts.regular_finish,
      division_finish: ts.division_finish,
      final_finish: ts.final_finish,
      raw_regular_finish: ts.raw_regular_finish,
      raw_division_finish: ts.raw_division_finish,
      raw_final_finish: ts.raw_final_finish,
      made_finals: ts.made_finals,
      made_playoffs: ts.made_playoffs,
    };
  });
  const returned = await batchInsert(
    client,
    'team_seasons',
    [
      'season_id', 'manager_id', 'division_id', 'franchise_name', 'draft_slot',
      'regular_finish', 'division_finish', 'final_finish', 'raw_regular_finish',
      'raw_division_finish', 'raw_final_finish', 'made_finals', 'made_playoffs',
    ],
    rows,
    { conflictTarget: '(season_id, manager_id)', returning: 'id, season_id, manager_id' },
  );
  return new Map(returned.map((r) => [`${r.season_id}|${r.manager_id}`, Number(r.id)]));
}

async function loadGames(
  client: PoolClient,
  payload: LoadPayload,
  seasonIds: Map<number, number>,
): Promise<Map<string, number>> {
  const rows = payload.games.map((g) => ({
    season_id: seasonIds.get(g.year)!,
    source_key: g.source_key,
    week: g.week,
    game_number: g.game_number,
    time_of_season: g.time_of_season,
    round: g.round,
    round_game: g.round_game,
    num_teams: g.num_teams,
    was_played: g.was_played,
  }));
  const returned = await batchInsert(
    client,
    'games',
    ['season_id', 'source_key', 'week', 'game_number', 'time_of_season', 'round', 'round_game', 'num_teams', 'was_played'],
    rows,
    { conflictTarget: '(source_key)', returning: 'id, source_key' },
  );
  return new Map(returned.map((r) => [String(r.source_key), Number(r.id)]));
}

const GAME_TEAM_COLUMNS = [
  'game_id', 'team_season_id', 'opponent_team_season_id', 'is_home_side', 'score',
  'projected_score', 'opponent_score', 'opponent_projected_score', 'is_winner', 'is_loser',
  'seed', 'division_id', 'opponent_division_id', 'point_diff', 'spread', 'actual_vs_proj',
  'opp_actual_vs_proj', 'favorite_or_underdog', 'record_at_game', 'opp_record_at_game',
  'wins_at_game', 'losses_at_game', 'opp_wins_at_game', 'opp_losses_at_game', 'pf_at_game',
  'pa_at_game', 'opp_pf_at_game', 'opp_pa_at_game', 'win_streak', 'loss_streak', 'weekly_rank',
  'opp_weekly_rank', 'year_rank', 'made_playoff', 'drafted_from', 'placed_regular',
  'placed_playoff', 'placed_div_conf', 'week_high', 'week_low', 'season_high', 'season_low',
  'career_high', 'career_low',
] as const;

async function loadGameTeams(
  client: PoolClient,
  payload: LoadPayload,
  seasonIds: Map<number, number>,
  gameIds: Map<string, number>,
  teamSeasonIds: Map<string, number>,
  divisionIds: Map<string, number>,
): Promise<Map<string, number>> {
  const rows = payload.gameTeams.map((gt) => {
    const gameId = gameIds.get(gt.game_source_key);
    if (!gameId) throw new SyncError(`No game row for key ${gt.game_source_key}.`);
    const seasonId = seasonIds.get(gt.year);
    if (!seasonId) throw new SyncError(`No season row created for ${gt.year}.`);
    const teamSeasonId = teamSeasonIds.get(`${seasonId}|${gt.manager_id}`);
    if (!teamSeasonId) {
      throw new SyncError(
        `${gt.manager_id} plays a game in ${gt.year} but has no row in the Finishes sheet ` +
          `for that season.`,
        {
          hint:
            'Every manager who played a game in a year needs a Finishes row for that year, ' +
            'otherwise the site has no team to attach the game to.',
        },
      );
    }
    return {
      game_id: gameId,
      team_season_id: teamSeasonId,
      opponent_team_season_id: gt.opponent_manager_id
        ? teamSeasonIds.get(`${seasonId}|${gt.opponent_manager_id}`) ?? null
        : null,
      is_home_side: gt.is_home_side,
      score: gt.score,
      projected_score: gt.projected_score,
      opponent_score: gt.opponent_score,
      opponent_projected_score: gt.opponent_projected_score,
      // `W` and `L` in the source are 1/0 markers rather than booleans.
      is_winner: toFlag(gt.wins),
      is_loser: toFlag(gt.losses),
      seed: gt.seed,
      division_id: gt.division ? divisionIds.get(`${seasonId}|${gt.division}`) ?? null : null,
      opponent_division_id: gt.opp_division
        ? divisionIds.get(`${seasonId}|${gt.opp_division}`) ?? null
        : null,
      point_diff: gt.point_diff,
      spread: gt.spread,
      actual_vs_proj: gt.actual_vs_proj,
      opp_actual_vs_proj: gt.opp_actual_vs_proj,
      favorite_or_underdog: gt.favorite_or_underdog,
      record_at_game: gt.record_at_game,
      opp_record_at_game: gt.opp_record_at_game,
      wins_at_game: gt.wins_at_game,
      losses_at_game: gt.losses_at_game,
      opp_wins_at_game: gt.opp_wins_at_game,
      opp_losses_at_game: gt.opp_losses_at_game,
      pf_at_game: gt.pf_at_game,
      pa_at_game: gt.pa_at_game,
      opp_pf_at_game: gt.opp_pf_at_game,
      opp_pa_at_game: gt.opp_pa_at_game,
      win_streak: gt.win_streak,
      loss_streak: gt.loss_streak,
      weekly_rank: gt.weekly_rank,
      opp_weekly_rank: gt.opp_weekly_rank,
      year_rank: gt.year_rank,
      made_playoff: gt.made_playoff,
      drafted_from: gt.drafted_from,
      placed_regular: gt.placed_regular,
      placed_playoff: gt.placed_playoff,
      placed_div_conf: gt.placed_div_conf,
      week_high: gt.week_high,
      week_low: gt.week_low,
      season_high: gt.season_high,
      season_low: gt.season_low,
      career_high: gt.career_high,
      career_low: gt.career_low,
    };
  });

  const returned = await batchInsert(client, 'game_teams', [...GAME_TEAM_COLUMNS], rows, {
    conflictTarget: '(game_id, team_season_id)',
    returning: 'id, game_id, team_season_id',
  });
  return new Map(returned.map((r) => [`${r.game_id}|${r.team_season_id}`, Number(r.id)]));
}

async function loadPlayers(
  client: PoolClient,
  payload: LoadPayload,
): Promise<Map<string, number>> {
  const rows = payload.players.map((p) => ({
    canonical_name: p.name,
    primary_position: p.position,
  }));
  const returned = await batchInsert(
    client,
    'players',
    ['canonical_name', 'primary_position'],
    rows,
    { conflictTarget: '(canonical_name)', returning: 'id, canonical_name' },
  );
  return new Map(returned.map((r) => [String(r.canonical_name).toLowerCase(), Number(r.id)]));
}

const LINEUP_COLUMNS = [
  'game_team_id', 'player_id', 'season_id', 'week', 'team_season_id', 'lineup_number',
  'lineup_position', 'player_position', 'points', 'projected_points', 'diff', 'was_started',
  'reason', 'played', 'is_flex_eligible', 'games_played_count', 'pos_rank_that_week',
  'pos_rank_with_bench', 'players_above_min', 'max_bench', 'bench_gap',
  'best_bench_over_starter', 'round_drafted', 'pick_drafted', 'drafted_by_manager_id',
  'drafted_from', 'is_keeper', 'keep_year',
] as const;

async function loadLineups(
  client: PoolClient,
  payload: LoadPayload,
  seasonIds: Map<number, number>,
  teamSeasonIds: Map<string, number>,
  gameIds: Map<string, number>,
  gameTeamIds: Map<string, number>,
  playerIds: Map<string, number>,
  warnings: SyncWarning[],
): Promise<number> {
  const rows: Array<Record<string, unknown>> = [];
  let orphaned = 0;

  for (const slot of payload.lineupSlots) {
    const seasonId = seasonIds.get(slot.year);
    if (!seasonId) continue;
    const teamSeasonId = teamSeasonIds.get(`${seasonId}|${slot.manager_id}`);
    if (!teamSeasonId) continue;

    // A lineup row whose game is not in GameData has nowhere to hang. That is a
    // real inconsistency between the two sheets, so it is counted and reported
    // rather than dropped in silence.
    const gameId = gameIds.get(slot.game_source_key);
    const gameTeamId = gameId ? gameTeamIds.get(`${gameId}|${teamSeasonId}`) : undefined;
    if (!gameTeamId) {
      orphaned += 1;
      continue;
    }

    rows.push({
      game_team_id: gameTeamId,
      player_id: slot.player_name ? playerIds.get(slot.player_name.toLowerCase()) ?? null : null,
      season_id: seasonId,
      week: slot.week,
      team_season_id: teamSeasonId,
      lineup_number: slot.lineup_number,
      lineup_position: slot.lineup_position,
      player_position: slot.player_position,
      points: slot.points,
      projected_points: slot.projected_points,
      diff: slot.diff,
      was_started: slot.was_started,
      reason: slot.reason,
      played: slot.played,
      is_flex_eligible: toFlag(slot.flex_eligible),
      games_played_count: slot.games_played_count,
      pos_rank_that_week: slot.pos_rank_that_week,
      pos_rank_with_bench: slot.pos_rank_with_bench,
      players_above_min: slot.players_above_min,
      max_bench: slot.max_bench,
      bench_gap: slot.bench_gap,
      best_bench_over_starter: slot.best_bench_over_starter,
      round_drafted: slot.round_drafted,
      pick_drafted: slot.pick_drafted,
      drafted_by_manager_id: slot.drafted_by_manager_id,
      drafted_from: slot.drafted_from,
      is_keeper: slot.is_keeper,
      keep_year: slot.keep_year,
    });
  }

  if (orphaned > 0) {
    warnings.push({
      code: 'lineup_without_game',
      message:
        `${orphaned} lineup row(s) refer to a game that does not exist in GameData, so they ` +
        `were not imported. LineupData and GameData disagree about those weeks.`,
      context: { orphaned },
    });
  }

  await batchInsert(client, 'lineup_slots', [...LINEUP_COLUMNS], rows, {
    conflictTarget: '(game_team_id, lineup_number, lineup_position, player_id)',
  });
  return rows.length;
}

async function loadDraftPicks(
  client: PoolClient,
  payload: LoadPayload,
  seasonIds: Map<number, number>,
  playerIds: Map<string, number>,
): Promise<number> {
  const rows = payload.draftPicks
    .filter((p) => seasonIds.has(p.year))
    .map((p) => ({
      season_id: seasonIds.get(p.year)!,
      round: p.round,
      pick: p.pick,
      overall: p.overall,
      player_id: playerIds.get(p.player_name.toLowerCase()) ?? null,
      player_name: p.player_name,
      position: p.position,
      nfl_team: p.nfl_team,
      manager_id: p.manager_id,
      is_keeper: p.is_keeper,
    }));
  await batchInsert(
    client,
    'draft_picks',
    ['season_id', 'round', 'pick', 'overall', 'player_id', 'player_name', 'position', 'nfl_team', 'manager_id', 'is_keeper'],
    rows,
    { conflictTarget: '(season_id, overall)' },
  );
  return rows.length;
}

// --- small helpers -----------------------------------------------------------

/** The source writes W/L as 1 and 0, and flags as YES/NO. Both land here. */
function toFlag(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const up = String(value).trim().toUpperCase();
  if (up === 'YES' || up === 'Y' || up === 'TRUE' || up === '1') return true;
  if (up === 'NO' || up === 'N' || up === 'FALSE' || up === '0') return false;
  return null;
}
