import type { SyncWarning } from '@jff/db';
import type { ManagerResolver } from '../managers.ts';
import { mapRow, type SheetSpec, type SourceRow } from '../schema.ts';

export interface DraftPickRecord {
  year: number;
  round: number | null;
  pick: string | null;
  overall: number;
  player_name: string;
  position: string | null;
  nfl_team: string | null;
  manager_id: string;
  is_keeper: boolean;
}

export interface PlayerRecord {
  name: string;
  position: string | null;
}

/**
 * Transforms `Draft History` — 1,494 picks from 2016 to 2024.
 *
 * Two source quirks are handled here. The `Player` column arrives as a combined
 * string ("WR - Antonio Brown - PIT"), so the already-cleaned `Name` column is
 * what gets used. And `PCK` is a float-ish string where "1.1" and "1.10" are
 * different picks that collide the moment they are read as numbers — so it stays
 * text, and `OVR` is the ordering key.
 */
export function transformDrafts(
  spec: SheetSpec,
  rows: readonly SourceRow[],
  resolver: ManagerResolver,
): { picks: DraftPickRecord[]; warnings: SyncWarning[] } {
  const picks: DraftPickRecord[] = [];
  const warnings: SyncWarning[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  rows.forEach((raw, index) => {
    const rowNumber = Number(raw.__rowNumber ?? index + 1);
    const row = mapRow(spec, raw, rowNumber);
    const year = row.year as number;
    const overall = row.overall as number;

    const key = `${year}|${overall}`;
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);

    const keeper = row.keeper as string | null;
    picks.push({
      year,
      round: row.round as number | null,
      pick: row.pick as string | null,
      overall,
      player_name: row.player_name as string,
      position: row.position as string | null,
      nfl_team: row.nfl_team as string | null,
      manager_id: resolver.resolve(row.drafted_by as string, spec.sheetName),
      is_keeper: keeper !== null && keeper.toUpperCase() !== 'NO',
    });
  });

  if (duplicates > 0) {
    warnings.push({
      code: 'duplicate_draft_pick',
      message:
        `${duplicates} draft row(s) reuse an overall pick number already taken in the same ` +
        `year. The first occurrence was kept.`,
    });
  }

  return { picks, warnings };
}

/**
 * Builds the canonical player list. The `Players` sheet is the commissioner's
 * working normalisation table rather than a clean dimension, so names seen in
 * lineups and drafts are folded in too — a player who appears in a lineup but
 * not on that sheet should still get a row.
 */
export function transformPlayers(
  spec: SheetSpec,
  rows: readonly SourceRow[],
  extraNames: Iterable<{ name: string; position: string | null }> = [],
): PlayerRecord[] {
  const byName = new Map<string, PlayerRecord>();

  rows.forEach((raw, index) => {
    const row = mapRow(spec, raw, Number(raw.__rowNumber ?? index + 1));
    const name = row.name as string;
    byName.set(name.toLowerCase(), { name, position: row.position as string | null });
  });

  for (const extra of extraNames) {
    const key = extra.name.trim().toLowerCase();
    if (key === '') continue;
    if (!byName.has(key)) byName.set(key, { name: extra.name.trim(), position: extra.position });
  }

  return [...byName.values()];
}
