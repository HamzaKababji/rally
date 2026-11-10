import { describe, expect, it } from 'vitest';
import { doublesIndividualTable, doublesPairTable, headToHead, pairKey, singlesTable, winPct } from './stats';
import type { MatchRow } from '../data/types';

type Row = Pick<MatchRow, 'kind' | 'team_a' | 'team_b' | 'status' | 'winner' | 'summary'>;

const s = (a: string, b: string, winner: 'A' | 'B' | null, sets: [number, number][], status: Row['status'] = 'completed'): Row => ({
  kind: 'singles',
  team_a: [a],
  team_b: [b],
  status,
  winner,
  summary: {
    sets: sets.map(([x, y]) => ({ a: x, b: y, done: true })),
    setsWon: { a: sets.filter(([x, y]) => x > y).length, b: sets.filter(([x, y]) => y > x).length },
  },
});
const d = (a: string[], b: string[], winner: 'A' | 'B'): Row => ({
  kind: 'doubles',
  team_a: a,
  team_b: b,
  status: 'completed',
  winner,
  summary: { sets: [{ a: 6, b: 4, done: true }], setsWon: { a: winner === 'A' ? 1 : 0, b: winner === 'B' ? 1 : 0 } },
});

describe('singles leaderboard', () => {
  it('counts W-L, sets and games, completed only, ranked by win %', () => {
    const rows = [
      s('ann', 'bob', 'A', [[6, 4], [6, 3]]),
      s('bob', 'cat', 'A', [[6, 0], [3, 6], [7, 5]]),
      s('cat', 'ann', 'B', [[2, 6], [4, 6]]),
      s('ann', 'cat', null, [[3, 2]], 'in_progress'),
    ];
    const t = singlesTable(rows);
    expect(t.map((r) => r.key)).toEqual(['ann', 'bob', 'cat']);
    expect(t[0]).toMatchObject({ wins: 2, losses: 0, setsWon: 4, setsLost: 0, gamesWon: 24, gamesLost: 13 });
    expect(t[1]).toMatchObject({ wins: 1, losses: 1, setsWon: 2, setsLost: 3 });
    expect(winPct(t[1])).toBe(0.5);
  });
});

describe('doubles leaderboard', () => {
  it('groups unordered pairs and individuals', () => {
    const rows = [d(['x', 'y'], ['p', 'q'], 'A'), d(['q', 'p'], ['y', 'x'], 'A'), d(['x', 'p'], ['y', 'q'], 'B')];
    const pairs = doublesPairTable(rows);
    expect(pairs.find((r) => r.key === pairKey(['p', 'q']))).toMatchObject({ wins: 1, losses: 1 });
    expect(pairs.find((r) => r.key === pairKey(['y', 'x']))).toMatchObject({ wins: 1, losses: 1 });
    expect(pairs).toHaveLength(4);
    const ind = doublesIndividualTable(rows);
    expect(ind.find((r) => r.key === 'y')).toMatchObject({ wins: 2, losses: 1 });
    expect(ind.find((r) => r.key === 'p')).toMatchObject({ wins: 1, losses: 2 });
  });
  it('ignores singles', () => {
    expect(doublesPairTable([s('a', 'b', 'A', [[6, 0]])])).toEqual([]);
  });
});

describe('head to head', () => {
  it('finds matches either way round and counts completed results', () => {
    const rows = [
      s('ann', 'bob', 'A', [[6, 4]]),
      s('bob', 'ann', 'A', [[6, 4]]),
      s('bob', 'ann', 'B', [[4, 6]]),
      s('ann', 'bob', null, [[1, 1]], 'in_progress'),
      s('ann', 'cat', 'A', [[6, 4]]),
    ];
    const h = headToHead(rows, ['ann'], ['bob']);
    expect(h.matches).toHaveLength(4);
    expect(h.wins1).toBe(2);
    expect(h.wins2).toBe(1);
  });
  it('matches pairs regardless of order', () => {
    const h = headToHead([d(['x', 'y'], ['p', 'q'], 'B')], ['q', 'p'], ['y', 'x']);
    expect(h.wins1).toBe(1);
    expect(h.wins2).toBe(0);
  });
});
