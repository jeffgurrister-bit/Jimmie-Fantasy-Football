/**
 * Builds a synthetic RBB workbook that mimics the real one's SHAPE: the same
 * header strings, the same banner rows above the headers, LineupData's row of
 * loose integers at index 1, and every game stored twice via the A/B column.
 *
 * Used by the end-to-end test to exercise the whole pipeline — read, validate,
 * transform, load — against a real Postgres. The real workbook is private and not
 * in this repository, so this is what stands in for it.
 *
 *   npx tsx test/fixtures/build-workbook.ts <out.xlsx>
 */
import * as XLSX from 'xlsx';
import {
  DRAFT_HEADERS, FINISHES_HEADERS, GAME_DATA_HEADERS, LINEUP_DATA_HEADERS, PLAYERS_HEADERS,
} from './headers.ts';

/** Four managers, all present as aliases in the real data/managers.yaml. */
const MANAGERS = ['Jimmie', 'Jim', 'Josh', 'Yisha'] as const;
const YEARS = [2016, 2017] as const;
const WEEKS = [1, 2] as const;

/** Round-robin pairings so each week has two games among four managers. */
function pairingsFor(week: number): Array<[string, string]> {
  return week % 2 === 1
    ? [['Jimmie', 'Jim'], ['Josh', 'Yisha']]
    : [['Jimmie', 'Josh'], ['Jim', 'Yisha']];
}

function row(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((h) => values[h] ?? null);
}

function scoreFor(team: string, year: number, week: number): number {
  // Deterministic, so the expected totals in the test are stable.
  const base = MANAGERS.indexOf(team as (typeof MANAGERS)[number]);
  return 90 + base * 7 + week * 3 + (year - 2016) * 5;
}

function buildGameData(): unknown[][] {
  const grid: unknown[][] = [['GAMEDATA'], GAME_DATA_HEADERS as unknown[]];
  let gameNumber = 0;
  for (const year of YEARS) {
    for (const week of WEEKS) {
      for (const [home, away] of pairingsFor(week)) {
        gameNumber += 1;
        const homeScore = scoreFor(home, year, week);
        const awayScore = scoreFor(away, year, week);
        // Both perspectives of the same game — this is the duplication the sync
        // has to collapse.
        for (const [team, opp, side] of [
          [home, away, 'A'],
          [away, home, 'B'],
        ] as const) {
          const score = team === home ? homeScore : awayScore;
          const oppScore = team === home ? awayScore : homeScore;
          grid.push(
            row(GAME_DATA_HEADERS, {
              'Name_Yr_Wk': `${team}_${year}_${week}`,
              'ID': `${year}_${team}`,
              'Opp ID': `${year}_${opp}`,
              'YEAR_WK': `${year}_${week}`,
              '# of Teams': 10,
              'A/B': side,
              'B/A': side === 'A' ? 'B' : 'A',
              'Year': year,
              'Game #': gameNumber,
              'Week': week,
              'Time of Season': 'Regular',
              'Team': team,
              'Score': score,
              'Proj. Score': score - 4,
              'Opponent': opp,
              'Opp. Score': oppScore,
              'Opp. Proj. Score': oppScore - 4,
              'W': score > oppScore ? 1 : 0,
              'L': score > oppScore ? 0 : 1,
              'Pt. Diff.': score - oppScore,
              'Division': year === 2016 ? (team === 'Jimmie' || team === 'Jim' ? 'Biscuits' : 'Gravy') : null,
              'Opp. Division': year === 2016 ? (opp === 'Jimmie' || opp === 'Jim' ? 'Biscuits' : 'Gravy') : null,
              'Record @ Game': '0-0',
              'W@G': 0,
              'L@G': 0,
              'PF @ GM': score,
              'PA @ GM': oppScore,
              'W Streak': 0,
              'L Streak': 0,
              'Weekly Rank': 1,
              'Year Rank': 1,
              'Game Played': 'YES',
              'Made Playoff': 'YES',
              'Wk Hi': 'NO',
              'Drafted From': 'Draft',
            }),
          );
        }
      }
    }
  }
  return grid;
}

const SLOTS = [
  { pos: 'QB', reason: 'Started', player: 'Josh Allen', nfl: 'BUF' },
  { pos: 'RB', reason: 'Started', player: 'Derrick Henry', nfl: 'TEN' },
  { pos: 'BN', reason: 'Benched', player: 'Antonio Brown', nfl: 'PIT' },
] as const;

function buildLineupData(): unknown[][] {
  const grid: unknown[][] = [
    ['LINEUPDATA'],
    // Index 1 is the row of loose integers that is NOT data — reading it as the
    // header row is the mistake this fixture makes possible to catch.
    [5, 11, 12, 13, 14],
    LINEUP_DATA_HEADERS as unknown[],
  ];
  for (const year of YEARS) {
    for (const week of WEEKS) {
      for (const [home, away] of pairingsFor(week)) {
        for (const [team, opp] of [
          [home, away],
          [away, home],
        ] as const) {
          SLOTS.forEach((slot, i) => {
            grid.push(
              row(LINEUP_DATA_HEADERS, {
                'Name_Yr_Wk': `${team}_${year}_${week}`,
                'Name_Yr_ Wk_LS': `${team}_${year}_${week}_${slot.pos}`,
                '# of Teams': 10,
                'Year': year,
                'Week': week,
                'Time of Season': 'Regular',
                'Team': team,
                'Lineup #': i + 1,
                'Lineup POS': slot.pos,
                'Name': slot.player,
                'POS': slot.pos === 'BN' ? 'WR' : slot.pos,
                'PTS': 10 + i * 4,
                'Proj PTS': 9 + i * 4,
                'Diff': 1,
                'Round Drafted': i + 1,
                'Pick Drafted': `${i + 1}.0${i + 1}`,
                'Drafted By': team,
                'Keeper': 'NO',
                'Played Y/N': slot.pos === 'BN' ? 'NO' : 'YES',
                'Reason': slot.reason,
                'Best BN over STRT': slot.pos === 'BN' ? 12.5 : null,
                'BN Gap': slot.pos === 'BN' ? 3.5 : null,
                'Opponent': opp,
                'Score': scoreFor(team, year, week),
                'Opp. Score': scoreFor(opp, year, week),
                'Flex Eligible': slot.pos === 'RB' ? 'YES' : 'NO',
                'YEAR_WK': `${year}_${week}`,
              }),
            );
          });
        }
      }
    }
  }
  return grid;
}

function buildDraftHistory(): unknown[][] {
  const grid: unknown[][] = [
    ['DRAFT HISTORY'],
    ['(notes row)'],
    ['(spacer row)'],
    DRAFT_HEADERS as unknown[],
  ];
  let overall = 0;
  for (const year of YEARS) {
    overall = 0;
    for (let round = 1; round <= 2; round += 1) {
      MANAGERS.forEach((manager, i) => {
        overall += 1;
        const slot = i + 1;
        grid.push(
          row(DRAFT_HEADERS, {
            'PLAYER ID': `${year}_${overall}`,
            'Year': year,
            'RND': round,
            // "1.1" vs "1.10" is the collision that forces this to stay text.
            'PCK': `${round}.${slot === 10 ? '10' : `0${slot}`}`,
            'OVR': overall,
            'Player': `WR - Player ${overall} - CHI`,
            'POS': 'WR',
            'NFL': 'CHI',
            'Drafted By': manager,
            'Keeper': 'NO',
            'Name': `Player ${overall}`,
          }),
        );
      });
    }
  }
  return grid;
}

function buildFinishes(): unknown[][] {
  const grid: unknown[][] = [['FINISHES'], FINISHES_HEADERS as unknown[]];
  const PLACES = ['1st', '2nd', '3rd', '4th'];
  for (const year of YEARS) {
    MANAGERS.forEach((manager, i) => {
      grid.push(
        row(FINISHES_HEADERS, {
          'LIST': manager,
          'ID': `${year}_${manager}`,
          '# of Teams': 10,
          'Year': year,
          'Name': manager,
          'Division': year === 2016 ? (i < 2 ? 'Biscuits' : 'Gravy') : null,
          'Draft Slot': i + 1,
          'Season': PLACES[i],
          'Div/ Conf': i % 2 === 0 ? '1st' : '2nd',
          // 2017 postseason left blank on purpose, mirroring the real 2024 gap.
          'Playoff': year === 2016 ? PLACES[i] : '',
          'Finals': year === 2016 ? (i < 2 ? 'YES' : 'NO') : '',
          'Name2': manager,
          'Place/Yr': `${PLACES[i]} in ${year}`,
          'Reg/Yr': `${PLACES[i]} reg ${year}`,
        }),
      );
    });
  }
  return grid;
}

function buildPlayers(): unknown[][] {
  const grid: unknown[][] = [['PLAYERS'], PLAYERS_HEADERS as unknown[]];
  for (const slot of SLOTS) {
    grid.push(
      row(PLAYERS_HEADERS, {
        'POS': slot.pos === 'BN' ? 'WR' : slot.pos,
        'Name': slot.player,
        'Name Count': 1,
        'Draft Count': 1,
        'Fixed': null,
      }),
    );
  }
  return grid;
}

export function buildWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const add = (name: string, grid: unknown[][]): void => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), name);
  };
  add('GameData', buildGameData());
  add('LineupData', buildLineupData());
  add('Draft History', buildDraftHistory());
  add('Finishes', buildFinishes());
  add('Players', buildPlayers());
  return wb;
}

/** Counts the fixture is expected to produce, asserted by the e2e test. */
export const EXPECTED = {
  years: YEARS.length,
  managers: MANAGERS.length,
  /** 2 weeks x 2 pairings x 2 years. */
  games: YEARS.length * WEEKS.length * 2,
  /** Two rows per game — both perspectives. */
  gameTeams: YEARS.length * WEEKS.length * 2 * 2,
  teamSeasons: YEARS.length * MANAGERS.length,
  lineupSlots: YEARS.length * WEEKS.length * 2 * 2 * SLOTS.length,
  draftPicks: YEARS.length * 2 * MANAGERS.length,
};

if (process.argv[1]?.endsWith('build-workbook.ts')) {
  const out = process.argv[2] ?? 'fixture.xlsx';
  XLSX.writeFile(buildWorkbook(), out);
  console.log(`Wrote ${out}`);
  console.log(EXPECTED);
}
