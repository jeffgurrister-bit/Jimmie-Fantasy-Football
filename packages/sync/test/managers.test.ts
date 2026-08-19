import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { ManagerResolver, MANAGERS_PATH, parseManagerMap } from '../src/managers.ts';
import { testResolver } from './helpers.ts';

const UNCONFIRMED_YAML = `
managers:
  - id: josh-jones
    canonical_name: Josh Jones
    display_name: Josh
    confirmed: false
    leagues: [rbb]
    aliases: ["Josh"]
unresolved:
  - id: q1-yisha-is-josh-baker
    blocks: [josh-jones]
    question: Is Yisha the nickname of Josh Baker?
`;

describe('the identity map refuses to corrupt itself', () => {
  it('rejects one alias claimed by two managers', () => {
    // This is the exact collision the map exists to prevent: two Joshes, one
    // label. Allowing it would merge two people's records.
    const yaml = `
managers:
  - id: josh-jones
    canonical_name: Josh Jones
    display_name: Josh
    confirmed: true
    aliases: ["Josh"]
  - id: josh-baker
    canonical_name: Josh Baker
    display_name: Yisha
    confirmed: true
    aliases: ["Josh"]
`;
    expect(() => parseManagerMap(yaml)).toThrow(/claimed by both/);
  });

  it('treats aliases that differ only in punctuation or case as the same claim', () => {
    const yaml = `
managers:
  - id: joe-malak
    canonical_name: Joe Malak
    display_name: Joe
    confirmed: true
    aliases: ["Joe G."]
  - id: joe-g
    canonical_name: Joe Someone
    display_name: Joe G.
    confirmed: true
    aliases: ["joe g"]
`;
    expect(() => parseManagerMap(yaml)).toThrow(/claimed by both/);
  });

  it('rejects a duplicate manager id', () => {
    const yaml = `
managers:
  - id: jim-perkins
    canonical_name: Jim Perkins
    display_name: Jim
    aliases: ["Jim"]
  - id: jim-perkins
    canonical_name: Jimmie Perkins
    display_name: Jimmie
    aliases: ["Jimmie"]
`;
    expect(() => parseManagerMap(yaml)).toThrow(/Duplicate manager id/);
  });

  it('rejects a manager with no aliases, who could never match a source row', () => {
    const yaml = `
managers:
  - id: ghost
    canonical_name: Nobody
    display_name: Nobody
    aliases: []
`;
    expect(() => parseManagerMap(yaml)).toThrow(/no aliases/);
  });
});

describe('resolving a source name', () => {
  it('maps a short name to its canonical manager id', () => {
    const r = testResolver();
    expect(r.resolve('Jimmie', 'GameData')).toBe('jimmie-perkins');
    expect(r.resolve('Yisha', 'GameData')).toBe('josh-baker');
  });

  it('keeps the two Perkinses and the two Joshes apart', () => {
    const r = testResolver();
    expect(r.resolve('Jim', 'GameData')).not.toBe(r.resolve('Jimmie', 'GameData'));
    expect(r.resolve('Josh', 'GameData')).not.toBe(r.resolve('Yisha', 'GameData'));
  });

  it('throws, naming the sheet, rather than dropping an unmapped name', () => {
    const r = testResolver();
    // A dropped row silently shrinks someone's record; an invented manager
    // splits one person in two. Neither is acceptable, so this stops the run.
    expect(() => r.resolve('Gil', 'LineupData')).toThrow(/LineupData/);
    expect(() => r.resolve('Gil', 'LineupData')).toThrow(/managers\.yaml/);
  });
});

describe('the confirmation gate', () => {
  it('blocks an unconfirmed identity by default', () => {
    const r = new ManagerResolver(parseManagerMap(UNCONFIRMED_YAML));
    expect(() => r.resolve('Josh', 'Finishes')).toThrow(/not confirmed/);
  });

  it('lets an unconfirmed identity through only when explicitly allowed', () => {
    const r = new ManagerResolver(parseManagerMap(UNCONFIRMED_YAML), { allowUnconfirmed: true });
    expect(r.resolve('Josh', 'Finishes')).toBe('josh-jones');
  });

  it('is not production-clean while any question is open', () => {
    const r = new ManagerResolver(parseManagerMap(UNCONFIRMED_YAML));
    expect(r.isCleanForProduction).toBe(false);
    expect(r.readinessReport()).toMatch(/not confirmed yet/);
    expect(r.readinessReport()).toMatch(/q1-yisha-is-josh-baker/);
  });

  it('is production-clean once every identity is confirmed and nothing is open', () => {
    const r = testResolver();
    expect(r.isCleanForProduction).toBe(true);
    expect(r.readinessReport()).toMatch(/Cleared to publish/);
  });
});

describe('per-league membership', () => {
  const YAML = `
managers:
  - id: gil-smit
    canonical_name: Gil Smit
    display_name: Gil
    confirmed: true
    aliases: ["Gil"]
    leagues:
      - id: rbb
        first_year: 2016
      - id: dm
        first_year: 2025
        last_year: 2025
        active: false
        franchise: Orland Park Burnt Ends
  - id: austin-jones
    canonical_name: Austin Jones
    display_name: Austin
    confirmed: true
    aliases: ["Austin"]
    leagues: [rbb]
`;

  it('lets a manager be active in one league and retired from another', () => {
    // Gil still plays RBB and has retired from Dyno Mites. A single flag on the
    // manager cannot say that, which is why status lives per league.
    const map = parseManagerMap(YAML);
    const gil = map.managers.find((m) => m.id === 'gil-smit')!;
    expect(gil.leagues.find((l) => l.id === 'rbb')!.active).toBe(true);
    expect(gil.leagues.find((l) => l.id === 'dm')!.active).toBe(false);
    // He is still active overall, because one of his leagues is.
    expect(gil.is_active).toBe(true);
  });

  it('carries the franchise name on the league, not the manager', () => {
    // A franchise belongs to a manager-league pairing so it can change hands
    // without rewriting history. RBB has none.
    const map = parseManagerMap(YAML);
    const gil = map.managers.find((m) => m.id === 'gil-smit')!;
    expect(gil.leagues.find((l) => l.id === 'dm')!.franchise).toBe('Orland Park Burnt Ends');
    expect(gil.leagues.find((l) => l.id === 'rbb')!.franchise).toBeUndefined();
  });

  it('accepts the plain shorthand as an active membership', () => {
    const map = parseManagerMap(YAML);
    const austin = map.managers.find((m) => m.id === 'austin-jones')!;
    expect(austin.leagues).toEqual([{ id: 'rbb', active: true }]);
    expect(austin.is_active).toBe(true);
  });

  it('lists managers by league', () => {
    const r = new ManagerResolver(parseManagerMap(YAML));
    expect(r.inLeague('rbb').map((m) => m.id)).toEqual(['austin-jones', 'gil-smit']);
    expect(r.inLeague('dm').map((m) => m.id)).toEqual(['gil-smit']);
  });

  it('treats a manager with no active league as inactive', () => {
    const map = parseManagerMap(`
managers:
  - id: jared-bosi
    canonical_name: Jared Bosi
    display_name: Jared
    confirmed: true
    aliases: ["Jared"]
    leagues:
      - id: rbb
        first_year: 2016
        last_year: 2016
        active: false
`);
    expect(map.managers[0]!.is_active).toBe(false);
  });
});

describe('the real data/managers.yaml', () => {
  it('parses, and every alias is unambiguous', async () => {
    const text = await readFile(MANAGERS_PATH, 'utf8');
    const map = parseManagerMap(text);
    expect(map.managers.length).toBeGreaterThan(10);
  });

  it('covers every RBB short name found in the source sheets', async () => {
    // The full alias list from the workbook. If a name here has no home in the
    // identity map, the very first sync would fail on it.
    const SHORT_NAMES = [
      'Jimmie', 'Jim', 'Joe', 'Joe G.', 'Josh', 'Yisha', 'Gil', 'Jerry', 'Ryan',
      'Trevor', 'Austin', 'Jacob', 'Jonathan', 'Nick', 'Jared',
    ];
    const text = await readFile(MANAGERS_PATH, 'utf8');
    const resolver = new ManagerResolver(parseManagerMap(text), { allowUnconfirmed: true });
    for (const name of SHORT_NAMES) {
      expect(() => resolver.resolve(name, 'GameData'), `"${name}" is unmapped`).not.toThrow();
    }
  });

  it('is cleared to publish — every identity confirmed, no questions open', async () => {
    // Jimmie confirmed the last of them (Yisha = Josh Baker). If this test starts
    // failing, someone has added a manager without confirming who they are, and
    // the sync will refuse to run until they do.
    const text = await readFile(MANAGERS_PATH, 'utf8');
    const resolver = new ManagerResolver(parseManagerMap(text));
    expect(resolver.unconfirmed).toEqual([]);
    expect(resolver.map.unresolved).toEqual([]);
    expect(resolver.isCleanForProduction).toBe(true);
  });

  it('resolves the two Joshes the way Jimmie confirmed', async () => {
    // The bare "Josh" is Josh JONES; "Yisha" is Josh BAKER. This is the mapping
    // that decides who owns the 2018 and 2022 championships, so it is asserted
    // explicitly rather than left to the general alias machinery.
    const text = await readFile(MANAGERS_PATH, 'utf8');
    const r = new ManagerResolver(parseManagerMap(text));
    expect(r.resolve('Josh', 'GameData')).toBe('josh-jones');
    expect(r.resolve('Yisha', 'GameData')).toBe('josh-baker');
    // He is shown as "Yisha" on the site, by his own choice, but is really Josh Baker.
    expect(r.get('josh-baker')!.display_name).toBe('Yisha');
    expect(r.get('josh-baker')!.canonical_name).toBe('Josh Baker');
  });

  it('has all 15 RBB managers and the 13 Dyno Mites franchises', async () => {
    const text = await readFile(MANAGERS_PATH, 'utf8');
    const r = new ManagerResolver(parseManagerMap(text), { allowUnconfirmed: true });
    // Exactly the 15 short names that appear across the RBB workbook.
    expect(r.inLeague('rbb')).toHaveLength(15);
    // 12 active Dyno Mites franchises plus Gil Smit, retired after 2025.
    expect(r.inLeague('dm')).toHaveLength(13);
    const dmFranchises = r.inLeague('dm').map((m) => r.leagueEntry(m.id, 'dm')!.franchise);
    expect(dmFranchises.every((f) => typeof f === 'string' && f.length > 0)).toBe(true);
    expect(new Set(dmFranchises).size).toBe(13);
  });

  it('keeps the people who share a name or a nickname apart', async () => {
    const text = await readFile(MANAGERS_PATH, 'utf8');
    const r = new ManagerResolver(parseManagerMap(text), { allowUnconfirmed: true });
    const pairs: Array<[string, string]> = [
      ['Jimmie', 'Jim'],            // two Perkinses
      ['Josh', 'Yisha'],            // two Joshes
      ['Joe', 'Joe G.'],            // two Joes
      ['Jerry', 'Joe'],             // two Malaks
      ['Josh', 'Austin'],           // two of the three Joneses
      ['Austin', 'Nick'],           // the third Jones
      ['Jonathan', 'Jonathan B.'],  // Jawor in RBB vs Barth in DM
      ['Mike', 'Arturo'],           // two Amezcuas
    ];
    for (const [a, b] of pairs) {
      expect(r.resolve(a, 'test'), `${a} vs ${b}`).not.toBe(r.resolve(b, 'test'));
    }
  });

  it('does not let a bare first name resolve to two different people', async () => {
    // "Jonathan" belongs to Jawor because that is what the RBB sheets call him.
    // Barth is never bare, so the two can never be confused.
    const text = await readFile(MANAGERS_PATH, 'utf8');
    const r = new ManagerResolver(parseManagerMap(text), { allowUnconfirmed: true });
    expect(r.resolve('Jonathan', 'GameData')).toBe('jonathan-jawor');
    expect(r.resolve('Jonathan Barth', 'DM')).toBe('jonathan-barth');
  });
});
