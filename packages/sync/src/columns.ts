/**
 * =============================================================================
 *  THE COLUMN CONTRACT — the only place in this codebase that knows what the
 *  commissioner's spreadsheet headers are called.
 * =============================================================================
 *
 *  `source` strings are EXACT, including the irregular spacing the sheets
 *  actually contain: "Round/ Game" (space after the slash), "Name_Yr_ Wk_LS"
 *  (stray space in the middle), "Placed (Reg. S.)". Do not tidy them up. They
 *  are matched literally, never fuzzily — a fuzzy match is how you end up
 *  importing "Opp. Score" into the `score` field.
 *
 *  If a column gets renamed in the sheet, this file is the ONLY one that needs
 *  editing. The sync will refuse to run until it is, naming the sheet and the
 *  column, rather than importing nulls over nine years of history.
 *
 *  `docs/COLUMN-CONTRACT.md` is generated from this file — run
 *  `pnpm --filter @jff/sync exec tsx src/generate-contract.ts` after editing.
 * =============================================================================
 */
import type { SheetSpec } from './schema.ts';

/** Header rows are never 0 — every sheet has a title banner above the headers. */
export const HEADER_ROWS = {
  GameData: 1,
  LineupData: 2,
  'Draft History': 3,
  Finishes: 1,
  Players: 1,
} as const;

// -----------------------------------------------------------------------------
//  GameData — 60 columns, 1,609 rows, one row PER TEAM PER GAME.
// -----------------------------------------------------------------------------
export const GAME_DATA: SheetSpec = {
  key: 'GameData',
  sheetName: 'GameData',
  headerRow: HEADER_ROWS.GameData,
  keyColumn: 'Name_Yr_Wk',
  description:
    'Every game, stored twice — once from each team\'s perspective. The A/B column ' +
    'says which side a row is. Filter to A/B = "A" for unique games; use every row ' +
    'for per-team stats.',
  columns: [
    { source: 'Name_Yr_Wk', field: 'name_yr_wk', kind: 'string', requireValue: true,
      note: 'Team + year + week composite key from the sheet.' },
    { source: 'ID', field: 'source_id', kind: 'string' },
    { source: 'Opp ID', field: 'opp_source_id', kind: 'string' },
    { source: 'YEAR_WK', field: 'year_wk', kind: 'string' },
    { source: '# of Teams', field: 'num_teams', kind: 'int',
      note: 'League size that season. A real filter dimension — the league grew from 10 to 12.' },
    { source: 'A/B', field: 'ab_side', kind: 'string', requireValue: true,
      note: 'THE DEDUPE FLAG. Exactly balanced 804/804. Unique games come from the A rows only.' },
    { source: 'Year', field: 'year', kind: 'int', requireValue: true },
    { source: 'Game #', field: 'game_number', kind: 'int' },
    { source: 'Week', field: 'week', kind: 'int', requireValue: true },
    { source: 'Time of Season', field: 'time_of_season', kind: 'string', requireValue: true,
      note: 'Regular | Playoff | TB. TB is the toilet bowl / consolation bracket.' },
    { source: 'Round', field: 'round', kind: 'int' },
    { source: 'Round/ Game', field: 'round_game', kind: 'string',
      note: 'Note the space after the slash. Quarterfinal | Semifinal | Championship | 3rd Place | 5th/6th | 9th Place | 11th/12th.' },
    { source: 'Seed', field: 'seed', kind: 'int' },
    { source: 'Team', field: 'team', kind: 'string', requireValue: true,
      note: 'Manager short name. Resolved through data/managers.yaml — never stored as a string.' },
    { source: 'Score', field: 'score', kind: 'number' },
    { source: 'Proj. Score', field: 'projected_score', kind: 'number' },
    { source: 'Opponent', field: 'opponent', kind: 'string' },
    { source: 'Opp. Score', field: 'opponent_score', kind: 'number' },
    { source: 'Opp. Proj. Score', field: 'opponent_projected_score', kind: 'number' },
    { source: 'Favorite/ Underdog', field: 'favorite_or_underdog', kind: 'string' },
    { source: 'W', field: 'wins', kind: 'number' },
    { source: 'L', field: 'losses', kind: 'number' },
    { source: 'Pt. Diff.', field: 'point_diff', kind: 'number' },
    { source: 'Spread', field: 'spread', kind: 'number' },
    { source: 'Actual vs. Proj.', field: 'actual_vs_proj', kind: 'number' },
    { source: 'Opp. Act. vs Proj.', field: 'opp_actual_vs_proj', kind: 'number' },
    { source: 'Division', field: 'division', kind: 'string',
      note: 'Populated for 2016, 2023 and 2024 only. Blank 2017-2022 is expected, not missing data.' },
    { source: 'Opp. Division', field: 'opp_division', kind: 'string' },
    // The six high/low markers hold the text "HIGH" or "LOW" when they apply and
    // are blank otherwise, so they are flags. Confirmed against the workbook:
    // `Sea Hi` is set on exactly 102 rows, one per team-season.
    { source: 'Wk Hi', field: 'week_high', kind: 'highlow',
      note: 'Set on 155 rows — the highest score of that week.' },
    { source: 'Wk Lo', field: 'week_low', kind: 'highlow' },
    { source: 'Sea Hi', field: 'season_high', kind: 'highlow' },
    { source: 'Sea Lo', field: 'season_low', kind: 'highlow' },
    { source: 'Car Hi', field: 'career_high', kind: 'highlow',
      note: 'Set on only 15 rows across nine seasons — a career-best game.' },
    { source: 'Car Lo', field: 'career_low', kind: 'highlow' },
    // The three "Placed" columns are ordinals (1st-12th), not free text.
    { source: 'Placed (Reg. S.)', field: 'placed_regular', kind: 'ordinal' },
    { source: 'Placed (Playoff)', field: 'placed_playoff', kind: 'ordinal' },
    { source: 'Placed (Div/ Conf)', field: 'placed_div_conf', kind: 'ordinal' },
    { source: 'Record @ Game', field: 'record_at_game', kind: 'string' },
    { source: 'Opp. Rec. @ Game', field: 'opp_record_at_game', kind: 'string' },
    { source: 'Drafted From', field: 'drafted_from', kind: 'ordinal',
      note:
        'The draft slot this team picked from that year, spelled as an ordinal ' +
        '(1st-12th). A filter dimension in the commissioner\'s own Game Pivot.' },
    { source: 'W@G', field: 'wins_at_game', kind: 'int' },
    { source: 'L@G', field: 'losses_at_game', kind: 'int' },
    { source: 'Opp W@G', field: 'opp_wins_at_game', kind: 'int' },
    { source: 'Opp L@G', field: 'opp_losses_at_game', kind: 'int' },
    { source: 'PF @ GM', field: 'pf_at_game', kind: 'number' },
    { source: 'PA @ GM', field: 'pa_at_game', kind: 'number' },
    { source: 'Opp. PF @ GM', field: 'opp_pf_at_game', kind: 'number' },
    { source: 'Opp. PA @ GM', field: 'opp_pa_at_game', kind: 'number' },
    { source: 'W Streak', field: 'win_streak', kind: 'int' },
    { source: 'L Streak', field: 'loss_streak', kind: 'int' },
    { source: 'Weekly Rank', field: 'weekly_rank', kind: 'int' },
    { source: 'Opp. Wk Rnk', field: 'opp_weekly_rank', kind: 'int' },
    { source: 'Year Rank', field: 'year_rank', kind: 'int' },
    { source: 'Game Played', field: 'game_played', kind: 'yesno', requireValue: true,
      note: 'Respect this. Not every row is a completed game.' },
    { source: 'Made Playoff', field: 'made_playoff', kind: 'yesno' },
  ],
  ignored: [
    'B/A', // mirror of A/B
    'Name 2 Count', // dedupe counter
    'ID2', // lookup helper
    'Week2', // lookup helper
    'YEAR2', // lookup helper
  ],
};

// -----------------------------------------------------------------------------
//  LineupData — 65 columns, 24,668 rows. Every roster slot, every team, every
//  week. This is what the lineup explorer is built on.
// -----------------------------------------------------------------------------
export const LINEUP_DATA: SheetSpec = {
  key: 'LineupData',
  sheetName: 'LineupData',
  headerRow: HEADER_ROWS.LineupData,
  keyColumn: 'Name_Yr_Wk',
  description:
    'One row per roster slot per team per week, with bench points and draft ' +
    'provenance denormalised onto every row. Header row is index 2 — index 1 ' +
    'holds a row of loose integers that is not data.',
  columns: [
    { source: 'Name_Yr_Wk', field: 'name_yr_wk', kind: 'string', requireValue: true },
    { source: 'Name_Yr_ Wk_LS', field: 'name_yr_wk_ls', kind: 'string',
      note: 'The stray space after "Yr_" is really in the sheet. Do not correct it.' },
    { source: '# of Teams', field: 'num_teams', kind: 'int' },
    { source: 'Year', field: 'year', kind: 'int', requireValue: true },
    { source: 'Week', field: 'week', kind: 'int', requireValue: true },
    { source: 'Time of Season', field: 'time_of_season', kind: 'string' },
    { source: 'Round', field: 'round', kind: 'int' },
    { source: 'Round/ Game', field: 'round_game', kind: 'string' },
    { source: 'Seed', field: 'seed', kind: 'int' },
    { source: 'Team', field: 'team', kind: 'string', requireValue: true },
    { source: 'Lineup #', field: 'lineup_number', kind: 'int' },
    { source: 'Lineup POS', field: 'lineup_position', kind: 'string', requireValue: true,
      note: 'QB | RB | WR | TE | FLEX | K | DEF | BN | IR. BN is bench, IR is injured reserve.' },
    { source: 'Name', field: 'player_name', kind: 'string' },
    { source: 'POS', field: 'player_position', kind: 'string' },
    // A player on bye has the word "Bye" where his points would be. That is
    // information, not corruption — `Reason` says "Bye" on exactly these 173 rows.
    { source: 'PTS', field: 'points', kind: 'number', sentinels: ['Bye'] },
    { source: 'Proj PTS', field: 'projected_points', kind: 'number', sentinels: ['Bye'] },
    { source: 'Diff', field: 'diff', kind: 'number', sentinels: ['Bye'] },
    // 6,734 lineup rows hold "Undrafted" here — a player picked up off waivers
    // rather than drafted. `Pick Drafted` keeps the word itself, so the fact is
    // not lost when the round becomes null.
    { source: 'Round Drafted', field: 'round_drafted', kind: 'int', sentinels: ['Undrafted'] },
    { source: 'Pick Drafted', field: 'pick_drafted', kind: 'string',
      note: 'String, not number: "1.1" and "1.10" collide numerically.' },
    // "Undrafted" fills this on 6,734 rows: nobody drafted the player, he came off
    // waivers. Read as no-manager rather than resolved as a name.
    { source: 'Drafted By', field: 'drafted_by', kind: 'string', sentinels: ['Undrafted'],
      note: 'Can differ from Team — the player was drafted elsewhere and acquired later.' },
    { source: 'Keeper', field: 'keeper', kind: 'string', note: 'Keeper | NO' },
    { source: 'Keep Year', field: 'keep_year', kind: 'int' },
    // Pre-computed bench-mismanagement metrics. Imported, never recalculated.
    { source: 'Pos Rank That Week', field: 'pos_rank_that_week', kind: 'int' },
    { source: 'Pos Rank W/BN', field: 'pos_rank_with_bench', kind: 'int' },
    // Verified against the workbook: this is a 0/1 flag on 2,469 rows, NOT a
    // magnitude — it marks a row where a bench player beat a starter.
    { source: 'Players above Min', field: 'players_above_min', kind: 'yesno',
      note: 'A 0/1 flag, set on 4,432 rows.' },
    { source: 'Max Bench', field: 'max_bench', kind: 'number',
      note: 'Points scored by the best bench player. Only filled on the 2,469 flagged rows.' },
    { source: 'BN Gap', field: 'bench_gap', kind: 'number',
      note:
        'THE bench-regret number: how many points the bench beat the starter by. ' +
        'Real values from -32.00 to 46.45 on 4,287 rows. This is what the ' +
        '"left 30 points on the bench" leaderboard sorts on.' },
    { source: 'Best BN over STRT', field: 'best_bench_over_starter', kind: 'yesno',
      note:
        'A 0/1 flag marking that a bench player outscored a starter — not the margin. ' +
        'The margin is `BN Gap`.' },
    { source: 'Flex Eligible', field: 'flex_eligible', kind: 'string' },
    { source: 'GP Count', field: 'games_played_count', kind: 'int' },
    { source: 'Played Y/N', field: 'played', kind: 'yesno' },
    { source: 'Reason', field: 'reason', kind: 'string',
      note: 'Started | Benched | IR | Bye. With Played Y/N this is what makes "should have started him" possible.' },
    { source: 'Score', field: 'score', kind: 'number' },
    { source: 'Proj. Score', field: 'projected_score', kind: 'number' },
    { source: 'Opponent', field: 'opponent', kind: 'string' },
    { source: 'Opp. Score', field: 'opponent_score', kind: 'number' },
    { source: 'Opp. Proj. Score', field: 'opponent_projected_score', kind: 'number' },
    { source: 'Pt. Diff.', field: 'point_diff', kind: 'number' },
    { source: 'Spread', field: 'spread', kind: 'number' },
    { source: 'Actual vs. Proj.', field: 'actual_vs_proj', kind: 'number' },
    { source: 'Opp. Act. vs Proj.', field: 'opp_actual_vs_proj', kind: 'number' },
    { source: 'W', field: 'wins', kind: 'number' },
    { source: 'L', field: 'losses', kind: 'number' },
    { source: 'W Streak', field: 'win_streak', kind: 'int' },
    { source: 'L Streak', field: 'loss_streak', kind: 'int' },
    { source: 'Favorite/ Underdog', field: 'favorite_or_underdog', kind: 'string' },
    { source: 'Division', field: 'division', kind: 'string' },
    { source: 'Opp. Division', field: 'opp_division', kind: 'string' },
    { source: 'Wk Hi', field: 'week_high', kind: 'highlow' },
    { source: 'Wk Lo', field: 'week_low', kind: 'highlow' },
    { source: 'Sea Hi', field: 'season_high', kind: 'highlow' },
    { source: 'Sea Lo', field: 'season_low', kind: 'highlow' },
    { source: 'Car Hi', field: 'career_high', kind: 'highlow' },
    { source: 'Car Lo', field: 'career_low', kind: 'highlow' },
    { source: 'Placed (Reg. S.)', field: 'placed_regular', kind: 'ordinal' },
    { source: 'Placed (Playoff)', field: 'placed_playoff', kind: 'ordinal' },
    { source: 'Drafted From', field: 'drafted_from', kind: 'ordinal' },
    { source: 'Placed (Div/ Conf)', field: 'placed_div_conf', kind: 'ordinal' },
    { source: 'PPG', field: 'ppg', kind: 'number', sentinels: ['Bye'] },
    { source: 'Game #', field: 'game_number', kind: 'int' },
    { source: 'YEAR_WK', field: 'year_wk', kind: 'string' },
    { source: 'W %', field: 'win_pct', kind: 'number' },
  ],
  ignored: [
    'Year 2', // lookup helper
    'Week 2', // lookup helper
    'Team 2', // lookup helper
  ],
};

// -----------------------------------------------------------------------------
//  Draft History — 1,494 picks, 2016-2024. Header row is index 3.
// -----------------------------------------------------------------------------
export const DRAFT_HISTORY: SheetSpec = {
  key: 'DraftHistory',
  sheetName: 'Draft History',
  headerRow: HEADER_ROWS['Draft History'],
  keyColumn: 'PLAYER ID',
  description:
    'Every draft pick. Use the cleaned `Name` column, not `Player` — the latter ' +
    'arrives as a combined string like "WR - Antonio Brown - PIT". Order by OVR, ' +
    'never by PCK.',
  columns: [
    { source: 'PLAYER ID', field: 'source_player_id', kind: 'string' },
    { source: 'Year', field: 'year', kind: 'int', requireValue: true },
    { source: 'RND', field: 'round', kind: 'int' },
    { source: 'PCK', field: 'pick', kind: 'string',
      note: 'Text on purpose: "1.1" and "1.10" are different picks that collide as numbers.' },
    { source: 'OVR', field: 'overall', kind: 'int', requireValue: true,
      note: 'The reliable ordering key.' },
    { source: 'Player', field: 'raw_player_string', kind: 'string',
      note: 'Combined "POS - Name - NFL" string. Kept for audit; not used for display.' },
    { source: 'POS', field: 'position', kind: 'string' },
    { source: 'NFL', field: 'nfl_team', kind: 'string' },
    { source: 'Drafted By', field: 'drafted_by', kind: 'string', requireValue: true },
    { source: 'Keeper', field: 'keeper', kind: 'string' },
    { source: 'Name', field: 'player_name', kind: 'string', requireValue: true,
      note: 'The already-cleaned player name. This is the one to use.' },
  ],
  ignored: [
    'Replace left', // Excel string surgery
    'Char count', // Excel string surgery
    'Replace Right', // Excel string surgery
  ],
};

// -----------------------------------------------------------------------------
//  Finishes — 102 rows, one per team-season.
// -----------------------------------------------------------------------------
export const FINISHES: SheetSpec = {
  key: 'Finishes',
  sheetName: 'Finishes',
  headerRow: HEADER_ROWS.Finishes,
  keyColumn: 'ID',
  description:
    'Season-level finish per team per year. `Playoff` is the champion indicator: ' +
    'Playoff = "1st" means that team won the league. Finishes are ordinal strings ' +
    'and are parsed to integers.',
  columns: [
    { source: 'ID', field: 'source_id', kind: 'string', requireValue: true,
      note: 'Format is {Year}_{Name}, e.g. "2016_Jerry".' },
    { source: '# of Teams', field: 'num_teams', kind: 'int' },
    { source: 'Year', field: 'year', kind: 'int', requireValue: true },
    { source: 'Name', field: 'team', kind: 'string', requireValue: true },
    { source: 'Division', field: 'division', kind: 'string' },
    { source: 'Draft Slot', field: 'draft_slot', kind: 'ordinal',
      note: 'Spelled as an ordinal in the sheet ("8th"), stored as an integer.' },
    { source: 'Season', field: 'regular_finish', kind: 'ordinal',
      note: 'Regular season finish.' },
    { source: 'Div/ Conf', field: 'division_finish', kind: 'ordinal' },
    { source: 'Playoff', field: 'final_finish', kind: 'ordinal',
      note: 'Final overall finish. "1st" = league champion. Blank for all of 2024 — see OPEN-QUESTIONS q5.' },
    { source: 'Finals', field: 'made_finals', kind: 'yesno' },
    // Kept rather than dropped: these may hold display strings the commissioner
    // wants shown verbatim. Cheap to carry, awkward to recover once discarded.
    { source: 'Place/Yr', field: 'raw_place_per_year', kind: 'raw' },
    { source: 'Reg/Yr', field: 'raw_regular_per_year', kind: 'raw' },
  ],
  ignored: [
    'LIST', // scratch list
    'Name2', // dedupe helper
  ],
};

// -----------------------------------------------------------------------------
//  Players — 778 rows. A working name-normalisation table, not a clean dimension.
// -----------------------------------------------------------------------------
export const PLAYERS: SheetSpec = {
  key: 'Players',
  sheetName: 'Players',
  headerRow: HEADER_ROWS.Players,
  keyColumn: 'Name',
  description:
    'Canonical player list with position. The counter columns are the ' +
    'commissioner\'s own dedupe QA and are not imported.',
  columns: [
    { source: 'POS', field: 'position', kind: 'string' },
    { source: 'Name', field: 'name', kind: 'string', requireValue: true },
  ],
  ignored: [
    'Name Count', // dedupe QA
    'Draft Count', // dedupe QA
    'Fixed', // manual override; see OPEN-QUESTIONS q14 before using
  ],
};

export const ALL_SHEETS: readonly SheetSpec[] = [
  GAME_DATA,
  LINEUP_DATA,
  DRAFT_HISTORY,
  FINISHES,
  PLAYERS,
];

export function sheetSpec(key: string): SheetSpec {
  const found = ALL_SHEETS.find((s) => s.key === key);
  if (!found) throw new Error(`No column map defined for sheet "${key}".`);
  return found;
}
