/**
 * Where the site gets its numbers.
 *
 * It reads a JSON snapshot that is generated from the commissioner's workbook and
 * committed to the repo. That means the deployed site has **no database, no
 * connection string and no environment variables** — it is a static site, and
 * nothing has to be set up for it to work.
 *
 * Regenerate the snapshot after the workbook changes:
 *
 *   pnpm snapshot --file RBB_League_History.xlsx
 *
 * The Postgres path in `@jff/db` still exists and is still tested. It is there for
 * the lineup explorer, which filters all 24,668 roster rows live and genuinely
 * needs indexed queries rather than a JSON file. When that arrives, these
 * functions gain a database branch; the pages calling them will not change,
 * because the snapshot deliberately uses the same row shapes the SQL returns.
 */
import snapshotJson from '../data/snapshot.json' with { type: 'json' };
import type {
  BenchRegret, ChampionRow, DraftSlotRow, GameRow, HeadToHead, LeagueTotals,
  ManagerProfile, ManagerSeason, RecordGame, SeasonStanding, SeasonSummary,
  StandingRow, TitleCount,
} from '@jff/db';

interface Snapshot {
  generatedAt: string;
  leagueName: string;
  totals: LeagueTotals;
  champions: ChampionRow[];
  titleCounts: TitleCount[];
  standings: { regular: StandingRow[]; all: StandingRow[] };
  seasons: SeasonSummary[];
  seasonStandings: Record<string, SeasonStanding[]>;
  seasonGames: Record<string, GameRow[]>;
  managers: Record<
    string,
    { profile: ManagerProfile; seasons: ManagerSeason[]; headToHead: HeadToHead[] }
  >;
  records: {
    careerHigh: RecordGame[];
    careerLow: RecordGame[];
    blowouts: RecordGame[];
    nailbiters: RecordGame[];
  };
  benchRegret: BenchRegret[];
  draftSlots: DraftSlotRow[];
  warnings: Array<{ code: string; message: string }>;
}

const snapshot = snapshotJson as unknown as Snapshot;

/** True when the snapshot actually holds a league. False on a fresh checkout. */
export function hasData(): boolean {
  return snapshot.totals.seasons > 0;
}

export function generatedAt(): string {
  return snapshot.generatedAt;
}

export function totals(): LeagueTotals {
  return snapshot.totals;
}

export function champions(): ChampionRow[] {
  return snapshot.champions;
}

export function titleCounts(): TitleCount[] {
  return snapshot.titleCounts;
}

export function standings(scope: 'regular' | 'all' = 'regular'): StandingRow[] {
  return snapshot.standings[scope];
}

export function seasons(): SeasonSummary[] {
  return snapshot.seasons;
}

export function seasonYears(): number[] {
  return snapshot.seasons.map((s) => s.year);
}

export function seasonSummary(year: number): SeasonSummary | undefined {
  return snapshot.seasons.find((s) => s.year === year);
}

export function seasonStandings(year: number): SeasonStanding[] {
  return snapshot.seasonStandings[String(year)] ?? [];
}

export function seasonGames(year: number): GameRow[] {
  return snapshot.seasonGames[String(year)] ?? [];
}

export function managerIds(): string[] {
  return Object.keys(snapshot.managers);
}

export function manager(id: string):
  | { profile: ManagerProfile; seasons: ManagerSeason[]; headToHead: HeadToHead[] }
  | undefined {
  return snapshot.managers[id];
}

export function records(): Snapshot['records'] {
  return snapshot.records;
}

export function benchRegret(): BenchRegret[] {
  return snapshot.benchRegret;
}

export function draftSlots(): DraftSlotRow[] {
  return snapshot.draftSlots;
}

export function warnings(): Array<{ code: string; message: string }> {
  return snapshot.warnings;
}
