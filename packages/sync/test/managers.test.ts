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

  it('is honest that it is not ready to publish yet', async () => {
    // The 2018/2022 championship question is still open, so the map must NOT
    // claim to be clean. If this test ever fails, either Jimmie answered the
    // questions (good — delete this test) or someone marked a guess as
    // confirmed (bad).
    const text = await readFile(MANAGERS_PATH, 'utf8');
    const resolver = new ManagerResolver(parseManagerMap(text));
    expect(resolver.isCleanForProduction).toBe(false);
    expect(resolver.unconfirmed.length).toBeGreaterThan(0);
  });
});
