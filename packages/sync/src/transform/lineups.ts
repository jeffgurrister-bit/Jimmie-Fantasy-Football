import type { SyncWarning } from '@jff/db';
import { SyncError } from '../errors.ts';
import type { ManagerResolver } from '../managers.ts';
import { mapRow, type SheetSpec, type SourceRow } from '../schema.ts';
import { gameSourceKey } from './games.ts';

const BENCH_SLOTS = new Set(['BN', 'IR']);
const VALID_SLOTS = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'IR']);

export interface LineupSlotRecord {
  game_source_key: string;
  year: number;
  week: number;
  manager_id: string;
  player_name: string | null;
  lineup_position: string;
  was_started: boolean;
  drafted_by_manager_id: string | null;
  is_keeper: boolean;
  [field: string]: string | number | boolean | null;
}

export interface LineupsResult {
  slots: LineupSlotRecord[];
  warnings: SyncWarning[];
}

/**
 * Decides whether a roster slot was actually started.
 *
 * The source answers this two ways and they can disagree, so the precedence is
 * explicit: the commissioner's own `Reason` column wins, because it is what he
 * curates. `Bye` is the one value that says nothing about the slot — a player on
 * bye can be sitting in a starting slot or on the bench — so for those rows the
 * structural position decides. FLEX counts as a starting slot; BN and IR do not.
 */
export function deriveWasStarted(
  reason: string | null,
  lineupPosition: string,
): { wasStarted: boolean; ambiguous: boolean } {
  const structural = !BENCH_SLOTS.has(lineupPosition);
  switch (reason) {
    case 'Started':
      return { wasStarted: true, ambiguous: !structural };
    case 'Benched':
      return { wasStarted: false, ambiguous: structural };
    case 'IR':
      return { wasStarted: false, ambiguous: lineupPosition !== 'IR' };
    case 'Bye':
    case null:
      return { wasStarted: structural, ambiguous: false };
    default:
      return { wasStarted: structural, ambiguous: true };
  }
}

/**
 * Transforms LineupData — roughly 24,700 rows, every roster slot for every team
 * for every week across nine seasons.
 *
 * Draft provenance is denormalised onto each row by the source, including
 * `Drafted By`, which frequently differs from the row's own team: the player was
 * drafted by someone else and acquired later. That difference is the interesting
 * part of the data, so it is preserved as a separate manager reference rather
 * than normalised away.
 */
export function transformLineups(
  spec: SheetSpec,
  rows: readonly SourceRow[],
  resolver: ManagerResolver,
): LineupsResult {
  const slots: LineupSlotRecord[] = [];
  const warnings: SyncWarning[] = [];
  let ambiguousCount = 0;
  const ambiguousExamples: Array<Record<string, unknown>> = [];
  const unknownSlots = new Map<string, number>();

  rows.forEach((raw, index) => {
    const rowNumber = Number(raw.__rowNumber ?? index + 1);
    const row = mapRow(spec, raw, rowNumber);

    const year = row.year as number;
    const week = row.week as number;
    const lineupPosition = String(row.lineup_position);

    if (!VALID_SLOTS.has(lineupPosition)) {
      unknownSlots.set(lineupPosition, (unknownSlots.get(lineupPosition) ?? 0) + 1);
      return;
    }

    const managerId = resolver.resolve(row.team as string, spec.sheetName);
    const opponentName = row.opponent as string | null;
    const opponentId = opponentName ? resolver.resolve(opponentName, spec.sheetName) : null;

    // `Drafted By` names a manager too, and it must resolve through the same map
    // — otherwise draft-slot analysis silently loses whichever picks belong to a
    // manager spelled differently on this sheet.
    const draftedByName = row.drafted_by as string | null;
    const draftedById = draftedByName
      ? resolver.resolve(draftedByName, `${spec.sheetName} (Drafted By)`)
      : null;

    const reason = row.reason as string | null;
    const { wasStarted, ambiguous } = deriveWasStarted(reason, lineupPosition);
    if (ambiguous) {
      ambiguousCount += 1;
      if (ambiguousExamples.length < 10) {
        ambiguousExamples.push({ row: rowNumber, year, week, lineupPosition, reason });
      }
    }

    const keeper = row.keeper as string | null;

    slots.push({
      ...row,
      game_source_key: gameSourceKey({
        year,
        week,
        timeOfSeason: String(row.time_of_season ?? 'Regular'),
        managerA: managerId,
        managerB: opponentId,
      }),
      year,
      week,
      manager_id: managerId,
      player_name: row.player_name as string | null,
      lineup_position: lineupPosition,
      was_started: wasStarted,
      drafted_by_manager_id: draftedById,
      is_keeper: keeper !== null && keeper.toUpperCase() !== 'NO',
    });
  });

  if (unknownSlots.size > 0) {
    throw new SyncError(
      `LineupData contains roster slot types the site does not recognise: ` +
        [...unknownSlots.entries()].map(([slot, n]) => `"${slot}" (${n} rows)`).join(', '),
      {
        sheet: spec.sheetName,
        column: 'Lineup POS',
        hint:
          'Valid slots are QB, RB, WR, TE, FLEX, K, DEF, BN and IR. If the league added a ' +
          'new roster slot, add it to VALID_SLOTS in packages/sync/src/transform/lineups.ts ' +
          'and to the lineup_position check in packages/db/migrations/0003_lineups_drafts.sql.',
      },
    );
  }

  if (ambiguousCount > 0) {
    warnings.push({
      code: 'lineup_started_ambiguous',
      message:
        `${ambiguousCount} lineup row(s) have a Reason that disagrees with the roster slot ` +
        `they sit in (for example Reason "Started" on a bench slot). The Reason column was ` +
        `treated as correct.`,
      context: { examples: ambiguousExamples },
    });
  }

  return { slots, warnings };
}
