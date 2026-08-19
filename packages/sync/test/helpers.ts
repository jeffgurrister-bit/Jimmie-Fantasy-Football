import { GAME_DATA } from '../src/columns.ts';
import { ManagerResolver, parseManagerMap } from '../src/managers.ts';
import type { SourceRow } from '../src/schema.ts';

/** A small confirmed roster, enough to exercise the transforms. */
export const TEST_MANAGER_YAML = `
schema_version: 1
managers:
  - id: jimmie-perkins
    canonical_name: Jimmie Perkins
    display_name: Jimmie
    confirmed: true
    leagues: [rbb]
    aliases: ["Jimmie"]
  - id: jim-perkins
    canonical_name: Jim Perkins
    display_name: Jim
    confirmed: true
    leagues: [rbb]
    aliases: ["Jim"]
  - id: josh-jones
    canonical_name: Josh Jones
    display_name: Josh
    confirmed: true
    leagues: [rbb]
    aliases: ["Josh"]
  - id: josh-baker
    canonical_name: Josh Baker
    display_name: Yisha
    confirmed: true
    leagues: [rbb]
    aliases: ["Yisha"]
unresolved: []
`;

export function testResolver(yaml = TEST_MANAGER_YAML, allowUnconfirmed = false): ManagerResolver {
  return new ManagerResolver(parseManagerMap(yaml), { allowUnconfirmed });
}

/**
 * Builds a GameData source row keyed by the real header strings, so the tests
 * exercise the same name-based access the sync uses. Only the fields a test
 * cares about need to be passed.
 */
export function gameRow(overrides: {
  team: string;
  opponent: string;
  side: 'A' | 'B';
  year?: number;
  week?: number;
  timeOfSeason?: string;
  score?: number;
  oppScore?: number;
  gamePlayed?: string;
  rowNumber?: number;
}): SourceRow {
  const row: SourceRow = {};
  // Start every mapped column as blank, then fill in what the test specifies.
  for (const col of GAME_DATA.columns) row[col.source] = null;
  row['Name_Yr_Wk'] = `${overrides.team}_${overrides.year ?? 2016}_${overrides.week ?? 1}`;
  row['A/B'] = overrides.side;
  row['Year'] = overrides.year ?? 2016;
  row['Week'] = overrides.week ?? 1;
  row['Time of Season'] = overrides.timeOfSeason ?? 'Regular';
  row['Team'] = overrides.team;
  row['Opponent'] = overrides.opponent;
  row['Score'] = overrides.score ?? 100;
  row['Opp. Score'] = overrides.oppScore ?? 90;
  row['Game Played'] = overrides.gamePlayed ?? 'YES';
  row['# of Teams'] = 10;
  row.__rowNumber = overrides.rowNumber ?? 2;
  return row;
}

/** The two mirrored rows the source stores for one game. */
export function gamePair(a: {
  team: string;
  opponent: string;
  year?: number;
  week?: number;
  timeOfSeason?: string;
  score?: number;
  oppScore?: number;
}): SourceRow[] {
  return [
    gameRow({ ...a, side: 'A' }),
    gameRow({
      ...a,
      team: a.opponent,
      opponent: a.team,
      side: 'B',
      score: a.oppScore ?? 90,
      oppScore: a.score ?? 100,
    }),
  ];
}
