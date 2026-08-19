import { query, queryOne } from '@jff/db';
import type { SyncWarning } from '@jff/db';
import { DRAFT_HISTORY, FINISHES, GAME_DATA, LINEUP_DATA, PLAYERS } from './columns.ts';
import type { ManagerResolver } from './managers.ts';
import { ensureLeague, loadLeague, type LoadPayload } from './load/index.ts';
import { readSheet, type SheetSource } from './sources/rows.ts';
import { transformDrafts, transformPlayers } from './transform/drafts.ts';
import { transformGames } from './transform/games.ts';
import { transformLineups } from './transform/lineups.ts';
import { transformSeasons } from './transform/seasons.ts';

export interface RunOptions {
  source: SheetSource;
  resolver: ManagerResolver;
  leagueId: string;
  sourceLabel: 'xlsx-backfill' | 'google-sheets';
  trigger: 'cron' | 'manual' | 'cli';
  /** Validate and transform, but write nothing. */
  dryRun?: boolean;
  onProgress?: (message: string) => void;
}

/** Identity of the RBB league row. */
export const RBB_LEAGUE = {
  id: 'rbb',
  name: 'Risky Biscuit Brigade',
  shortName: 'RBB',
  firstYear: 2016,
  identityDisplay: 'manager',
} as const;

export interface RunResult {
  status: 'success' | 'failed';
  rowCounts: Record<string, number>;
  warnings: SyncWarning[];
  summary: string;
  error?: string;
}

/**
 * The whole RBB pipeline: read, validate, transform, load.
 *
 * Validation happens for every sheet before anything is transformed, so a
 * renamed column produces one clear error up front rather than a half-finished
 * import. Nothing is written until every sheet has parsed.
 */
export async function runRbbSync(options: RunOptions): Promise<RunResult> {
  const { source, resolver, onProgress = () => {} } = options;
  const warnings: SyncWarning[] = [];

  // The league row has to exist before a sync run can reference it — including
  // the very first run, and including one that is about to fail.
  if (!options.dryRun) await ensureLeague(RBB_LEAGUE);
  const runId = options.dryRun ? null : await startSyncRun(options);

  try {
    // --- read + validate every sheet first ----------------------------------
    onProgress('Reading GameData…');
    const gameData = await readSheet(source, GAME_DATA);
    onProgress('Reading LineupData…');
    const lineupData = await readSheet(source, LINEUP_DATA);
    onProgress('Reading Draft History…');
    const draftData = await readSheet(source, DRAFT_HISTORY);
    onProgress('Reading Finishes…');
    const finishesData = await readSheet(source, FINISHES);
    onProgress('Reading Players…');
    const playersData = await readSheet(source, PLAYERS);

    // Rows skipped for having no identity are reported, not hidden. A jump in
    // this count is the signal that something changed in the sheet's shape.
    for (const [spec, read] of [
      [GAME_DATA, gameData], [LINEUP_DATA, lineupData], [DRAFT_HISTORY, draftData],
      [FINISHES, finishesData], [PLAYERS, playersData],
    ] as const) {
      if (read.scaffoldingRows > 0) {
        warnings.push({
          code: 'scaffolding_rows_skipped',
          message:
            `Skipped ${read.scaffoldingRows} row(s) in ${spec.sheetName} that had no ` +
            `"${spec.keyColumn}" value — these are the formula rows below the real data.`,
          context: { sheet: spec.sheetName, skipped: read.scaffoldingRows, imported: read.rows.length },
        });
      }
    }

    // --- transform ----------------------------------------------------------
    onProgress('Building seasons and teams…');
    const seasons = transformSeasons(FINISHES, finishesData.rows, resolver);
    warnings.push(...seasons.warnings);

    onProgress('Building games (deduplicating the A/B rows)…');
    const games = transformGames(GAME_DATA, gameData.rows, resolver);
    warnings.push(...games.warnings);

    onProgress('Building lineups…');
    const lineups = transformLineups(LINEUP_DATA, lineupData.rows, resolver);
    warnings.push(...lineups.warnings);

    onProgress('Building draft history…');
    const drafts = transformDrafts(DRAFT_HISTORY, draftData.rows, resolver);
    warnings.push(...drafts.warnings);

    const players = transformPlayers(
      PLAYERS,
      playersData.rows,
      [
        ...lineups.slots
          .filter((s) => s.player_name)
          .map((s) => ({ name: s.player_name as string, position: (s.player_position as string) ?? null })),
        ...drafts.picks.map((p) => ({ name: p.player_name, position: p.position })),
      ],
    );

    // The Excel workbook ends at 2024 while the Google history sheet already
    // names a 2025 champion. Rather than silently preferring one source, the run
    // reports the newest season it actually saw so the disagreement is visible.
    const newestSeason = seasons.seasons.at(-1)?.year;
    if (newestSeason !== undefined) {
      warnings.push({
        code: 'newest_season_loaded',
        message:
          `The newest season in this source is ${newestSeason}. If the league has played a ` +
          `season since then, that data has not reached this source yet.`,
        context: { source: source.label, newestSeason },
      });
    }

    const unconfirmed = resolver.unconfirmed;
    if (unconfirmed.length > 0) {
      warnings.push({
        code: 'unconfirmed_manager_identities',
        message:
          `${unconfirmed.length} manager identit${unconfirmed.length === 1 ? 'y is' : 'ies are'} ` +
          `still unverified: ${unconfirmed.map((m) => m.display_name).join(', ')}. ` +
          `The site shows these as provisional.`,
        context: { managers: unconfirmed.map((m) => m.id) },
      });
    }

    const payload: LoadPayload = {
      leagueId: options.leagueId,
      leagueName: RBB_LEAGUE.name,
      leagueShortName: RBB_LEAGUE.shortName,
      leagueFirstYear: RBB_LEAGUE.firstYear,
      identityDisplay: RBB_LEAGUE.identityDisplay,
      managers: resolver.all,
      seasons: seasons.seasons,
      teamSeasons: seasons.teamSeasons,
      games: games.games,
      gameTeams: games.gameTeams,
      players,
      lineupSlots: lineups.slots,
      draftPicks: drafts.picks,
    };

    if (options.dryRun) {
      const counts = {
        seasons: payload.seasons.length,
        team_seasons: payload.teamSeasons.length,
        games: payload.games.length,
        game_teams: payload.gameTeams.length,
        players: payload.players.length,
        lineup_slots: payload.lineupSlots.length,
        draft_picks: payload.draftPicks.length,
      };
      return {
        status: 'success',
        rowCounts: counts,
        warnings,
        summary: describe(counts, warnings, true),
      };
    }

    onProgress('Writing to the database…');
    const loaded = await loadLeague(payload);
    warnings.push(...loaded.warnings);

    const summary = describe(loaded.rowCounts, warnings, false);
    await finishSyncRun(runId, 'success', summary, loaded.rowCounts, warnings, null);
    return { status: 'success', rowCounts: loaded.rowCounts, warnings, summary };
  } catch (err) {
    const message = err instanceof Error ? err.toString() : String(err);
    await finishSyncRun(runId, 'failed', 'The update did not finish.', {}, warnings, message);
    return {
      status: 'failed',
      rowCounts: {},
      warnings,
      summary: 'The update did not finish. Nothing was changed on the site.',
      error: message,
    };
  }
}

/**
 * Plain-English summary. This is what the commissioner reads on the admin page,
 * so it counts things he recognises rather than naming database tables.
 */
function describe(
  counts: Record<string, number>,
  warnings: readonly SyncWarning[],
  dryRun: boolean,
): string {
  const verb = dryRun ? 'Checked' : 'Loaded';
  const parts = [
    `${verb} ${counts.games ?? 0} games across ${counts.seasons ?? 0} seasons, ` +
      `${counts.lineup_slots ?? 0} lineup rows and ${counts.draft_picks ?? 0} draft picks.`,
  ];
  if (warnings.length > 0) {
    parts.push(`${warnings.length} thing(s) worth a look:`);
    for (const w of warnings) parts.push(`  • ${w.message}`);
  } else {
    parts.push('No problems found.');
  }
  return parts.join('\n');
}

async function startSyncRun(options: RunOptions): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `insert into sync_runs (league_id, source, trigger, status)
     values ($1, $2, $3, 'running') returning id`,
    [options.leagueId, options.sourceLabel, options.trigger],
  );
  return row!.id;
}

async function finishSyncRun(
  runId: number | null,
  status: 'success' | 'failed',
  summary: string,
  rowCounts: Record<string, number>,
  warnings: readonly SyncWarning[],
  error: string | null,
): Promise<void> {
  if (runId === null) return;
  await query(
    `update sync_runs set status = $2, finished_at = now(), summary = $3,
       row_counts = $4::jsonb, warnings = $5::jsonb, error_message = $6
     where id = $1`,
    [runId, status, summary, JSON.stringify(rowCounts), JSON.stringify(warnings), error],
  );
}
