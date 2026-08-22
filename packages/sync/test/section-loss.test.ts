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
import { refuseToLoseASection, type Snapshot } from '../src/snapshot.ts';

/** A snapshot carrying only the fields the guard looks at, each populated. */
function snapshotWith(over: Partial<Snapshot> = {}): Snapshot {
  return {
    powerRankings: { '2025': [{}] },
    seasons: [{}],
    champions: [{}],
    benchRegret: [{}],
    draftSlots: [{}],
    ...over,
  } as unknown as Snapshot;
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
