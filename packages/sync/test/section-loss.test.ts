/**
 * The snapshot's sources are each optional, which makes partial rebuilds possible
 * and also makes it easy to erase a section by forgetting a flag: the build
 * succeeds, writes a snapshot with that section empty, and the scheduled job
 * commits it. Pages then vanish from the live site with nothing reporting an error.
 *
 * That nearly happened the day power rankings were added — the scheduled workflow
 * would have rebuilt without them. These tests pin the guard that stops it.
 */
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  carryForwardUnsourcedSections, refuseToLoseASection, type Snapshot,
} from '../src/snapshot.ts';

/** A snapshot carrying only the fields the guard looks at, each populated. */
function snapshotWith(over: Partial<Snapshot> = {}): Snapshot {
  return {
    generatedAt: '2026-08-20T12:00:00.000Z',
    powerRankings: { '2025': [{ rank: 1 }] },
    seasons: [{}],
    champions: [{}],
    benchRegret: [{ player_name: 'Some Player' }],
    draftSlots: [{ draft_slot: 1 }],
    totals: { seasons: 10, games: 902, lineup_rows: 24668, draft_picks: 1494, managers: 15 },
    warnings: [],
    ...over,
  } as unknown as Snapshot;
}

/** What a Google-only rebuild produces: no workbook sections, no rankings. */
function googleOnly(): Snapshot {
  return snapshotWith({
    benchRegret: [],
    draftSlots: [],
    totals: { seasons: 10, games: 902, lineup_rows: 0, draft_picks: 0, managers: 15 } as never,
  });
}

/** Writes `current` to a throwaway file and returns its path. */
async function on_disk(current: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'jff-section-loss-'));
  const path = join(dir, 'snapshot.json');
  await writeFile(path, typeof current === 'string' ? current : JSON.stringify(current));
  return path;
}

describe('refusing to empty a section the site already serves', () => {
  it('stops a rebuild that drops power rankings entirely', async () => {
    const current = await on_disk(snapshotWith());
    await expect(
      refuseToLoseASection(snapshotWith({ powerRankings: {} }), false, current),
    ).rejects.toThrow(/power rankings: 1 → 0, missing --power-rankings-id/);
  });

  it('names every section that would be lost, not just the first', async () => {
    const current = await on_disk(snapshotWith());
    const next = snapshotWith({ powerRankings: {}, benchRegret: [], draftSlots: [] });
    await expect(refuseToLoseASection(next, false, current)).rejects.toThrow(
      /would empty 3 section\(s\)/,
    );
  });

  it('allows a section to shrink — only vanishing is suspicious', async () => {
    const current = await on_disk(snapshotWith({ seasons: [{}, {}, {}] as never }));
    await expect(
      refuseToLoseASection(snapshotWith(), false, current),
    ).resolves.toBeUndefined();
  });

  it('allows a section that was already empty to stay empty', async () => {
    const current = await on_disk(snapshotWith({ powerRankings: {} }));
    await expect(
      refuseToLoseASection(snapshotWith({ powerRankings: {} }), false, current),
    ).resolves.toBeUndefined();
  });

  it('lets the removal through when it is deliberate', async () => {
    const current = await on_disk(snapshotWith());
    await expect(
      refuseToLoseASection(snapshotWith({ powerRankings: {} }), true, current),
    ).resolves.toBeUndefined();
  });

  it('has nothing to protect on a fresh checkout', async () => {
    // The first build has no previous snapshot to compare against, and must not be
    // blocked by its own sections looking empty.
    await expect(
      refuseToLoseASection(snapshotWith({ powerRankings: {} }), false, '/nope/none.json'),
    ).resolves.toBeUndefined();
  });

  it('does not fall over on a corrupt snapshot', async () => {
    const current = await on_disk('not json at all');
    await expect(
      refuseToLoseASection(snapshotWith({ powerRankings: {} }), false, current),
    ).resolves.toBeUndefined();
  });
});

describe('carrying forward a section whose source was not in this run', () => {
  it('keeps bench regret and drafts when the workbook is absent', async () => {
    // This is the scheduled run: two Google sheets, no workbook in the repo. It
    // must not drop the Excel-only sections, and must not fail either.
    const current = await on_disk(snapshotWith());
    const next = googleOnly();
    await carryForwardUnsourcedSections(
      next, { workbook: false, powerRankings: true }, current,
    );

    expect(next.benchRegret).toHaveLength(1);
    expect(next.draftSlots).toHaveLength(1);
    // The totals count workbook rows, so they have to travel with their sections.
    expect(next.totals.lineup_rows).toBe(24668);
    expect(next.totals.draft_picks).toBe(1494);
    // And the guard it used to trip must now be satisfied.
    await expect(refuseToLoseASection(next, false, current)).resolves.toBeUndefined();
  });

  it('says in the run log what it kept and how old it is', async () => {
    const current = await on_disk(snapshotWith({ generatedAt: '2026-08-14T09:00:00.000Z' }));
    const next = googleOnly();
    await carryForwardUnsourcedSections(
      next, { workbook: false, powerRankings: true }, current,
    );
    const carried = next.warnings.find((w) => w.code === 'carried_forward');
    expect(carried?.message).toContain('bench regret and draft history');
    expect(carried?.message).toContain('2026-08-14');
  });

  it('keeps power rankings when only that sheet is missing', async () => {
    const current = await on_disk(snapshotWith());
    const next = snapshotWith({ powerRankings: {} });
    await carryForwardUnsourcedSections(
      next, { workbook: true, powerRankings: false }, current,
    );
    expect(Object.keys(next.powerRankings)).toEqual(['2025']);
  });

  it('leaves a section alone when its source WAS in the run', async () => {
    // A present source that produced nothing is schema drift, not a missing file,
    // and must fall through to the guard rather than being papered over.
    const current = await on_disk(snapshotWith());
    const next = googleOnly();
    await carryForwardUnsourcedSections(
      next, { workbook: true, powerRankings: true }, current,
    );
    expect(next.benchRegret).toHaveLength(0);
    await expect(refuseToLoseASection(next, false, current)).rejects.toThrow(
      /bench regret: 1 → 0/,
    );
  });

  it('does not overwrite sections this run actually produced', async () => {
    const current = await on_disk(snapshotWith());
    const next = snapshotWith({ benchRegret: [{ player_name: 'Newer Player' }] as never });
    await carryForwardUnsourcedSections(
      next, { workbook: false, powerRankings: false }, current,
    );
    expect(next.benchRegret).toEqual([{ player_name: 'Newer Player' }]);
    expect(next.warnings).toHaveLength(0);
  });

  it('has nothing to carry forward on a first build', async () => {
    const next = googleOnly();
    await carryForwardUnsourcedSections(
      next, { workbook: false, powerRankings: false }, '/nope/none.json',
    );
    expect(next.benchRegret).toHaveLength(0);
    expect(next.warnings).toHaveLength(0);
  });
});
