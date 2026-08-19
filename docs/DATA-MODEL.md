# Data model

The two things most likely to be got wrong later, first.

## 1. Every game is stored twice in the source

`GameData` has one row **per team per game** — 804 rows flagged `A` and 804 flagged
`B`, exactly balanced. So:

| Table | Rows | Built from |
| --- | --- | --- |
| `games` | one per actual game | the `A` rows only |
| `game_teams` | two per game, one per side | every row |

**Count games off `games`. Count wins, points, streaks and head-to-head off
`game_teams`.** Joining the two and counting the result doubles every total.

There is a view that gets this right — prefer it over hand-rolled joins:

```sql
select manager_id, count(*) as games_played,
       count(*) filter (where is_winner) as wins
from v_team_games
where league_id = 'rbb' and time_of_season = 'Regular'
group by manager_id;
```

The deduplication happens in exactly one place,
`packages/sync/src/transform/games.ts`, which also audits its own output: it warns
if the A/B split is uneven, if a game ends up with one side instead of two, or if a
`B` row arrives with no `A` counterpart.

Game identity is `year | week | time_of_season | the two manager ids sorted`.
Sorting is what makes both perspectives produce the same key. `time_of_season` is
in there because week 14 is both the last regular week and the first playoff week,
so one pairing can legitimately appear twice that week — two different games.

## 2. Nothing keys off a manager's name

The short names in the sheets collide: two Perkinses (`Jimmie`, `Jim`), two Joneses
(Josh, Austin), two Malaks (`Jerry`, `Joe`), two Joshes (`Josh`, `Yisha`). Every
table therefore references `managers.id`, a stable slug from the hand-authored
`data/managers.yaml`.

`manager_aliases` maps every spelling in every sheet to one person. The sync
resolves names through it and **fails on any name it does not recognise** rather
than inventing a manager or dropping the row. A manager whose identity is not yet
confirmed blocks the sync entirely — see [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md).

## Derived stats are imported, never recomputed

Roughly half the columns in `GameData` and `LineupData` are stats the commissioner
already computes: weekly/season/career highs and lows, running record at the time
of the game, win and loss streaks, weekly rank, and the bench-mismanagement
metrics (`Best BN over STRT`, `BN Gap`, `Max Bench`, `Players above Min`).

These are stored as they arrive. His definitions are the ones the league argues
about, and re-deriving them would produce subtly different numbers he would spot
immediately. If a number on the site looks wrong, the fix is in his spreadsheet,
not in application code.

## Divisions belong to a season, not to a manager

The league ran two divisions in 2016 (`Biscuits`, `Gravy`), none from 2017 to 2022,
and three from 2023 (`Bun Spreaders`, `Burnt Biscuits`, `Gravy Goons`). So
`divisions` hangs off `seasons`, and `team_seasons.division_id` is nullable.
Anything divisional must be season-aware and show nothing for 2017–2022.

## Finishes are integers

The source spells them `1st`, `2nd`, `12th`. Stored as integers so that "who
finished better" is a comparison rather than a string sort where `10th` sorts before
`2nd`, and formatted back for display. The original strings are kept alongside in
`raw_*` columns in case the exact phrasing matters.

`final_finish = 1` is the champion. A blank is unknown, **not** last place — every
2024 row is blank, and the sync warns about a season with no champion rather than
rendering an empty banner.

## Table map

```
leagues ─┬─ seasons ─┬─ divisions
         │           ├─ team_seasons ─┬─ game_teams ── lineup_slots
         │           │                └─ power_rankings
         │           ├─ games ── game_teams
         │           ├─ draft_picks
         │           └─ trades / valuations / transactions   (Dyno Mites only)
         ├─ managers ── manager_aliases
         ├─ recaps
         └─ banners

sync_runs   — one row per update attempt, with a plain-English summary
```

`lineup_slots` carries `season_id`, `week` and `team_season_id` denormalised
alongside its `game_team_id`, because the lineup explorer filters ~24,700 rows by
year, week, manager, position, started/benched and draft round, and that should not
need three joins. It is indexed for exactly those combinations, plus a partial
index for the bench-regret queries.

`lineup_slots.drafted_by_manager_id` frequently differs from the row's own manager
— the player was drafted by someone else and acquired later. That difference is the
interesting part of the data, so it is preserved rather than normalised away.
