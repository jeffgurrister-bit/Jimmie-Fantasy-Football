import { describe, expect, it } from 'vitest';
import { deriveWasStarted } from '../src/transform/lineups.ts';

describe('deriveWasStarted', () => {
  it('trusts the commissioner\'s Reason column when it is decisive', () => {
    expect(deriveWasStarted('Started', 'QB').wasStarted).toBe(true);
    expect(deriveWasStarted('Benched', 'BN').wasStarted).toBe(false);
    expect(deriveWasStarted('IR', 'IR').wasStarted).toBe(false);
  });

  it('counts FLEX as a starting slot', () => {
    // FLEX is easy to mistake for a bench slot; it is not one.
    expect(deriveWasStarted('Started', 'FLEX').wasStarted).toBe(true);
    expect(deriveWasStarted(null, 'FLEX').wasStarted).toBe(true);
  });

  it('falls back to the roster slot for a bye, which says nothing either way', () => {
    expect(deriveWasStarted('Bye', 'RB').wasStarted).toBe(true);
    expect(deriveWasStarted('Bye', 'BN').wasStarted).toBe(false);
    expect(deriveWasStarted('Bye', 'RB').ambiguous).toBe(false);
  });

  it('treats BN and IR as the only non-starting slots', () => {
    for (const slot of ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF']) {
      expect(deriveWasStarted(null, slot).wasStarted, slot).toBe(true);
    }
    for (const slot of ['BN', 'IR']) {
      expect(deriveWasStarted(null, slot).wasStarted, slot).toBe(false);
    }
  });

  it('flags a Reason that contradicts the roster slot, and keeps the Reason', () => {
    // "Started" on a bench slot is a real contradiction in the source. The
    // Reason wins, but the disagreement is reported rather than hidden.
    const conflict = deriveWasStarted('Started', 'BN');
    expect(conflict.wasStarted).toBe(true);
    expect(conflict.ambiguous).toBe(true);

    const other = deriveWasStarted('Benched', 'QB');
    expect(other.wasStarted).toBe(false);
    expect(other.ambiguous).toBe(true);
  });

  it('flags an unrecognised Reason instead of trusting it', () => {
    expect(deriveWasStarted('Suspended', 'QB').ambiguous).toBe(true);
  });
});
