import type { SyncWarning } from '@jff/db';
import type { ManagerResolver } from '../managers.ts';
import { mapRow, type SheetSpec, type SourceRow } from '../schema.ts';

export interface SeasonRecord {
  year: number;
  num_teams: number | null;
  has_divisions: boolean;
  division_names: string[];
}

export interface TeamSeasonRecord {
  year: number;
  manager_id: string;
  division: string | null;
  draft_slot: number | null;
  regular_finish: number | null;
  division_finish: number | null;
  final_finish: number | null;
  raw_regular_finish: string | null;
  raw_division_finish: string | null;
  raw_final_finish: string | null;
  made_finals: boolean | null;
  made_playoffs: boolean | null;
}

export interface SeasonsResult {
  seasons: SeasonRecord[];
  teamSeasons: TeamSeasonRecord[];
  warnings: SyncWarning[];
}

/**
 * Builds seasons, divisions and team-seasons from the `Finishes` sheet — 102
 * rows, one per team-season, which is exactly 10 teams x 3 years plus 12 x 6.
 *
 * Divisions are modelled per season rather than as an attribute of a manager,
 * because the league ran two divisions in 2016 (Biscuits, Gravy), none at all
 * from 2017 to 2022, and three from 2023 (Bun Spreaders, Burnt Biscuits, Gravy
 * Goons). A manager's division is a fact about a year, not about them.
 */
export function transformSeasons(
  spec: SheetSpec,
  rows: readonly SourceRow[],
  resolver: ManagerResolver,
): SeasonsResult {
  const warnings: SyncWarning[] = [];
  const teamSeasons: TeamSeasonRecord[] = [];
  const seasonMeta = new Map<number, { num_teams: number | null; divisions: Set<string> }>();

  rows.forEach((raw, index) => {
    const rowNumber = Number(raw.__rowNumber ?? index + 1);
    const row = mapRow(spec, raw, rowNumber);
    const year = row.year as number;
    const managerId = resolver.resolve(row.team as string, spec.sheetName);
    const division = row.division as string | null;

    const meta = seasonMeta.get(year) ?? { num_teams: null, divisions: new Set<string>() };
    meta.num_teams = (row.num_teams as number | null) ?? meta.num_teams;
    if (division) meta.divisions.add(division);
    seasonMeta.set(year, meta);

    const finalFinish = row.final_finish as number | null;

    teamSeasons.push({
      year,
      manager_id: managerId,
      division,
      draft_slot: row.draft_slot as number | null,
      regular_finish: row.regular_finish as number | null,
      division_finish: row.division_finish as number | null,
      final_finish: finalFinish,
      raw_regular_finish: rawOf(raw, 'Season'),
      raw_division_finish: rawOf(raw, 'Div/ Conf'),
      raw_final_finish: rawOf(raw, 'Playoff'),
      made_finals: row.made_finals as boolean | null,
      // The source has no explicit made-playoffs flag on this sheet; GameData's
      // `Made Playoff` column carries it, and it is imported there. Left null
      // here rather than inferred from finishing place, which would invent a
      // playoff cut line the commissioner never specified.
      made_playoffs: null,
    });
  });

  // Seasons whose postseason results were never filled in. 2024 is the known
  // case. Surfaced as a warning rather than silently rendering a season with no
  // champion, because "who won 2024" is the first thing a visitor looks for.
  const byYear = new Map<number, TeamSeasonRecord[]>();
  for (const ts of teamSeasons) {
    const list = byYear.get(ts.year) ?? [];
    list.push(ts);
    byYear.set(ts.year, list);
  }
  for (const [year, list] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (!list.some((ts) => ts.final_finish === 1)) {
      warnings.push({
        code: 'season_without_champion',
        message:
          `${year} has no team with a 1st-place finish in the Finishes sheet, so the site ` +
          `cannot say who won that season.`,
        context: { year, teams: list.length },
      });
    }
  }

  const seasons: SeasonRecord[] = [...seasonMeta.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, meta]) => ({
      year,
      num_teams: meta.num_teams,
      has_divisions: meta.divisions.size > 0,
      division_names: [...meta.divisions].sort(),
    }));

  return { seasons, teamSeasons, warnings };
}

function rawOf(raw: SourceRow, header: string): string | null {
  const v = raw[header];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
