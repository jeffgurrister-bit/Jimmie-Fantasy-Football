# Column contract

<!-- GENERATED FILE — do not edit by hand.
     Source: packages/sync/src/columns.ts
     Regenerate: pnpm --filter @jff/sync exec tsx src/generate-contract.ts -->

This is the agreement between the spreadsheets and the website.

**The short version, for Jimmie:** you can add rows, add whole new years, fix
values, and reorder columns whenever you like — none of that breaks anything.
What breaks the site is **renaming or deleting** one of the columns listed below,
or **inserting a row above the header row** on a sheet.

If you do rename one, nothing silently goes wrong: the update simply refuses to
run and tells you which column it can no longer find, and the site keeps showing
the last good data until it is fixed.

---

## `GameData`

Every game, stored twice — once from each team's perspective. The A/B column says which side a row is. Filter to A/B = "A" for unique games; use every row for per-team stats.

Headers are on **row 2** of the sheet (the rows above it are the
title banner). Adding or removing a row above the headers breaks this.

### Columns the website reads

| Column in the sheet | Read as | Type | Must have a value |
| --- | --- | --- | --- |
| `Name_Yr_Wk` | `name_yr_wk` | string | **yes** |
| `ID` | `source_id` | string | no |
| `Opp ID` | `opp_source_id` | string | no |
| `YEAR_WK` | `year_wk` | string | no |
| `# of Teams` | `num_teams` | int | no |
| `A/B` | `ab_side` | string | **yes** |
| `Year` | `year` | int | **yes** |
| `Game #` | `game_number` | int | no |
| `Week` | `week` | int | **yes** |
| `Time of Season` | `time_of_season` | string | **yes** |
| `Round` | `round` | int | no |
| `Round/ Game` | `round_game` | string | no |
| `Seed` | `seed` | int | no |
| `Team` | `team` | string | **yes** |
| `Score` | `score` | number | no |
| `Proj. Score` | `projected_score` | number | no |
| `Opponent` | `opponent` | string | no |
| `Opp. Score` | `opponent_score` | number | no |
| `Opp. Proj. Score` | `opponent_projected_score` | number | no |
| `Favorite/ Underdog` | `favorite_or_underdog` | string | no |
| `W` | `wins` | number | no |
| `L` | `losses` | number | no |
| `Pt. Diff.` | `point_diff` | number | no |
| `Spread` | `spread` | number | no |
| `Actual vs. Proj.` | `actual_vs_proj` | number | no |
| `Opp. Act. vs Proj.` | `opp_actual_vs_proj` | number | no |
| `Division` | `division` | string | no |
| `Opp. Division` | `opp_division` | string | no |
| `Wk Hi` | `week_high` | highlow | no |
| `Wk Lo` | `week_low` | highlow | no |
| `Sea Hi` | `season_high` | highlow | no |
| `Sea Lo` | `season_low` | highlow | no |
| `Car Hi` | `career_high` | highlow | no |
| `Car Lo` | `career_low` | highlow | no |
| `Placed (Reg. S.)` | `placed_regular` | ordinal | no |
| `Placed (Playoff)` | `placed_playoff` | ordinal | no |
| `Placed (Div/ Conf)` | `placed_div_conf` | ordinal | no |
| `Record @ Game` | `record_at_game` | string | no |
| `Opp. Rec. @ Game` | `opp_record_at_game` | string | no |
| `Drafted From` | `drafted_from` | ordinal | no |
| `W@G` | `wins_at_game` | int | no |
| `L@G` | `losses_at_game` | int | no |
| `Opp W@G` | `opp_wins_at_game` | int | no |
| `Opp L@G` | `opp_losses_at_game` | int | no |
| `PF @ GM` | `pf_at_game` | number | no |
| `PA @ GM` | `pa_at_game` | number | no |
| `Opp. PF @ GM` | `opp_pf_at_game` | number | no |
| `Opp. PA @ GM` | `opp_pa_at_game` | number | no |
| `W Streak` | `win_streak` | int | no |
| `L Streak` | `loss_streak` | int | no |
| `Weekly Rank` | `weekly_rank` | int | no |
| `Opp. Wk Rnk` | `opp_weekly_rank` | int | no |
| `Year Rank` | `year_rank` | int | no |
| `Game Played` | `game_played` | yesno | **yes** |
| `Made Playoff` | `made_playoff` | yesno | no |

### Notes on particular columns

- **`Name_Yr_Wk`** — Team + year + week composite key from the sheet.
- **`# of Teams`** — League size that season. A real filter dimension — the league grew from 10 to 12.
- **`A/B`** — THE DEDUPE FLAG. Exactly balanced 804/804. Unique games come from the A rows only.
- **`Time of Season`** — Regular | Playoff | TB. TB is the toilet bowl / consolation bracket.
- **`Round/ Game`** — Note the space after the slash. Quarterfinal | Semifinal | Championship | 3rd Place | 5th/6th | 9th Place | 11th/12th.
- **`Team`** — Manager short name. Resolved through data/managers.yaml — never stored as a string.
- **`Division`** — Populated for 2016, 2023 and 2024 only. Blank 2017-2022 is expected, not missing data.
- **`Wk Hi`** — Set on 155 rows — the highest score of that week.
- **`Car Hi`** — Set on only 15 rows across nine seasons — a career-best game.
- **`Drafted From`** — The draft slot this team picked from that year, spelled as an ordinal (1st-12th). A filter dimension in the commissioner's own Game Pivot.
- **`Game Played`** — Respect this. Not every row is a completed game.

### Columns the website deliberately ignores

These are your own helper columns — formula scaffolding, lookup helpers and
dedupe counters. The website knows about them and skips them. Renaming or
deleting these is safe.

- `B/A`
- `Name 2 Count`
- `ID2`
- `Week2`
- `YEAR2`

---

## `LineupData`

One row per roster slot per team per week, with bench points and draft provenance denormalised onto every row. Header row is index 2 — index 1 holds a row of loose integers that is not data.

Headers are on **row 3** of the sheet (the rows above it are the
title banner). Adding or removing a row above the headers breaks this.

### Columns the website reads

| Column in the sheet | Read as | Type | Must have a value |
| --- | --- | --- | --- |
| `Name_Yr_Wk` | `name_yr_wk` | string | **yes** |
| `Name_Yr_ Wk_LS` | `name_yr_wk_ls` | string | no |
| `# of Teams` | `num_teams` | int | no |
| `Year` | `year` | int | **yes** |
| `Week` | `week` | int | **yes** |
| `Time of Season` | `time_of_season` | string | no |
| `Round` | `round` | int | no |
| `Round/ Game` | `round_game` | string | no |
| `Seed` | `seed` | int | no |
| `Team` | `team` | string | **yes** |
| `Lineup #` | `lineup_number` | int | no |
| `Lineup POS` | `lineup_position` | string | **yes** |
| `Name` | `player_name` | string | no |
| `POS` | `player_position` | string | no |
| `PTS` | `points` | number | no |
| `Proj PTS` | `projected_points` | number | no |
| `Diff` | `diff` | number | no |
| `Round Drafted` | `round_drafted` | int | no |
| `Pick Drafted` | `pick_drafted` | string | no |
| `Drafted By` | `drafted_by` | string | no |
| `Keeper` | `keeper` | string | no |
| `Keep Year` | `keep_year` | int | no |
| `Pos Rank That Week` | `pos_rank_that_week` | int | no |
| `Pos Rank W/BN` | `pos_rank_with_bench` | int | no |
| `Players above Min` | `players_above_min` | yesno | no |
| `Max Bench` | `max_bench` | number | no |
| `BN Gap` | `bench_gap` | number | no |
| `Best BN over STRT` | `best_bench_over_starter` | yesno | no |
| `Flex Eligible` | `flex_eligible` | string | no |
| `GP Count` | `games_played_count` | int | no |
| `Played Y/N` | `played` | yesno | no |
| `Reason` | `reason` | string | no |
| `Score` | `score` | number | no |
| `Proj. Score` | `projected_score` | number | no |
| `Opponent` | `opponent` | string | no |
| `Opp. Score` | `opponent_score` | number | no |
| `Opp. Proj. Score` | `opponent_projected_score` | number | no |
| `Pt. Diff.` | `point_diff` | number | no |
| `Spread` | `spread` | number | no |
| `Actual vs. Proj.` | `actual_vs_proj` | number | no |
| `Opp. Act. vs Proj.` | `opp_actual_vs_proj` | number | no |
| `W` | `wins` | number | no |
| `L` | `losses` | number | no |
| `W Streak` | `win_streak` | int | no |
| `L Streak` | `loss_streak` | int | no |
| `Favorite/ Underdog` | `favorite_or_underdog` | string | no |
| `Division` | `division` | string | no |
| `Opp. Division` | `opp_division` | string | no |
| `Wk Hi` | `week_high` | highlow | no |
| `Wk Lo` | `week_low` | highlow | no |
| `Sea Hi` | `season_high` | highlow | no |
| `Sea Lo` | `season_low` | highlow | no |
| `Car Hi` | `career_high` | highlow | no |
| `Car Lo` | `career_low` | highlow | no |
| `Placed (Reg. S.)` | `placed_regular` | ordinal | no |
| `Placed (Playoff)` | `placed_playoff` | ordinal | no |
| `Drafted From` | `drafted_from` | ordinal | no |
| `Placed (Div/ Conf)` | `placed_div_conf` | ordinal | no |
| `PPG` | `ppg` | number | no |
| `Game #` | `game_number` | int | no |
| `YEAR_WK` | `year_wk` | string | no |
| `W %` | `win_pct` | number | no |

### Notes on particular columns

- **`Name_Yr_ Wk_LS`** — The stray space after "Yr_" is really in the sheet. Do not correct it.
- **`Lineup POS`** — QB | RB | WR | TE | FLEX | K | DEF | BN | IR. BN is bench, IR is injured reserve.
- **`Pick Drafted`** — String, not number: "1.1" and "1.10" collide numerically.
- **`Drafted By`** — Can differ from Team — the player was drafted elsewhere and acquired later.
- **`Keeper`** — Keeper | NO
- **`Players above Min`** — A 0/1 flag, set on 4,432 rows.
- **`Max Bench`** — Points scored by the best bench player. Only filled on the 2,469 flagged rows.
- **`BN Gap`** — THE bench-regret number: how many points the bench beat the starter by. Real values from -32.00 to 46.45 on 4,287 rows. This is what the "left 30 points on the bench" leaderboard sorts on.
- **`Best BN over STRT`** — A 0/1 flag marking that a bench player outscored a starter — not the margin. The margin is `BN Gap`.
- **`Reason`** — Started | Benched | IR | Bye. With Played Y/N this is what makes "should have started him" possible.

### Columns the website deliberately ignores

These are your own helper columns — formula scaffolding, lookup helpers and
dedupe counters. The website knows about them and skips them. Renaming or
deleting these is safe.

- `Year 2`
- `Week 2`
- `Team 2`

---

## `Draft History`

Every draft pick. Use the cleaned `Name` column, not `Player` — the latter arrives as a combined string like "WR - Antonio Brown - PIT". Order by OVR, never by PCK.

Headers are on **row 4** of the sheet (the rows above it are the
title banner). Adding or removing a row above the headers breaks this.

### Columns the website reads

| Column in the sheet | Read as | Type | Must have a value |
| --- | --- | --- | --- |
| `PLAYER ID` | `source_player_id` | string | no |
| `Year` | `year` | int | **yes** |
| `RND` | `round` | int | no |
| `PCK` | `pick` | string | no |
| `OVR` | `overall` | int | **yes** |
| `Player` | `raw_player_string` | string | no |
| `POS` | `position` | string | no |
| `NFL` | `nfl_team` | string | no |
| `Drafted By` | `drafted_by` | string | **yes** |
| `Keeper` | `keeper` | string | no |
| `Name` | `player_name` | string | **yes** |

### Notes on particular columns

- **`PCK`** — Text on purpose: "1.1" and "1.10" are different picks that collide as numbers.
- **`OVR`** — The reliable ordering key.
- **`Player`** — Combined "POS - Name - NFL" string. Kept for audit; not used for display.
- **`Name`** — The already-cleaned player name. This is the one to use.

### Columns the website deliberately ignores

These are your own helper columns — formula scaffolding, lookup helpers and
dedupe counters. The website knows about them and skips them. Renaming or
deleting these is safe.

- `Replace left`
- `Char count`
- `Replace Right`

---

## `Finishes`

Season-level finish per team per year. `Playoff` is the champion indicator: Playoff = "1st" means that team won the league. Finishes are ordinal strings and are parsed to integers.

Headers are on **row 2** of the sheet (the rows above it are the
title banner). Adding or removing a row above the headers breaks this.

### Columns the website reads

| Column in the sheet | Read as | Type | Must have a value |
| --- | --- | --- | --- |
| `ID` | `source_id` | string | **yes** |
| `# of Teams` | `num_teams` | int | no |
| `Year` | `year` | int | **yes** |
| `Name` | `team` | string | **yes** |
| `Division` | `division` | string | no |
| `Draft Slot` | `draft_slot` | ordinal | no |
| `Season` | `regular_finish` | ordinal | no |
| `Div/ Conf` | `division_finish` | ordinal | no |
| `Playoff` | `final_finish` | ordinal | no |
| `Finals` | `made_finals` | yesno | no |
| `Place/Yr` | `raw_place_per_year` | raw | no |
| `Reg/Yr` | `raw_regular_per_year` | raw | no |

### Notes on particular columns

- **`ID`** — Format is {Year}_{Name}, e.g. "2016_Jerry".
- **`Draft Slot`** — Spelled as an ordinal in the sheet ("8th"), stored as an integer.
- **`Season`** — Regular season finish.
- **`Playoff`** — Final overall finish. "1st" = league champion. Blank for all of 2024 — see OPEN-QUESTIONS q5.

### Columns the website deliberately ignores

These are your own helper columns — formula scaffolding, lookup helpers and
dedupe counters. The website knows about them and skips them. Renaming or
deleting these is safe.

- `LIST`
- `Name2`

---

## `Players`

Canonical player list with position. The counter columns are the commissioner's own dedupe QA and are not imported.

Headers are on **row 2** of the sheet (the rows above it are the
title banner). Adding or removing a row above the headers breaks this.

### Columns the website reads

| Column in the sheet | Read as | Type | Must have a value |
| --- | --- | --- | --- |
| `POS` | `position` | string | no |
| `Name` | `name` | string | **yes** |

### Columns the website deliberately ignores

These are your own helper columns — formula scaffolding, lookup helpers and
dedupe counters. The website knows about them and skips them. Renaming or
deleting these is safe.

- `Name Count`
- `Draft Count`
- `Fixed`

---

## For whoever maintains the code

To change any of the above, edit `packages/sync/src/columns.ts` — that is the only
file that knows the sheet header strings, and it is the only file that needs to
change when a column is renamed. Then regenerate this document.

Rules that hold across the whole sync:

- Columns are addressed **by header name only**. There is no positional column
  access anywhere, so inserting a column in Excel cannot shift fields.
- Header matching is **exact**, never fuzzy. Fuzzy matching is how `Opp. Score`
  ends up imported into `score`.
- Header row indexes are **declared, never inferred**. Every sheet has a banner
  row above its headers, and `LineupData` has a row of loose integers as well.
- A missing or unexpected column **stops the run**. It never imports nulls over
  real history.
