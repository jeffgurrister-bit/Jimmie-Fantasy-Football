import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/columns.ts';
import { gameSourceKey, transformGames } from '../src/transform/games.ts';
import { gamePair, gameRow, testResolver } from './helpers.ts';

describe('gameSourceKey', () => {
  it('is identical whichever side of the game it is built from', () => {
    // This is the mechanism the whole deduplication rests on: the A row and the
    // B row describe one game from opposite sides, and sorting the pair makes
    // both produce the same identity.
    const fromA = gameSourceKey({
      year: 2016, week: 3, timeOfSeason: 'Regular',
      managerA: 'jimmie-perkins', managerB: 'josh-jones',
    });
    const fromB = gameSourceKey({
      year: 2016, week: 3, timeOfSeason: 'Regular',
      managerA: 'josh-jones', managerB: 'jimmie-perkins',
    });
    expect(fromA).toBe(fromB);
  });

  it('separates a week-14 regular game from a week-14 playoff game', () => {
    // Week 14 is both the last regular week and the first playoff week, so the
    // same pairing can legitimately appear twice — two different games.
    const regular = gameSourceKey({
      year: 2021, week: 14, timeOfSeason: 'Regular',
      managerA: 'jim-perkins', managerB: 'josh-baker',
    });
    const playoff = gameSourceKey({
      year: 2021, week: 14, timeOfSeason: 'Playoff',
      managerA: 'jim-perkins', managerB: 'josh-baker',
    });
    expect(regular).not.toBe(playoff);
  });
});

describe('transformGames — the A/B deduplication', () => {
  it('turns two mirrored source rows into ONE game with TWO team rows', () => {
    // The bug this guards against doubles every count on the site.
    const rows = gamePair({ team: 'Jimmie', opponent: 'Josh', score: 120, oppScore: 99 });
    const result = transformGames(GAME_DATA, rows, testResolver());

    expect(result.games).toHaveLength(1);
    expect(result.gameTeams).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
  });

  it('keeps both perspectives, with each side seeing its own score', () => {
    const rows = gamePair({ team: 'Jimmie', opponent: 'Josh', score: 120, oppScore: 99 });
    const { gameTeams } = transformGames(GAME_DATA, rows, testResolver());

    const jimmie = gameTeams.find((gt) => gt.manager_id === 'jimmie-perkins')!;
    const josh = gameTeams.find((gt) => gt.manager_id === 'josh-jones')!;

    expect(jimmie.score).toBe(120);
    expect(jimmie.opponent_score).toBe(99);
    expect(jimmie.opponent_manager_id).toBe('josh-jones');
    expect(jimmie.is_home_side).toBe(true);

    expect(josh.score).toBe(99);
    expect(josh.opponent_score).toBe(120);
    expect(josh.opponent_manager_id).toBe('jimmie-perkins');
    expect(josh.is_home_side).toBe(false);
  });

  it('counts games off the A rows only, across a realistic week', () => {
    const rows = [
      ...gamePair({ team: 'Jimmie', opponent: 'Josh', week: 1 }),
      ...gamePair({ team: 'Jim', opponent: 'Yisha', week: 1 }),
      ...gamePair({ team: 'Jimmie', opponent: 'Jim', week: 2 }),
    ];
    const result = transformGames(GAME_DATA, rows, testResolver());

    // 6 source rows -> 3 games, 6 team rows. Not 6 games.
    expect(rows).toHaveLength(6);
    expect(result.games).toHaveLength(3);
    expect(result.gameTeams).toHaveLength(6);
  });

  it('flags an unbalanced A/B column instead of quietly halving the season', () => {
    // A missing B row means one team's history is short a game.
    const rows = [
      ...gamePair({ team: 'Jimmie', opponent: 'Josh', week: 1 }),
      gameRow({ team: 'Jim', opponent: 'Yisha', side: 'A', week: 1 }),
    ];
    const result = transformGames(GAME_DATA, rows, testResolver());

    expect(result.games).toHaveLength(2);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('ab_side_imbalance');
    expect(codes).toContain('game_missing_opponent_row');
  });

  it('reports a B row with no A counterpart and does not import it', () => {
    // Without an A row there is no game to attach to, so the row is dropped —
    // but loudly.
    const rows = [gameRow({ team: 'Josh', opponent: 'Jimmie', side: 'B', week: 5 })];
    const result = transformGames(GAME_DATA, rows, testResolver());

    expect(result.games).toHaveLength(0);
    expect(result.gameTeams).toHaveLength(0);
    expect(result.warnings.map((w) => w.code)).toContain('game_team_without_game');
  });

  it('flags an A/B value that is neither A nor B', () => {
    const rows = [
      gameRow({ team: 'Jimmie', opponent: 'Josh', side: 'C' as 'A', week: 1 }),
    ];
    const result = transformGames(GAME_DATA, rows, testResolver());
    expect(result.warnings.map((w) => w.code)).toContain('ab_side_unrecognised');
  });

  it('respects the Game Played flag rather than assuming every row happened', () => {
    const rows = gamePair({ team: 'Jimmie', opponent: 'Josh', week: 17 });
    rows[0]!['Game Played'] = 'NO';
    rows[1]!['Game Played'] = 'NO';
    const result = transformGames(GAME_DATA, rows, testResolver());
    expect(result.games[0]!.was_played).toBe(false);
  });

  it('refuses to merge two genuinely different games with the same identity', () => {
    // Duplicated rows in the sheet must surface, not silently overwrite.
    const rows = [
      gameRow({ team: 'Jimmie', opponent: 'Josh', side: 'A', week: 1, score: 100 }),
      gameRow({ team: 'Jimmie', opponent: 'Josh', side: 'A', week: 1, score: 133 }),
    ];
    expect(() => transformGames(GAME_DATA, rows, testResolver())).toThrow(
      /resolve to the same identity/,
    );
  });

  it('stops rather than inventing a manager for an unmapped name', () => {
    const rows = gamePair({ team: 'Jimmie', opponent: 'SomeoneNew', week: 1 });
    expect(() => transformGames(GAME_DATA, rows, testResolver())).toThrow(
      /not listed in data\/managers\.yaml/,
    );
  });
});
