-- =============================================================================
--  0004_media_dynasty_sync.sql — media content, Dyno Mites dynasty tables,
--                                banners, and sync bookkeeping
-- =============================================================================

-- RBB media: power rankings, currently authored in a separate sheet, screenshot
-- and texted out. On the site these become real pages with rank movement over
-- the season.
create table if not exists power_rankings (
  id              serial primary key,
  season_id       int  not null references seasons(id) on delete cascade,
  week            int  not null,
  team_season_id  int  not null references team_seasons(id) on delete cascade,
  rank            int  not null,
  previous_rank   int,
  blurb           text,
  unique (season_id, week, team_season_id)
);
create index if not exists power_rankings_week_idx on power_rankings (season_id, week, rank);

-- Dyno Mites media: written recaps, currently exported to PDF and attached in
-- the league chat. Linked to the week they describe.
create table if not exists recaps (
  id            serial primary key,
  league_id     text not null references leagues(id) on delete cascade,
  season_id     int  references seasons(id) on delete cascade,
  week          int,
  slug          text not null,
  title         text not null,
  body_markdown text,
  published_at  timestamptz,
  unique (league_id, slug)
);
create index if not exists recaps_season_week_idx on recaps (season_id, week);

-- Championship banner graphics. These live inside spreadsheet cells today,
-- served from docs.google.com/sheets-images-rt/... URLs that are NOT stable.
-- Never hotlink those. Export the images and store a path/URL we control.
create table if not exists banners (
  id             serial primary key,
  league_id      text not null references leagues(id) on delete cascade,
  season_id      int  references seasons(id) on delete cascade,
  kind           text not null default 'championship'
    check (kind in ('championship', 'division', 'other')),
  title          text,
  image_path     text,          -- repo-relative or object-storage path we own
  manager_id     text references managers(id) on delete set null,
  unique (league_id, season_id, kind, title)
);

-- ---------------------------------------------------------------------------
--  Dyno Mites only — dynasty league, so it carries offseason activity that RBB
--  has no equivalent of.
-- ---------------------------------------------------------------------------

create table if not exists trades (
  id          serial primary key,
  season_id   int  not null references seasons(id) on delete cascade,
  source_key  text not null unique,
  trade_date  date,
  notes       text
);
create index if not exists trades_date_idx on trades (trade_date desc);

create table if not exists trade_assets (
  id                serial primary key,
  trade_id          int  not null references trades(id) on delete cascade,
  from_manager_id   text references managers(id) on delete set null,
  to_manager_id     text references managers(id) on delete set null,
  asset_type        text,     -- player | pick | cash | other
  asset_description text not null,
  player_id         int references players(id) on delete set null
);
create index if not exists trade_assets_trade_idx on trade_assets (trade_id);
create index if not exists trade_assets_from_idx  on trade_assets (from_manager_id);
create index if not exists trade_assets_to_idx    on trade_assets (to_manager_id);

create table if not exists valuations (
  id          serial primary key,
  season_id   int  not null references seasons(id) on delete cascade,
  as_of_date  date not null,
  player_id   int  references players(id) on delete set null,
  player_name text not null,
  value       numeric(12,2),
  unique (season_id, as_of_date, player_name)
);
create index if not exists valuations_player_date_idx on valuations (player_id, as_of_date);

create table if not exists transactions (
  id           serial primary key,
  season_id    int  not null references seasons(id) on delete cascade,
  source_key   text not null unique,
  txn_date     date,
  manager_id   text references managers(id) on delete set null,
  amount       numeric(12,2),
  description  text
);
create index if not exists transactions_manager_idx on transactions (manager_id, txn_date desc);

-- ---------------------------------------------------------------------------
--  Sync bookkeeping. Phase 6 of the plan — Jimmie updating the site himself —
--  depends on him being able to see, in plain language, whether the last sync
--  worked. That means the run has to be recorded, not just logged to a console
--  he will never look at.
-- ---------------------------------------------------------------------------

create table if not exists sync_runs (
  id            serial primary key,
  league_id     text references leagues(id) on delete set null,
  source        text not null,          -- 'xlsx-backfill' | 'google-sheets'
  trigger       text not null,          -- 'cron' | 'manual' | 'cli'
  status        text not null check (status in ('running', 'success', 'failed', 'partial')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  -- Plain-English summary shown on the /admin/sync page. Written for Jimmie,
  -- not for a developer.
  summary       text,
  row_counts    jsonb not null default '{}'::jsonb,
  -- Non-fatal things worth surfacing: sources disagreeing about the newest
  -- season, unconfirmed manager identities, blank postseason results.
  warnings      jsonb not null default '[]'::jsonb,
  error_message text
);
create index if not exists sync_runs_started_idx on sync_runs (started_at desc);
