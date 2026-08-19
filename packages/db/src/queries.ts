/**
 * Every read the site performs, in one place.
 *
 * Two rules hold throughout:
 *
 *  1. Counting team-games goes through `v_team_games`, never a hand-rolled join
 *     of `games` to `game_teams`. The source stores each game twice and that view
 *     is what keeps totals honest — see docs/DATA-MODEL.md.
 *  2. Nothing is recomputed that the commissioner already computes. Records come
 *     from the imported `career_high` / `season_high` flags and from `bench_gap`,
 *     not from our own aggregates over scores.
 *
 * Each function returns empty rather than throwing when no database is
 * configured, because the site is deployed before the database exists.
 */
import { isDatabaseConfigured, query } from './client.ts';
import type { LeagueId } from './types.ts';

async function rows<T>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    return (await query(sql, params)) as T[];
  } catch (err) {
    // A page that cannot reach the database should say so, not 500. The message
    // is logged for whoever is watching the deployment.
    console.error('[db] query failed:', (err as Error).message);
    return [];
  }
}

export interface SyncStatus {
  status: string;
  started_at: Date;
  finished_at: Date | null;
  summary: string | null;
  warnings: Array<{ code: string; message: string }>;
  row_counts: Record<string, number>;
}

/** Most recent sync attempt, for the admin page and the footer. */
export async function latestSync(leagueId: LeagueId): Promise<SyncStatus | undefined> {
  const r = await rows<SyncStatus>(
    `select status, started_at, finished_at, summary, warnings, row_counts
     from sync_runs where league_id = $1 order by started_at desc limit 1`,
    [leagueId],
  );
  return r[0];
}

export interface ChampionRow {
  year: number;
  manager_id: string;
  display_name: string;
  canonical_name: string;
  score_for: number | null;
  regular_finish: number | null;
}

/** The championship wall: one row per season that has a recorded champion. */
export async function champions(leagueId: LeagueId): Promise<ChampionRow[]> {
  return rows<ChampionRow>(
    `select s.year, m.id as manager_id, m.display_name, m.canonical_name,
            ts.regular_finish,
            (select sum(gt.score) from game_teams gt where gt.team_season_id = ts.id) as score_for
     from team_seasons ts
       join seasons s on s.id = ts.season_id
       join managers m on m.id = ts.manager_id
     where s.league_id = $1 and ts.final_finish = 1
     order by s.year desc`,
    [leagueId],
  );
}

export interface TitleCount {
  manager_id: string;
  display_name: string;
  canonical_name: string;
  titles: number;
  years: string;
}

export async function titleCounts(leagueId: LeagueId): Promise<TitleCount[]> {
  return rows<TitleCount>(
    `select m.id as manager_id, m.display_name, m.canonical_name,
            count(*)::int as titles,
            string_agg(s.year::text, ', ' order by s.year) as years
     from team_seasons ts
       join seasons s on s.id = ts.season_id
       join managers m on m.id = ts.manager_id
     where s.league_id = $1 and ts.final_finish = 1
     group by 1, 2, 3
     order by titles desc, m.display_name, m.id`,
    [leagueId],
  );
}

export interface StandingRow {
  manager_id: string;
  display_name: string;
  canonical_name: string;
  is_active: boolean;
  is_confirmed: boolean;
  first_year: number | null;
  last_year: number | null;
  games: number;
  wins: number;
  losses: number;
  win_pct: number;
  points_for: number;
  points_against: number;
  ppg: number;
  titles: number;
  playoff_games: number;
}

/**
 * All-time standings. Regular season only by default, because mixing playoff
 * games into a win percentage flatters whoever made the most playoffs.
 */
export async function allTimeStandings(
  leagueId: LeagueId,
  timeOfSeason: 'Regular' | 'all' = 'Regular',
): Promise<StandingRow[]> {
  return rows<StandingRow>(
    `with games as (
       select v.manager_id,
              count(*)::int as games,
              count(*) filter (where v.is_winner)::int as wins,
              count(*) filter (where v.is_winner is false)::int as losses,
              coalesce(sum(v.score), 0) as points_for,
              coalesce(sum(v.opponent_score), 0) as points_against,
              round(avg(v.score), 1) as ppg,
              count(*) filter (where v.time_of_season <> 'Regular')::int as playoff_games
       from v_team_games v
       where v.league_id = $1 and v.was_played
         and ($2 = 'all' or v.time_of_season = 'Regular')
       group by v.manager_id
     ),
     titles as (
       select ts.manager_id, count(*)::int as titles
       from team_seasons ts join seasons s on s.id = ts.season_id
       where s.league_id = $1 and ts.final_finish = 1
       group by ts.manager_id
     )
     select m.id as manager_id, m.display_name, m.canonical_name, m.is_confirmed,
            ml.is_active, ml.first_year, ml.last_year,
            g.games, g.wins, g.losses, g.points_for, g.points_against, g.ppg,
            g.playoff_games,
            case when g.games > 0 then round(g.wins::numeric / g.games, 4) else 0 end as win_pct,
            coalesce(t.titles, 0) as titles
     from games g
       join managers m on m.id = g.manager_id
       join manager_leagues ml on ml.manager_id = m.id and ml.league_id = $1
       left join titles t on t.manager_id = m.id
     order by wins desc, win_pct desc, points_for desc, m.id`,
    [leagueId, timeOfSeason],
  );
}

export interface SeasonSummary {
  year: number;
  num_teams: number | null;
  has_divisions: boolean;
  champion_display_name: string | null;
  champion_manager_id: string | null;
  games: number;
  high_score: number | null;
}

export async function seasonSummaries(leagueId: LeagueId): Promise<SeasonSummary[]> {
  return rows<SeasonSummary>(
    `select s.year, s.num_teams, s.has_divisions,
            cm.display_name as champion_display_name,
            cm.id as champion_manager_id,
            (select count(*)::int from games g where g.season_id = s.id) as games,
            (select max(gt.score) from game_teams gt
               join games g2 on g2.id = gt.game_id where g2.season_id = s.id) as high_score
     from seasons s
       left join team_seasons cts on cts.season_id = s.id and cts.final_finish = 1
       left join managers cm on cm.id = cts.manager_id
     where s.league_id = $1
     order by s.year desc`,
    [leagueId],
  );
}

export interface SeasonStanding {
  manager_id: string;
  display_name: string;
  division_name: string | null;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
  regular_finish: number | null;
  final_finish: number | null;
  made_finals: boolean | null;
  draft_slot: number | null;
}

export async function seasonStandings(
  leagueId: LeagueId,
  year: number,
): Promise<SeasonStanding[]> {
  return rows<SeasonStanding>(
    `select m.id as manager_id, m.display_name, d.name as division_name,
            ts.regular_finish, ts.final_finish, ts.made_finals, ts.draft_slot,
            count(*) filter (where v.is_winner and v.time_of_season = 'Regular')::int as wins,
            count(*) filter (where v.is_winner is false and v.time_of_season = 'Regular')::int as losses,
            coalesce(sum(v.score) filter (where v.time_of_season = 'Regular'), 0) as points_for,
            coalesce(sum(v.opponent_score) filter (where v.time_of_season = 'Regular'), 0) as points_against
     from team_seasons ts
       join seasons s on s.id = ts.season_id
       join managers m on m.id = ts.manager_id
       left join divisions d on d.id = ts.division_id
       left join v_team_games v on v.team_season_id = ts.id and v.was_played
     where s.league_id = $1 and s.year = $2
     group by m.id, m.display_name, d.name, ts.regular_finish, ts.final_finish,
              ts.made_finals, ts.draft_slot
     order by ts.regular_finish nulls last, wins desc`,
    [leagueId, year],
  );
}

export interface GameRow {
  game_id: number;
  week: number;
  time_of_season: string;
  round_game: string | null;
  home_manager_id: string;
  home_name: string;
  home_score: number | null;
  away_manager_id: string | null;
  away_name: string | null;
  away_score: number | null;
}

/** Week-by-week results for a season. One row per game, not per team. */
export async function seasonGames(leagueId: LeagueId, year: number): Promise<GameRow[]> {
  return rows<GameRow>(
    `select g.id as game_id, g.week, g.time_of_season, g.round_game,
            hm.id as home_manager_id, hm.display_name as home_name, hgt.score as home_score,
            am.id as away_manager_id, am.display_name as away_name, agt.score as away_score
     from games g
       join seasons s on s.id = g.season_id
       join game_teams hgt on hgt.game_id = g.id and hgt.is_home_side
       join team_seasons hts on hts.id = hgt.team_season_id
       join managers hm on hm.id = hts.manager_id
       left join game_teams agt on agt.game_id = g.id and agt.is_home_side = false
       left join team_seasons ats on ats.id = agt.team_season_id
       left join managers am on am.id = ats.manager_id
     where s.league_id = $1 and s.year = $2 and g.was_played
     order by g.week, g.id`,
    [leagueId, year],
  );
}

export interface ManagerProfile {
  manager_id: string;
  display_name: string;
  canonical_name: string;
  is_active: boolean;
  is_confirmed: boolean;
  first_year: number | null;
  last_year: number | null;
  notes: string | null;
  titles: number;
  seasons: number;
  games: number;
  wins: number;
  losses: number;
  points_for: number;
  ppg: number;
  best_game: number | null;
  worst_game: number | null;
}

export async function managerProfile(
  leagueId: LeagueId,
  managerId: string,
): Promise<ManagerProfile | undefined> {
  const r = await rows<ManagerProfile>(
    `select m.id as manager_id, m.display_name, m.canonical_name, m.is_confirmed, m.notes,
            ml.is_active, ml.first_year, ml.last_year,
            (select count(*)::int from team_seasons ts join seasons s2 on s2.id = ts.season_id
               where ts.manager_id = m.id and s2.league_id = $1) as seasons,
            (select count(*)::int from team_seasons ts join seasons s2 on s2.id = ts.season_id
               where ts.manager_id = m.id and s2.league_id = $1 and ts.final_finish = 1) as titles,
            count(v.game_team_id)::int as games,
            count(*) filter (where v.is_winner and v.time_of_season = 'Regular')::int as wins,
            count(*) filter (where v.is_winner is false and v.time_of_season = 'Regular')::int as losses,
            coalesce(sum(v.score), 0) as points_for,
            round(avg(v.score), 1) as ppg,
            max(v.score) as best_game,
            min(v.score) as worst_game
     from managers m
       join manager_leagues ml on ml.manager_id = m.id and ml.league_id = $1
       left join v_team_games v on v.manager_id = m.id and v.league_id = $1 and v.was_played
     where m.id = $2
     group by m.id, m.display_name, m.canonical_name, m.is_confirmed, m.notes,
              ml.is_active, ml.first_year, ml.last_year`,
    [leagueId, managerId],
  );
  return r[0];
}

export interface HeadToHead {
  opponent_manager_id: string;
  opponent_name: string;
  games: number;
  wins: number;
  losses: number;
}

export async function headToHead(
  leagueId: LeagueId,
  managerId: string,
): Promise<HeadToHead[]> {
  return rows<HeadToHead>(
    `select v.opponent_manager_id, om.display_name as opponent_name,
            count(*)::int as games,
            count(*) filter (where v.is_winner)::int as wins,
            count(*) filter (where v.is_winner is false)::int as losses
     from v_team_games v
       join managers om on om.id = v.opponent_manager_id
     where v.league_id = $1 and v.manager_id = $2 and v.was_played
     group by v.opponent_manager_id, om.display_name
     order by games desc, om.display_name`,
    [leagueId, managerId],
  );
}

export interface ManagerSeason {
  year: number;
  wins: number;
  losses: number;
  points_for: number;
  regular_finish: number | null;
  final_finish: number | null;
  division_name: string | null;
}

export async function managerSeasons(
  leagueId: LeagueId,
  managerId: string,
): Promise<ManagerSeason[]> {
  return rows<ManagerSeason>(
    `select s.year, ts.regular_finish, ts.final_finish, d.name as division_name,
            count(*) filter (where v.is_winner and v.time_of_season = 'Regular')::int as wins,
            count(*) filter (where v.is_winner is false and v.time_of_season = 'Regular')::int as losses,
            coalesce(sum(v.score) filter (where v.time_of_season = 'Regular'), 0) as points_for
     from team_seasons ts
       join seasons s on s.id = ts.season_id
       left join divisions d on d.id = ts.division_id
       left join v_team_games v on v.team_season_id = ts.id and v.was_played
     where s.league_id = $1 and ts.manager_id = $2
     group by s.year, ts.regular_finish, ts.final_finish, d.name
     order by s.year desc`,
    [leagueId, managerId],
  );
}

export interface RecordGame {
  year: number;
  week: number;
  manager_id: string;
  display_name: string;
  opponent_name: string | null;
  score: number | null;
  opponent_score: number | null;
  point_diff: number | null;
}

/**
 * The records book, read off the commissioner's own marker flags rather than
 * recomputed. `career_high` is set on exactly one row per manager.
 */
export async function recordGames(
  leagueId: LeagueId,
  flag: 'career_high' | 'career_low' | 'season_high' | 'season_low',
  limit = 15,
): Promise<RecordGame[]> {
  // The flag name is not user input — it is one of four literals from the union
  // type above — so interpolating it is safe and keeps the query readable.
  const direction = flag.endsWith('_low') ? 'asc' : 'desc';
  return rows<RecordGame>(
    `select s.year, g.week, m.id as manager_id, m.display_name,
            om.display_name as opponent_name,
            gt.score, gt.opponent_score, gt.point_diff
     from game_teams gt
       join games g on g.id = gt.game_id
       join seasons s on s.id = g.season_id
       join team_seasons ts on ts.id = gt.team_season_id
       join managers m on m.id = ts.manager_id
       left join team_seasons ots on ots.id = gt.opponent_team_season_id
       left join managers om on om.id = ots.manager_id
     where s.league_id = $1 and gt.${flag}
     order by gt.score ${direction}, s.year, g.week, m.id
     limit $2`,
    [leagueId, limit],
  );
}

/** Biggest blowouts and closest games, from the imported point differential. */
export async function marginRecords(
  leagueId: LeagueId,
  kind: 'blowout' | 'nailbiter',
  limit = 10,
): Promise<RecordGame[]> {
  const order = kind === 'blowout' ? 'desc' : 'asc';
  return rows<RecordGame>(
    `select s.year, g.week, m.id as manager_id, m.display_name,
            om.display_name as opponent_name,
            gt.score, gt.opponent_score, gt.point_diff
     from game_teams gt
       join games g on g.id = gt.game_id
       join seasons s on s.id = g.season_id
       join team_seasons ts on ts.id = gt.team_season_id
       join managers m on m.id = ts.manager_id
       left join team_seasons ots on ots.id = gt.opponent_team_season_id
       left join managers om on om.id = ots.manager_id
     where s.league_id = $1 and gt.is_winner and gt.point_diff is not null and g.was_played
     order by gt.point_diff ${order}, s.year, g.week, m.id
     limit $2`,
    [leagueId, limit],
  );
}

export interface BenchRegret {
  year: number;
  week: number;
  manager_id: string;
  display_name: string;
  player_name: string | null;
  points: number | null;
  bench_gap: number | null;
}

/**
 * The bench-regret leaderboard — RBB's differentiating feature.
 *
 * Sorted on `bench_gap`, which is the points margin. `best_bench_over_starter`
 * is only a 0/1 flag and ranking on it would produce a meaningless list.
 */
export async function benchRegret(leagueId: LeagueId, limit = 25): Promise<BenchRegret[]> {
  return rows<BenchRegret>(
    `select s.year, ls.week, m.id as manager_id, m.display_name,
            p.canonical_name as player_name, ls.points, ls.bench_gap
     from lineup_slots ls
       join seasons s on s.id = ls.season_id
       join team_seasons ts on ts.id = ls.team_season_id
       join managers m on m.id = ts.manager_id
       left join players p on p.id = ls.player_id
     where s.league_id = $1 and ls.bench_gap is not null and ls.was_started = false
     -- Ties on bench_gap are real (two rows sit at 37.95), so the order is fully
     -- specified rather than left to the planner.
     order by ls.bench_gap desc, s.year, ls.week, m.id
     limit $2`,
    [leagueId, limit],
  );
}

export interface DraftSlotRow {
  draft_slot: number;
  games: number;
  wins: number;
  win_pct: number;
}

/** Performance by the draft slot a team picked from, using `Drafted From`. */
export async function draftSlotPerformance(leagueId: LeagueId): Promise<DraftSlotRow[]> {
  return rows<DraftSlotRow>(
    `select v.drafted_from as draft_slot,
            count(*)::int as games,
            count(*) filter (where v.is_winner)::int as wins,
            round(count(*) filter (where v.is_winner)::numeric / count(*), 4) as win_pct
     from v_team_games v
     where v.league_id = $1 and v.time_of_season = 'Regular'
       and v.drafted_from is not null and v.was_played
     group by v.drafted_from
     order by v.drafted_from`,
    [leagueId],
  );
}

export interface LeagueTotals {
  seasons: number;
  games: number;
  lineup_rows: number;
  draft_picks: number;
  managers: number;
}

export async function leagueTotals(leagueId: LeagueId): Promise<LeagueTotals | undefined> {
  const r = await rows<LeagueTotals>(
    `select
       (select count(*)::int from seasons where league_id = $1) as seasons,
       (select count(*)::int from games g join seasons s on s.id = g.season_id
          where s.league_id = $1) as games,
       (select count(*)::int from lineup_slots ls join seasons s on s.id = ls.season_id
          where s.league_id = $1) as lineup_rows,
       (select count(*)::int from draft_picks dp join seasons s on s.id = dp.season_id
          where s.league_id = $1) as draft_picks,
       (select count(*)::int from manager_leagues where league_id = $1) as managers`,
    [leagueId],
  );
  return r[0];
}
