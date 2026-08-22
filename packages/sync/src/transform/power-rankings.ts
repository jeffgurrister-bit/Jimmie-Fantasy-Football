import type { PowerRankingRow, SyncWarning } from '@jff/db';
import type { ManagerResolver } from '../managers.ts';
import { mapRow, type SheetSpec, type SourceRow } from '../schema.ts';

export type { PowerRankingRow };

/**
 * The weekly power rankings, which today exist only as screenshots pasted into the
 * league chat. Turning them into real rows is what lets the site show a manager's
 * rank moving across a season instead of a picture of one week.
 */
export function transformPowerRankings(
  spec: SheetSpec,
  rows: readonly SourceRow[],
  resolver: ManagerResolver,
): { rankings: PowerRankingRow[]; warnings: SyncWarning[] } {
  const rankings: PowerRankingRow[] = [];
  const warnings: SyncWarning[] = [];
  const unknownOwners = new Map<string, number>();

  rows.forEach((raw, index) => {
    const row = mapRow(spec, raw, Number(raw.__rowNumber ?? index + 1));
    const owner = row.owner as string;

    // A power-rankings sheet is editorial, so a stray or misspelled owner should
    // cost that one row rather than the whole update.
    let managerId: string;
    try {
      managerId = resolver.resolve(owner, spec.sheetName);
    } catch {
      unknownOwners.set(owner, (unknownOwners.get(owner) ?? 0) + 1);
      return;
    }

    const rank = row.rank as number;
    const previous = row.previous_rank as number | null;

    rankings.push({
      year: row.year as number,
      week: row.week as number,
      rank,
      previous_rank: previous,
      // Ranks count downward, so moving from 5th to 2nd is +3.
      movement: previous === null ? null : previous - rank,
      manager_id: managerId,
      display_name: resolver.get(managerId)?.display_name ?? managerId,
      team_name: row.team_name as string | null,
      record: row.record as string | null,
      streak: row.streak as string | null,
      notes: row.notes as string | null,
    });
  });

  if (unknownOwners.size > 0) {
    warnings.push({
      code: 'power_rankings_unknown_owner',
      message:
        `Skipped ${[...unknownOwners.values()].reduce((a, b) => a + b, 0)} power-ranking ` +
        `row(s) naming an owner not in the manager list: ` +
        [...unknownOwners.keys()].map((o) => `"${o}"`).join(', '),
    });
  }

  return { rankings, warnings };
}
