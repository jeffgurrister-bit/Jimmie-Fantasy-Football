/**
 * Row types matching packages/db/migrations. Kept hand-written and small rather
 * than generated: the schema is stable and a generator is one more thing that
 * has to keep working after handoff.
 */

export type LeagueId = 'rbb' | 'dm';
export type TimeOfSeason = 'Regular' | 'Playoff' | 'TB';
export type LineupPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'K' | 'DEF' | 'BN' | 'IR';
export type LineupReason = 'Started' | 'Benched' | 'IR' | 'Bye';

export interface League {
  id: LeagueId;
  name: string;
  short_name: string;
  first_year: number;
  identity_display: 'manager' | 'franchise';
}

export interface Manager {
  id: string;
  canonical_name: string;
  display_name: string;
  is_confirmed: boolean;
  first_year: number | null;
  last_year: number | null;
  is_active: boolean;
  notes: string | null;
}

export interface Season {
  id: number;
  league_id: LeagueId;
  year: number;
  num_teams: number | null;
  num_regular_weeks: number | null;
  playoff_start_week: number | null;
  has_divisions: boolean;
}

export interface Division {
  id: number;
  season_id: number;
  name: string;
}

export interface TeamSeason {
  id: number;
  season_id: number;
  manager_id: string;
  division_id: number | null;
  franchise_name: string | null;
  draft_slot: number | null;
  regular_finish: number | null;
  division_finish: number | null;
  final_finish: number | null;
  made_finals: boolean | null;
  made_playoffs: boolean | null;
}

export interface Game {
  id: number;
  season_id: number;
  source_key: string;
  week: number;
  game_number: number | null;
  time_of_season: TimeOfSeason;
  round: number | null;
  round_game: string | null;
  num_teams: number | null;
  was_played: boolean;
}

/** One row per team per game — two rows exist for every game. */
export interface GameTeam {
  id: number;
  game_id: number;
  team_season_id: number;
  opponent_team_season_id: number | null;
  is_home_side: boolean;
  score: number | null;
  projected_score: number | null;
  opponent_score: number | null;
  is_winner: boolean | null;
  seed: number | null;
  point_diff: number | null;
  spread: number | null;
  actual_vs_proj: number | null;
  weekly_rank: number | null;
  year_rank: number | null;
  win_streak: number | null;
  loss_streak: number | null;
  /** Draft slot this team picked from that year (1-12). */
  drafted_from: number | null;
  /** Marker flags imported from the sheet — the records book reads these. */
  week_high: boolean;
  week_low: boolean;
  season_high: boolean;
  season_low: boolean;
  career_high: boolean;
  career_low: boolean;
}

export interface LineupSlot {
  id: number;
  game_team_id: number;
  player_id: number | null;
  season_id: number;
  week: number;
  team_season_id: number;
  lineup_number: number | null;
  lineup_position: LineupPosition;
  player_position: string | null;
  points: number | null;
  projected_points: number | null;
  diff: number | null;
  was_started: boolean | null;
  reason: LineupReason | null;
  played: boolean | null;
  round_drafted: number | null;
  pick_drafted: string | null;
  drafted_by_manager_id: string | null;
  is_keeper: boolean;
  keep_year: number | null;
  /** A flag that a bench player beat a starter — not the margin. */
  best_bench_over_starter: boolean | null;
  /** The bench-regret magnitude: points the bench beat the starter by. */
  bench_gap: number | null;
}

export interface SyncRun {
  id: number;
  league_id: LeagueId | null;
  source: string;
  trigger: string;
  status: 'running' | 'success' | 'failed' | 'partial';
  started_at: Date;
  finished_at: Date | null;
  summary: string | null;
  row_counts: Record<string, number>;
  warnings: SyncWarning[];
  error_message: string | null;
}

export interface SyncWarning {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}
