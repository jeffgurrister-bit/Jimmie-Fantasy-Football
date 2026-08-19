-- =============================================================================
--  0003_lineups_drafts.sql — players, lineup slots, draft picks
-- =============================================================================
--  ~24,700 lineup rows across nine RBB seasons: every roster slot, every team,
--  every week, with bench points and draft provenance attached. This is the
--  data no free league platform gives him, and the lineup explorer is built
--  straight on top of it — so it is indexed for multi-dimensional filtering
--  (year x week x manager x position x started/benched x draft round).
-- =============================================================================

create table if not exists players (
  id                 serial primary key,
  canonical_name     text not null unique,
  primary_position   text,
  created_at         timestamptz not null default now()
);
create index if not exists players_position_idx on players (primary_position);

create table if not exists lineup_slots (
  id                serial primary key,
  game_team_id      int  not null references game_teams(id) on delete cascade,
  player_id         int  references players(id) on delete set null,
  -- Denormalised for query speed on the explorer: filtering 25k rows by season
  -- and week should not need three joins.
  season_id         int  not null references seasons(id) on delete cascade,
  week              int  not null,
  team_season_id    int  not null references team_seasons(id) on delete cascade,

  lineup_number     int,
  lineup_position   text not null
    check (lineup_position in ('QB','RB','WR','TE','FLEX','K','DEF','BN','IR')),
  player_position   text,
  points            numeric(7,2),
  projected_points  numeric(7,2),
  diff              numeric(7,2),

  -- `was_started` is derived from the source's own `Reason` / `Played Y/N`
  -- columns rather than from lineup_position, because FLEX and IR both need
  -- care. Kept alongside the raw values so the source stays auditable.
  was_started       boolean,
  reason            text check (reason in ('Started','Benched','IR','Bye')),
  played            boolean,
  is_flex_eligible  boolean,
  games_played_count int,

  -- ---- imported bench-mismanagement metrics — DO NOT RECOMPUTE -------------
  -- Verified against the real workbook. Note which of these are flags and which
  -- are magnitudes; the handoff notes had it the other way round.
  --
  --   bench_gap               THE bench-regret number: points the bench beat the
  --                           starter by. -32.00 to 46.45, on 4,287 rows. Sort on
  --                           this for "left 30 points on the bench".
  --   max_bench               points scored by the best bench player, on the
  --                           2,469 rows where one beat a starter.
  --   best_bench_over_starter a FLAG that a bench player beat a starter (2,469).
  --   players_above_min       a FLAG, set on 4,432 rows.
  pos_rank_that_week      int,        -- 1-35, starters only
  pos_rank_with_bench     int,        -- 1-72, including bench
  players_above_min       boolean,
  max_bench               numeric(7,2),
  bench_gap               numeric(7,2),
  best_bench_over_starter boolean,

  -- ---- draft provenance, denormalised onto every lineup row by the source ---
  -- `drafted_by_manager_id` can differ from the row's own manager: the player
  -- was drafted by someone else and acquired later. That difference is the
  -- interesting part, so it is preserved rather than normalised away.
  round_drafted         int,
  pick_drafted          text,      -- '1.01'/'1.1' style; string on purpose, see 0004 note
  drafted_by_manager_id text references managers(id) on delete set null,
  drafted_from          int,       -- draft slot this team picked from (1-12)
  is_keeper             boolean not null default false,
  keep_year             int,

  unique (game_team_id, lineup_number, lineup_position, player_id)
);

-- Indexes shaped by the lineup explorer's actual filter set.
create index if not exists lineup_season_week_team_idx on lineup_slots (season_id, week, team_season_id);
create index if not exists lineup_team_idx             on lineup_slots (team_season_id);
create index if not exists lineup_player_idx           on lineup_slots (player_id);
create index if not exists lineup_position_idx         on lineup_slots (lineup_position);
create index if not exists lineup_started_idx          on lineup_slots (was_started);
create index if not exists lineup_round_drafted_idx    on lineup_slots (round_drafted);
create index if not exists lineup_points_idx           on lineup_slots (points desc);
-- Partial index for the bench-regret queries. Sorted on bench_gap, which is the
-- magnitude; best_bench_over_starter is only a flag and cannot be ranked.
create index if not exists lineup_bench_regret_idx
  on lineup_slots (bench_gap desc)
  where bench_gap is not null;

create table if not exists draft_picks (
  id          serial primary key,
  season_id   int  not null references seasons(id) on delete cascade,
  round       int,
  -- `PCK` in the source is a float-ish string where '1.1' and '1.10' collide if
  -- parsed as a number, so it is stored as text and `overall` is the ordering
  -- key. Never sort draft picks by `pick`.
  pick        text,
  overall     int  not null,
  player_id   int  references players(id) on delete set null,
  player_name text not null,      -- from the source's cleaned `Name` column, not `Player`
  position    text,
  nfl_team    text,
  manager_id  text references managers(id) on delete set null,
  is_keeper   boolean not null default false,
  unique (season_id, overall)
);
create index if not exists draft_picks_manager_idx on draft_picks (manager_id);
create index if not exists draft_picks_round_idx   on draft_picks (season_id, round);
create index if not exists draft_picks_player_idx  on draft_picks (player_id);
