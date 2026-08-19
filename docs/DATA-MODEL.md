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
already computes: highs and lows, running record at the time of the game, win and
loss streaks, weekly rank, and the bench-mismanagement metrics.

These are stored as they arrive. His definitions are the ones the league argues
about, and re-deriving them would produce subtly different numbers he would spot
immediately. If a number on the site looks wrong, the fix is in his spreadsheet,
not in application code.

### The high/low markers are flags

`week_high`, `week_low`, `season_high`, `season_low`, `career_high`, `career_low`
hold the words `HIGH`/`LOW` in the sheet and are stored as booleans. Verified
against the real workbook:

| Flag | Rows set | Meaning |
| --- | --- | --- |
| `week_high` / `week_low` | 155 each | one per week |
| `season_high` / `season_low` | 102 each | one per team-season |
| `career_high` / `career_low` | 15 each | one per manager |

The all-time high score (210.57) is exactly the row flagged `career_high`, so the
records book is an index lookup:

```sql
select m.display_name, s.year, g.week, gt.score
from game_teams gt
  join games g on g.id = gt.game_id
  join seasons s on s.id = g.season_id
  join team_seasons ts on ts.id = gt.team_season_id
  join managers m on m.id = ts.manager_id
where gt.career_high
order by gt.score desc;
```

### The bench metrics: which are flags, which are magnitudes

**The handoff notes had this backwards, so read carefully.** Verified against the
real workbook:

| Column | Type | Rows | What it is |
| --- | --- | --- | --- |
| `bench_gap` | numeric | 4,287 | **the magnitude** — points the bench beat the starter by, −32.00 to 46.45 |
| `max_bench` | numeric | 2,469 | points scored by the best bench player |
| `best_bench_over_starter` | boolean | 2,469 set | a **flag** that a bench player beat a starter |
| `players_above_min` | boolean | 4,432 set | a **flag** |

So the "left 30 points on the bench" leaderboard sorts on **`bench_gap`**. Sorting
on `best_bench_over_starter` gives a column of identical `true`s and a meaningless
ranking. The partial index is on `bench_gap` accordingly.

```sql
-- The worst bench decision in league history.
select s.year, ls.week, m.display_name, p.canonical_name, ls.points, ls.bench_gap
from lineup_slots ls
  join seasons s on s.id = ls.season_id
  join team_seasons ts on ts.id = ls.team_season_id
  join managers m on m.id = ts.manager_id
  join players p on p.id = ls.player_id
where ls.bench_gap is not null
order by ls.bench_gap desc limit 10;
```

### Sentinel words

The sheets use words where numbers would go, and they mean something:

- **`Undrafted`** — 6,734 lineup rows. Fills `Round Drafted` *and* `Drafted By`: the
  player came off waivers, so `round_drafted` and `drafted_by_manager_id` are null.
  `pick_drafted` keeps the word itself so the fact is not lost.
- **`Bye`** — 173 rows, in the points columns, matching `Reason = Bye` exactly.
- **`–`** — an en-dash, not an ASCII hyphen, in one points cell. Means no value.

These are declared per column in `packages/sync/src/columns.ts` as `sentinels`, so
genuinely unexpected text still stops the sync.

## Scaffolding rows

Each sheet's formulas are dragged one row past the real data, leaving a row that
is not blank but has no identity — `GameData`'s last row holds `ID = "__"`,
`YEAR_WK = "_"` and zeros. Each sheet therefore declares a `keyColumn`, and rows
with no value there are skipped and **counted**, so the run reports them rather
than hiding that rows were dropped.

Keying on the *first* column would not work: `LIST` on `Finishes` is populated on
only 12 of 102 rows, and `Draft History`'s first column is unnamed.

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

## Verified shape of the real data

From loading the actual workbook:

| | |
| --- | --- |
| Seasons | 9 (2016–2024) |
| Games | 804 unique, 1,608 team-rows, all with exactly 2 sides |
| Team-seasons | 102 — 10 managers 2016–2018, 12 from 2019 |
| Managers | 15 distinct names across all sheets |
| Divisions | 8 — two in 2016, three each in 2023 and 2024, none 2017–2022 |
| Lineup rows | 24,668 — 13,820 started, 10,848 bench/IR |
| Draft picks | 1,494 |
| Players | 825 (777 from the `Players` sheet, the rest folded in from lineups and drafts) |

A full backfill takes about 20 seconds.

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
