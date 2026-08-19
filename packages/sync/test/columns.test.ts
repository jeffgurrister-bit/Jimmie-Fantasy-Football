import { describe, expect, it } from 'vitest';
import {
  ALL_SHEETS, DRAFT_HISTORY, FINISHES, GAME_DATA, LINEUP_DATA, PLAYERS,
} from '../src/columns.ts';
import { validateHeaders } from '../src/schema.ts';
import {
  DRAFT_HEADERS, FINISHES_HEADERS, GAME_DATA_HEADERS, LINEUP_DATA_HEADERS, PLAYERS_HEADERS,
} from './fixtures/headers.ts';

/**
 * The header lists below are the inventory taken from the commissioner's actual
 * workbook. They are the contract: every one of these columns must be either
 * imported or explicitly ignored, and the sync must notice if one disappears.
 *
 * Order matters here only as documentation — the sync never reads a column by
 * position.
 */
const CASES = [
  { spec: GAME_DATA, headers: GAME_DATA_HEADERS, total: 60 },
  { spec: LINEUP_DATA, headers: LINEUP_DATA_HEADERS, total: 65 },
  { spec: DRAFT_HISTORY, headers: DRAFT_HEADERS, total: 14 },
  { spec: FINISHES, headers: FINISHES_HEADERS, total: 15 },
  { spec: PLAYERS, headers: PLAYERS_HEADERS, total: 5 },
];

describe('the column contract matches the real workbook', () => {
  for (const { spec, headers, total } of CASES) {
    it(`accepts every column in ${spec.sheetName} with nothing missing or unexpected`, () => {
      const result = validateHeaders(spec, headers);
      expect(result.missing).toEqual([]);
      expect(result.unexpected).toEqual([]);
    });

    it(`accounts for all ${total} columns in ${spec.sheetName}`, () => {
      expect(headers).toHaveLength(total);
      // Every header is either imported or deliberately ignored — no silent gaps.
      const accounted = new Set([...spec.columns.map((c) => c.source), ...spec.ignored]);
      const unaccounted = headers.filter((h) => !accounted.has(h) && !h.startsWith('__EMPTY'));
      expect(unaccounted).toEqual([]);
    });
  }
});

describe('header row indexes', () => {
  it('is never zero, because every sheet has a banner row above its headers', () => {
    // Reading row 0 yields headers like "LINEUPDATA" or bare integers and
    // produces a clean-looking import of complete garbage.
    for (const spec of ALL_SHEETS) {
      expect(spec.headerRow).toBeGreaterThan(0);
    }
    expect(LINEUP_DATA.headerRow).toBe(2); // index 1 is a row of loose integers
    expect(DRAFT_HISTORY.headerRow).toBe(3);
  });
});

describe('field naming', () => {
  it('maps every source column to a unique snake_case field per sheet', () => {
    for (const spec of ALL_SHEETS) {
      const fields = spec.columns.map((c) => c.field);
      expect(new Set(fields).size, `${spec.sheetName} has duplicate target fields`).toBe(
        fields.length,
      );
      for (const field of fields) {
        expect(field, `${spec.sheetName}.${field}`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it('never maps two source columns onto the same field', () => {
    // "Score" and "Opp. Score" landing on the same field is the classic
    // fuzzy-matching failure this guards against.
    for (const spec of ALL_SHEETS) {
      const sources = spec.columns.map((c) => c.source);
      expect(new Set(sources).size).toBe(sources.length);
    }
  });

  it('preserves the irregular spacing the sheets actually contain', () => {
    // If someone "tidies" these strings the sync stops matching real headers.
    const lineupSources = LINEUP_DATA.columns.map((c) => c.source);
    expect(lineupSources).toContain('Name_Yr_ Wk_LS'); // stray space, really there
    expect(lineupSources).toContain('Round/ Game'); // space after the slash
    const gameSources = GAME_DATA.columns.map((c) => c.source);
    expect(gameSources).toContain('Placed (Reg. S.)');
    expect(gameSources).toContain('Opp. Act. vs Proj.');
  });
});

describe('critical source quirks are encoded in the map', () => {
  it('reads the draft pick number as text, since 1.1 and 1.10 collide', () => {
    expect(DRAFT_HISTORY.columns.find((c) => c.source === 'PCK')!.kind).toBe('string');
    expect(DRAFT_HISTORY.columns.find((c) => c.source === 'OVR')!.kind).toBe('int');
  });

  it('imports the cleaned player Name and keeps the raw Player string separate', () => {
    const name = DRAFT_HISTORY.columns.find((c) => c.source === 'Name')!;
    const player = DRAFT_HISTORY.columns.find((c) => c.source === 'Player')!;
    expect(name.field).toBe('player_name');
    expect(player.field).toBe('raw_player_string');
  });

  it('parses the Finishes place columns as ordinals', () => {
    for (const source of ['Season', 'Div/ Conf', 'Playoff']) {
      expect(FINISHES.columns.find((c) => c.source === source)!.kind).toBe('ordinal');
    }
  });

  it('requires the A/B flag, since deduplication depends on it', () => {
    expect(GAME_DATA.columns.find((c) => c.source === 'A/B')!.requireValue).toBe(true);
  });

  it('drops the Excel string-surgery helpers', () => {
    expect(DRAFT_HISTORY.ignored).toContain('Replace left');
    expect(DRAFT_HISTORY.ignored).toContain('Char count');
    expect(DRAFT_HISTORY.ignored).toContain('Replace Right');
  });
});

describe('every sheet declares a usable key column', () => {
  it('names a key column that is actually one of its mapped columns', () => {
    // The key column decides which rows are real data. If it were not mapped,
    // the reader could not find it and the sheet would fail to load.
    for (const spec of ALL_SHEETS) {
      const sources = spec.columns.map((c) => c.source);
      expect(sources, `${spec.sheetName} key "${spec.keyColumn}"`).toContain(spec.keyColumn);
    }
  });

  it('uses the identity column rather than the first column', () => {
    // Column 0 is scratch on three of these sheets — `LIST` on Finishes is
    // populated on only 12 of 102 rows, and Draft History's first column is
    // unnamed. Keying on position would silently drop most of the data.
    expect(FINISHES.keyColumn).toBe('ID');
    expect(DRAFT_HISTORY.keyColumn).toBe('PLAYER ID');
    expect(GAME_DATA.keyColumn).toBe('Name_Yr_Wk');
  });
});

describe('semantics verified against the real workbook', () => {
  it('treats the six high/low markers as flags, not text or numbers', () => {
    for (const source of ['Wk Hi', 'Wk Lo', 'Sea Hi', 'Sea Lo', 'Car Hi', 'Car Lo']) {
      expect(GAME_DATA.columns.find((c) => c.source === source)!.kind).toBe('highlow');
    }
  });

  it('reads Drafted From as an ordinal draft slot, not free text', () => {
    expect(GAME_DATA.columns.find((c) => c.source === 'Drafted From')!.kind).toBe('ordinal');
  });

  it('treats the two bench flags as flags and BN Gap as the magnitude', () => {
    // The handoff notes had this backwards: `Best BN over STRT` is a 0/1 flag on
    // 2,469 rows, and `BN Gap` carries the actual points margin. Sorting on the
    // flag would produce a meaningless leaderboard.
    const col = (src: string) => LINEUP_DATA.columns.find((c) => c.source === src)!;
    expect(col('Best BN over STRT').kind).toBe('yesno');
    expect(col('Players above Min').kind).toBe('yesno');
    expect(col('BN Gap').kind).toBe('number');
    expect(col('Max Bench').kind).toBe('number');
  });

  it('declares the sentinel words the sheets use for "no value"', () => {
    const col = (src: string) => LINEUP_DATA.columns.find((c) => c.source === src)!;
    // 6,734 rows say "Undrafted" where a round number would go, and "Undrafted"
    // is also not a manager.
    expect(col('Round Drafted').sentinels).toContain('Undrafted');
    expect(col('Drafted By').sentinels).toContain('Undrafted');
    // 173 rows say "Bye" where points would go — matching Reason = "Bye" exactly.
    expect(col('PTS').sentinels).toContain('Bye');
    expect(col('PPG').sentinels).toContain('Bye');
  });
});

describe('schema drift', () => {
  it('fails when a column is renamed, naming the column that vanished', () => {
    const renamed = GAME_DATA_HEADERS.map((h) => (h === 'Proj. Score' ? 'Projected Score' : h));
    const result = validateHeaders(GAME_DATA, renamed);
    expect(result.missing).toContain('Proj. Score');
    expect(result.unexpected).toContain('Projected Score');
  });

  it('fails when a brand-new column appears', () => {
    const result = validateHeaders(GAME_DATA, [...GAME_DATA_HEADERS, 'Vibes Rating']);
    expect(result.unexpected).toEqual(['Vibes Rating']);
  });

  it('tolerates trailing blank columns, which are a file artefact', () => {
    const result = validateHeaders(GAME_DATA, [
      ...GAME_DATA_HEADERS, '__EMPTY', '__EMPTY_1', '',
    ]);
    expect(result.unexpected).toEqual([]);
    expect(result.missing).toEqual([]);
  });
});
