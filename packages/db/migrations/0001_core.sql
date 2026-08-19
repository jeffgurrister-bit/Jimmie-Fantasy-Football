-- =============================================================================
--  0001_core.sql — leagues, seasons, managers, divisions, team-seasons
-- =============================================================================
--  Read docs/DATA-MODEL.md before changing anything in here. Two rules carry
--  most of the weight:
--    1. Nothing keys off a manager's name. Names collide (two Perkinses, two
--       Joneses, two Malaks). Everything keys off managers.id, which comes from
--       the hand-authored data/managers.yaml.
--    2. Divisions belong to a season, not to a manager. RBB ran two divisions
--       in 2016, none from 2017-2022, and three from 2023.
-- =============================================================================

create table if not exists leagues (
  id                text primary key,          -- 'rbb' | 'dm'
  name              text not null,
  short_name        text not null,
  first_year        int  not null,
  identity_display  text not null default 'manager'
    check (identity_display in ('manager', 'franchise')),
  created_at        timestamptz not null default now()
);

-- Managers are people, not teams. One row per human, spanning every season and
-- both leagues. Sourced entirely from data/managers.yaml.
create table if not exists managers (
  id              text primary key,            -- stable slug, e.g. 'josh-baker'
  canonical_name  text not null,
  display_name    text not null,
  -- false means the identity is still a guess. The sync refuses to load
  -- unconfirmed managers unless explicitly overridden, and the site badges
  -- them as provisional. See data/managers.yaml.
  is_confirmed    boolean not null default false,
  first_year      int,
  last_year       int,                          -- null = still active
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Every spelling of a manager's name that appears in any source sheet.
-- The sync resolves source name strings through this table and fails loudly on
-- any string it cannot find, rather than inventing a manager or dropping a row.
create table if not exists manager_aliases (
  alias        text primary key,                -- exact string as it appears in the sheet
  alias_norm   text not null,                   -- casefolded/trimmed for lookup
  manager_id   text not null references managers(id) on delete cascade
);
create unique index if not exists manager_aliases_norm_uniq on manager_aliases (alias_norm);
create index if not exists manager_aliases_manager_idx on manager_aliases (manager_id);

create table if not exists manager_leagues (
  manager_id  text not null references managers(id) on delete cascade,
  league_id   text not null references leagues(id)  on delete cascade,
  primary key (manager_id, league_id)
);

create table if not exists seasons (
  id                  serial primary key,
  league_id           text not null references leagues(id) on delete cascade,
  year                int  not null,
  num_teams           int,
  num_regular_weeks   int,
  playoff_start_week  int,
  has_divisions       boolean not null default false,
  unique (league_id, year)
);
create index if not exists seasons_league_year_idx on seasons (league_id, year desc);

-- Per-season, because the division set changed: {Biscuits, Gravy} in 2016,
-- nothing 2017-2022, {Bun Spreaders, Burnt Biscuits, Gravy Goons} from 2023.
create table if not exists divisions (
  id         serial primary key,
  season_id  int  not null references seasons(id) on delete cascade,
  name       text not null,
  unique (season_id, name)
);

-- One manager's participation in one season: their team for that year.
-- This is the thing games and lineups actually point at.
create table if not exists team_seasons (
  id               serial primary key,
  season_id        int  not null references seasons(id) on delete cascade,
  manager_id       text not null references managers(id) on delete restrict,
  division_id      int  references divisions(id) on delete set null,
  franchise_name   text,               -- Dyno Mites only; null for RBB
  draft_slot       int,
  -- Finishes are stored as integers (1, 2, 12) and formatted as 1st/2nd/12th in
  -- the UI. The source spells them as ordinal strings; raw_* keeps the original
  -- so nothing is lost if the commissioner's spelling carries meaning.
  regular_finish   int,
  division_finish  int,
  final_finish     int,
  raw_regular_finish  text,
  raw_division_finish text,
  raw_final_finish    text,
  made_finals      boolean,
  made_playoffs    boolean,
  unique (season_id, manager_id)
);
create index if not exists team_seasons_manager_idx on team_seasons (manager_id);
create index if not exists team_seasons_season_idx  on team_seasons (season_id);
create index if not exists team_seasons_division_idx on team_seasons (division_id);
