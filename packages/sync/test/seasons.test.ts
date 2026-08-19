import { describe, expect, it } from 'vitest';
import { FINISHES } from '../src/columns.ts';
import { transformSeasons } from '../src/transform/seasons.ts';
import type { SourceRow } from '../src/schema.ts';
import { testResolver } from './helpers.ts';

function finishRow(o: {
  year: number;
  team: string;
  division?: string | null;
  season?: string;
  divConf?: string;
  playoff?: string;
  finals?: string;
  numTeams?: number;
  draftSlot?: number;
}): SourceRow {
  const row: SourceRow = {};
  for (const col of FINISHES.columns) row[col.source] = null;
  row['ID'] = `${o.year}_${o.team}`;
  row['Year'] = o.year;
  row['Name'] = o.team;
  row['# of Teams'] = o.numTeams ?? 10;
  row['Division'] = o.division ?? null;
  row['Draft Slot'] = o.draftSlot ?? null;
  row['Season'] = o.season ?? null;
  row['Div/ Conf'] = o.divConf ?? null;
  row['Playoff'] = o.playoff ?? null;
  row['Finals'] = o.finals ?? null;
  row.__rowNumber = 2;
  return row;
}

describe('transformSeasons', () => {
  it('parses ordinal finishes into integers and keeps the original string', () => {
    const rows = [
      finishRow({ year: 2016, team: 'Jimmie', season: '2nd', playoff: '1st', finals: 'YES' }),
      finishRow({ year: 2016, team: 'Josh', season: '1st', playoff: '2nd', finals: 'YES' }),
    ];
    const { teamSeasons } = transformSeasons(FINISHES, rows, testResolver());

    const champ = teamSeasons.find((t) => t.manager_id === 'jimmie-perkins')!;
    expect(champ.final_finish).toBe(1);
    expect(champ.regular_finish).toBe(2);
    expect(champ.made_finals).toBe(true);
    expect(champ.raw_final_finish).toBe('1st');
  });

  it('identifies the champion as the 1st-place Playoff finish', () => {
    const rows = [
      finishRow({ year: 2018, team: 'Yisha', playoff: '1st' }),
      finishRow({ year: 2018, team: 'Josh', playoff: '4th' }),
    ];
    const { teamSeasons, warnings } = transformSeasons(FINISHES, rows, testResolver());
    const champions = teamSeasons.filter((t) => t.final_finish === 1);
    expect(champions).toHaveLength(1);
    expect(champions[0]!.manager_id).toBe('josh-baker');
    expect(warnings.map((w) => w.code)).not.toContain('season_without_champion');
  });

  it('warns about a season whose postseason was never filled in', () => {
    // This is 2024: every row has a blank Playoff value, so the site has no
    // champion to show. Better a visible warning than a silently empty banner.
    const rows = [
      finishRow({ year: 2024, team: 'Jim', season: '1st', playoff: '' }),
      finishRow({ year: 2024, team: 'Josh', season: '2nd', playoff: '' }),
    ];
    const { warnings, teamSeasons } = transformSeasons(FINISHES, rows, testResolver());
    expect(warnings.map((w) => w.code)).toContain('season_without_champion');
    // The rows still import — the regular season did happen.
    expect(teamSeasons).toHaveLength(2);
    expect(teamSeasons[0]!.final_finish).toBeNull();
  });

  it('models divisions per season, since the league changed format twice', () => {
    const rows = [
      // 2016: two divisions
      finishRow({ year: 2016, team: 'Jimmie', division: 'Biscuits', playoff: '1st' }),
      finishRow({ year: 2016, team: 'Josh', division: 'Gravy', playoff: '2nd' }),
      // 2019: no divisions at all
      finishRow({ year: 2019, team: 'Jimmie', division: null, playoff: '1st' }),
      finishRow({ year: 2019, team: 'Josh', division: null, playoff: '2nd' }),
      // 2023: three divisions
      finishRow({ year: 2023, team: 'Jimmie', division: 'Bun Spreaders', playoff: '1st' }),
      finishRow({ year: 2023, team: 'Josh', division: 'Burnt Biscuits', playoff: '2nd' }),
      finishRow({ year: 2023, team: 'Jim', division: 'Gravy Goons', playoff: '3rd' }),
    ];
    const { seasons } = transformSeasons(FINISHES, rows, testResolver());

    const s2016 = seasons.find((s) => s.year === 2016)!;
    const s2019 = seasons.find((s) => s.year === 2019)!;
    const s2023 = seasons.find((s) => s.year === 2023)!;

    expect(s2016.has_divisions).toBe(true);
    expect(s2016.division_names).toEqual(['Biscuits', 'Gravy']);

    // 2017-2022 genuinely had no divisions. A divisional standings page must
    // show nothing for those years rather than an empty broken table.
    expect(s2019.has_divisions).toBe(false);
    expect(s2019.division_names).toEqual([]);

    expect(s2023.has_divisions).toBe(true);
    expect(s2023.division_names).toEqual(['Bun Spreaders', 'Burnt Biscuits', 'Gravy Goons']);
  });

  it('returns seasons in chronological order', () => {
    const rows = [
      finishRow({ year: 2021, team: 'Jimmie', playoff: '1st' }),
      finishRow({ year: 2016, team: 'Josh', playoff: '1st' }),
      finishRow({ year: 2019, team: 'Jim', playoff: '1st' }),
    ];
    const { seasons } = transformSeasons(FINISHES, rows, testResolver());
    expect(seasons.map((s) => s.year)).toEqual([2016, 2019, 2021]);
  });

  it('does not invent a made-playoffs flag the source never stated', () => {
    // Inferring it from finishing place would mean choosing a playoff cut line
    // the commissioner never specified. GameData carries the real flag.
    const rows = [finishRow({ year: 2016, team: 'Jimmie', season: '5th', playoff: '5th' })];
    const { teamSeasons } = transformSeasons(FINISHES, rows, testResolver());
    expect(teamSeasons[0]!.made_playoffs).toBeNull();
  });
});
