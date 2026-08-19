-- =============================================================================
--  0002_games.sql — games and game_teams
-- =============================================================================
--  THE SINGLE EASIEST THING TO GET WRONG IN THIS PROJECT
--  ----------------------------------------------------
--  The source sheet `GameData` stores every game TWICE, once from each team's
--  point of view, flagged in its `A/B` column (804 rows 'A', 804 rows 'B').
--
--    * `games`      — ONE row per actual game. Built only from the 'A' rows.
--    * `game_teams` — TWO rows per game, one per side. Built from all rows.
--
--  So: count games off `games`. Count a manager's wins, points, streaks off
--  `game_teams`. Joining `games` to `game_teams` and counting the result gives
--  you double every total, which is exactly the bug that makes a league history
--  site embarrassing. There is a view at the bottom of this file that gets it
--  right; prefer it over hand-rolled joins.
-- =============================================================================

create table if not exists games (
  id              serial primary key,
  season_id       int  not null references seasons(id) on delete cascade,
  -- Stable natural key so re-running the sync updates rows instead of
  -- duplicating them. Built from year + week + the two manager ids sorted
  -- alphabetically, so it is identical no matter which side we read it from.
  source_key      text not null unique,
  week            int  not null,
  game_number     int,
  time_of_season  text not null check (time_of_season in ('Regular', 'Playoff', 'TB')),
  round           int  check (round in (1, 2, 3)),
  round_game      text,   -- Quarterfinal | Semifinal | Championship | 3rd Place | 5th/6th | 9th Place | 11th/12th
  num_teams       int,    -- league size that season; a real filter dimension (10 vs 12 team eras)
  -- The source has an explicit `Game Played` YES/NO flag. Respect it; not every
  -- row is a played game.
  was_played      boolean not null default true
);
create index if not exists games_season_week_idx on games (season_id, week);
create index if not exists games_time_of_season_idx on games (time_of_season);
create index if not exists games_round_game_idx on games (round_game);

-- One row per team per game — both perspectives kept.
-- Every column below the divider is a stat the commissioner already computes in
-- his spreadsheet. It is imported verbatim and never recalculated here: his
-- definitions are the ones the league argues about, and re-deriving them would
-- produce subtly different numbers he would spot immediately.
create table if not exists game_teams (
  id                  serial primary key,
  game_id             int  not null references games(id) on delete cascade,
  team_season_id      int  not null references team_seasons(id) on delete cascade,
  opponent_team_season_id int references team_seasons(id) on delete set null,
  is_home_side        boolean not null,   -- true for the source's 'A' row; presentational only
  score               numeric(8,2),
  projected_score     numeric(8,2),
  opponent_score      numeric(8,2),
  opponent_projected_score numeric(8,2),
  is_winner           boolean,
  is_loser            boolean,
  seed                int,
  division_id         int references divisions(id) on delete set null,
  opponent_division_id int references divisions(id) on delete set null,

  -- ---- imported derived stats — DO NOT RECOMPUTE ----------------------------
  point_diff          numeric(8,2),
  spread              numeric(8,2),
  actual_vs_proj      numeric(8,2),
  opp_actual_vs_proj  numeric(8,2),
  favorite_or_underdog text,
  record_at_game      text,      -- display string, e.g. '3-2'
  opp_record_at_game  text,
  wins_at_game        int,
  losses_at_game      int,
  opp_wins_at_game    int,
  opp_losses_at_game  int,
  pf_at_game          numeric(9,2),
  pa_at_game          numeric(9,2),
  opp_pf_at_game      numeric(9,2),
  opp_pa_at_game      numeric(9,2),
  win_streak          int,
  loss_streak         int,
  weekly_rank         int,
  opp_weekly_rank     int,
  year_rank           int,
  made_playoff        boolean,
  -- The draft slot this team picked from that year (1-12). Spelled as an ordinal
  -- in the sheet; a filter dimension in his own Game Pivot.
  drafted_from        int,
  placed_regular      int,
  placed_playoff      int,
  placed_div_conf     int,
  -- The six high/low markers. The sheet spells these "HIGH"/"LOW" when they apply
  -- and leaves them blank otherwise, so they are flags. Verified against the
  -- workbook: season_high is set on exactly 102 rows — one per team-season — and
  -- career_high on only 15 across nine seasons.
  --
  -- These are the records book's fastest queries: the highest score in league
  -- history is `where career_high` rather than a sort over 1,608 rows.
  week_high           boolean not null default false,
  week_low            boolean not null default false,
  season_high         boolean not null default false,
  season_low          boolean not null default false,
  career_high         boolean not null default false,
  career_low          boolean not null default false,

  unique (game_id, team_season_id)
);
create index if not exists game_teams_team_idx      on game_teams (team_season_id);
create index if not exists game_teams_game_idx      on game_teams (game_id);
create index if not exists game_teams_opponent_idx  on game_teams (opponent_team_season_id);
create index if not exists game_teams_score_idx     on game_teams (score desc);
create index if not exists game_teams_seed_idx      on game_teams (seed);
-- Partial indexes for the records book: only a handful of rows are marked, so
-- these stay tiny and answer "best game ever" without scanning.
create index if not exists game_teams_career_high_idx on game_teams (score desc) where career_high;
create index if not exists game_teams_career_low_idx  on game_teams (score) where career_low;
create index if not exists game_teams_week_high_idx   on game_teams (game_id) where week_high;

-- Use this instead of joining games to game_teams by hand. One row per team per
-- game with the season, manager and matchup context already attached, so
-- counting rows counts team-games and never double-counts.
create or replace view v_team_games as
select
  gt.id                as game_team_id,
  g.id                 as game_id,
  s.league_id,
  s.year,
  g.week,
  g.time_of_season,
  g.round,
  g.round_game,
  g.num_teams,
  g.was_played,
  ts.manager_id,
  ts.id                as team_season_id,
  om.id                as opponent_manager_id,
  gt.score,
  gt.projected_score,
  gt.opponent_score,
  gt.is_winner,
  gt.point_diff,
  gt.spread,
  gt.actual_vs_proj,
  gt.seed,
  gt.weekly_rank,
  gt.year_rank,
  gt.win_streak,
  gt.loss_streak,
  gt.drafted_from,
  d.name               as division_name
from game_teams gt
join games g        on g.id  = gt.game_id
join seasons s      on s.id  = g.season_id
join team_seasons ts on ts.id = gt.team_season_id
left join team_seasons ots on ots.id = gt.opponent_team_season_id
left join managers om on om.id = ots.manager_id
left join divisions d on d.id = gt.division_id;
