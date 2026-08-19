/**
 * The header inventory taken from the commissioner's actual workbook — the
 * authority both the column-contract test and the end-to-end fixture builder
 * check themselves against. Transcribed from the source inspection, NOT derived
 * from the column maps, so that the maps are tested against something
 * independent of themselves.
 */
export const GAME_DATA_HEADERS = [
  'Name_Yr_Wk', 'ID', 'Opp ID', 'YEAR_WK', '# of Teams', 'A/B', 'B/A', 'Year', 'Game #', 'Week',
  'Time of Season', 'Round', 'Round/ Game', 'Seed', 'Team', 'Score', 'Proj. Score', 'Opponent',
  'Opp. Score', 'Opp. Proj. Score', 'Favorite/ Underdog', 'W', 'L', 'Pt. Diff.', 'Spread',
  'Actual vs. Proj.', 'Opp. Act. vs Proj.', 'Division', 'Opp. Division', 'Wk Hi', 'Wk Lo',
  'Sea Hi', 'Sea Lo', 'Car Hi', 'Car Lo', 'Placed (Reg. S.)', 'Placed (Playoff)',
  'Placed (Div/ Conf)', 'Record @ Game', 'Opp. Rec. @ Game', 'Drafted From', 'Name 2 Count',
  'ID2', 'Week2', 'YEAR2', 'W@G', 'L@G', 'Opp W@G', 'Opp L@G', 'PF @ GM', 'PA @ GM',
  'Opp. PF @ GM', 'Opp. PA @ GM', 'W Streak', 'L Streak', 'Weekly Rank', 'Opp. Wk Rnk',
  'Year Rank', 'Game Played', 'Made Playoff',
];

export const LINEUP_DATA_HEADERS = [
  'Name_Yr_Wk', 'Name_Yr_ Wk_LS', '# of Teams', 'Year', 'Week', 'Time of Season', 'Round',
  'Round/ Game', 'Seed', 'Team', 'Lineup #', 'Lineup POS', 'Name', 'POS', 'PTS', 'Proj PTS',
  'Diff', 'Round Drafted', 'Pick Drafted', 'Drafted By', 'Keeper', 'Keep Year',
  'Pos Rank That Week', 'Pos Rank W/BN', 'Players above Min', 'Max Bench', 'BN Gap',
  'Best BN over STRT', 'Flex Eligible', 'GP Count', 'Played Y/N', 'Reason', 'Score',
  'Proj. Score', 'Opponent', 'Opp. Score', 'Opp. Proj. Score', 'Pt. Diff.', 'Spread',
  'Actual vs. Proj.', 'Opp. Act. vs Proj.', 'W', 'L', 'W Streak', 'L Streak',
  'Favorite/ Underdog', 'Division', 'Opp. Division', 'Wk Hi', 'Wk Lo', 'Sea Hi', 'Sea Lo',
  'Car Hi', 'Car Lo', 'Placed (Reg. S.)', 'Placed (Playoff)', 'Drafted From',
  'Placed (Div/ Conf)', 'PPG', 'Year 2', 'Game #', 'Week 2', 'YEAR_WK', 'W %', 'Team 2',
];

export const DRAFT_HEADERS = [
  'PLAYER ID', 'Year', 'RND', 'PCK', 'OVR', 'Player', 'POS', 'NFL', 'Drafted By', 'Keeper',
  'Replace left', 'Name', 'Char count', 'Replace Right',
];

// Index 1 is a genuinely unnamed column; xlsx surfaces it as __EMPTY.
export const FINISHES_HEADERS = [
  'LIST', '__EMPTY', 'ID', '# of Teams', 'Year', 'Name', 'Division', 'Draft Slot', 'Season',
  'Div/ Conf', 'Playoff', 'Finals', 'Name2', 'Place/Yr', 'Reg/Yr',
];

export const PLAYERS_HEADERS = ['POS', 'Name', 'Name Count', 'Draft Count', 'Fixed'];

