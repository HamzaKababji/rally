import { describe, expect, it } from 'vitest';
import {
  classifySetScore,
  deriveMatchState,
  nextSeq,
  normalizeFormat,
  summarize,
} from './engine';
import { formatSet } from './describe';
import type { EventPayload, MatchFormat, ScoringEvent, ScoringMatch, Team } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const singles = (format?: Partial<MatchFormat>): ScoringMatch => ({
  kind: 'singles',
  teamA: ['a'],
  teamB: ['b'],
  format,
});
const doubles = (format?: Partial<MatchFormat>): ScoringMatch => ({
  kind: 'doubles',
  teamA: ['a1', 'a2'],
  teamB: ['b1', 'b2'],
  format,
});

/** "AABA" → four point events */
const pts = (s: string): EventPayload[] =>
  s.split('').map((c) => ({ kind: 'point', winner: c as Team }));
/** One game won to love by a team, as points. */
const gameTo = (t: Team) => pts(t.repeat(4));
/** "ABAB" → each letter wins one game to love. */
const games = (s: string): EventPayload[] => s.split('').flatMap((c) => gameTo(c as Team));
const serve = (firstServerId: string, extra: Partial<EventPayload> = {}): EventPayload =>
  ({ kind: 'serve_setup', firstServerId, ...extra }) as EventPayload;

const toEvents = (payloads: EventPayload[]): ScoringEvent[] =>
  payloads.map((payload, i) => ({ seq: i + 1, payload }));

const derive = (m: ScoringMatch, ...payloads: (EventPayload | EventPayload[])[]) =>
  deriveMatchState(m, toEvents(payloads.flat()));

/** Holds of serve until 6-6 when `a` serves first: a, b, a, b... */
const toSixAll = games('ABABABABABAB');

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

describe('format', () => {
  it('fills defaults: best of 3, 6 games, advantage, 7-point tiebreak, normal final set', () => {
    expect(normalizeFormat(undefined)).toEqual({
      bestOf: 3,
      gamesPerSet: 6,
      advantage: true,
      tiebreakPoints: 7,
      finalSet: 'normal',
      matchTiebreakPoints: 10,
    });
  });

  it('rejects unknown values and keeps the rest', () => {
    const f = normalizeFormat({ bestOf: 7 as never, gamesPerSet: 4 });
    expect(f.bestOf).toBe(3);
    expect(f.gamesPerSet).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Point display
// ---------------------------------------------------------------------------

describe('point display', () => {
  it('counts 0, 15, 30, 40', () => {
    const m = singles();
    expect(derive(m).pointDisplay).toEqual({ A: '0', B: '0' });
    expect(derive(m, pts('A')).pointDisplay).toEqual({ A: '15', B: '0' });
    expect(derive(m, pts('AA')).pointDisplay).toEqual({ A: '30', B: '0' });
    expect(derive(m, pts('AAB')).pointDisplay).toEqual({ A: '30', B: '15' });
    expect(derive(m, pts('AAAB')).pointDisplay).toEqual({ A: '40', B: '15' });
  });

  it('cycles deuce → Ad A → deuce → Ad B → deuce several times', () => {
    const m = singles();
    let log = pts('AAABBB');
    expect(derive(m, log).call).toBe('Deuce');
    expect(derive(m, log).pointDisplay).toEqual({ A: '40', B: '40' });
    for (let i = 0; i < 3; i++) {
      log = [...log, ...pts('A')];
      expect(derive(m, log).call).toBe('Ad A');
      expect(derive(m, log).pointDisplay).toEqual({ A: 'Ad', B: '40' });
      log = [...log, ...pts('B')];
      expect(derive(m, log).call).toBe('Deuce');
      log = [...log, ...pts('B')];
      expect(derive(m, log).call).toBe('Ad B');
      expect(derive(m, log).pointDisplay).toEqual({ A: '40', B: 'Ad' });
      log = [...log, ...pts('A')];
      expect(derive(m, log).call).toBe('Deuce');
      expect(derive(m, log).games).toEqual({ A: 0, B: 0 });
    }
    const won = derive(m, log, pts('BB'));
    expect(won.games).toEqual({ A: 0, B: 1 });
    expect(won.pointDisplay).toEqual({ A: '0', B: '0' });
    expect(won.call).toBeNull();
  });

  it('shows plain numbers in a tiebreak', () => {
    const s = derive(singles(), serve('a'), toSixAll, pts('AAB'));
    expect(s.inTiebreak).toBe(true);
    expect(s.pointDisplay).toEqual({ A: '2', B: '1' });
    expect(s.call).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No-ad
// ---------------------------------------------------------------------------

describe('no-ad scoring', () => {
  const m = singles({ advantage: false });

  it('flags a deciding point at 40-40, served to the deuce court', () => {
    const s = derive(m, serve('a'), pts('AAABBB'));
    expect(s.call).toBe('Deuce');
    expect(s.decidingPoint).toBe(true);
    expect(s.side).toBe('deuce');
  });

  it('the next point wins the game', () => {
    expect(derive(m, serve('a'), pts('AAABBBB')).games).toEqual({ A: 0, B: 1 });
    expect(derive(m, serve('a'), pts('AAABBBA')).games).toEqual({ A: 1, B: 0 });
  });

  it('has no deciding point with advantage on', () => {
    expect(derive(singles(), pts('AAABBB')).decidingPoint).toBe(false);
  });

  it('marks the deciding point as break point for the receiver', () => {
    const s = derive(m, serve('a'), pts('AAABBB'));
    expect(s.breakPointFor).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// Serving order and court side
// ---------------------------------------------------------------------------

describe('serving: singles', () => {
  it('alternates the server every game', () => {
    const m = singles();
    const servers: (string | null)[] = [];
    const log: EventPayload[] = [serve('b')];
    for (let g = 0; g < 6; g++) {
      servers.push(derive(m, log).server.id);
      log.push(...gameTo(g % 2 === 0 ? 'A' : 'B'));
    }
    expect(servers).toEqual(['b', 'a', 'b', 'a', 'b', 'a']);
  });

  it('the receiver is the opponent', () => {
    const s = derive(singles(), serve('a'));
    expect(s.server).toEqual({ id: 'a', team: 'A' });
    expect(s.receiver).toEqual({ id: 'b', team: 'B' });
  });

  it('flags missing serve setup but still counts points', () => {
    const s = derive(singles(), pts('AA'));
    expect(s.needsServeSetup).toBe(true);
    expect(s.server.id).toBeNull();
    expect(s.pointDisplay.A).toBe('30');
  });
});

describe('court side', () => {
  it('starts each game in the deuce court and alternates by total points', () => {
    const m = singles();
    const sides = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => derive(m, serve('a'), pts('ABAB' + 'AB'.repeat(4)).slice(0, n)).side);
    expect(sides).toEqual(['deuce', 'ad', 'deuce', 'ad', 'deuce', 'ad', 'deuce', 'ad']);
    // New game resets to deuce.
    expect(derive(m, serve('a'), pts('AAA')).side).toBe('ad');
    expect(derive(m, serve('a'), pts('AAAA')).side).toBe('deuce');
  });
});

describe('serving: doubles', () => {
  const m = doubles();
  const setup = serve('a1', { receiverDeuceIdA: 'a2', receiverDeuceIdB: 'b1' });

  it('asks for the second team’s server when their first service game comes up', () => {
    expect(derive(m, setup).needsNextServer).toBeNull();
    const s = derive(m, setup, gameTo('A'));
    expect(s.needsNextServer).toEqual({ team: 'B' });
    expect(s.server).toEqual({ id: null, team: 'B' });
    const after = derive(m, setup, gameTo('A'), { kind: 'next_server', teamBServerId: 'b2' });
    expect(after.needsNextServer).toBeNull();
    expect(after.server.id).toBe('b2');
  });

  it('rotates A1, B1, A2, B2 over 8 games', () => {
    const log: EventPayload[] = [setup];
    const servers: (string | null)[] = [];
    for (let g = 0; g < 8; g++) {
      servers.push(derive(m, log).server.id);
      log.push(...gameTo(g % 2 === 0 ? 'A' : 'B'));
      if (g === 0) log.push({ kind: 'next_server', teamBServerId: 'b2' });
    }
    expect(servers).toEqual(['a1', 'b2', 'a2', 'b1', 'a1', 'b2', 'a2', 'b1']);
  });

  it('works when team B serves first (the other team gets asked)', () => {
    const s0 = derive(m, serve('b1'));
    expect(s0.server).toEqual({ id: 'b1', team: 'B' });
    const s1 = derive(m, serve('b1'), gameTo('B'));
    expect(s1.needsNextServer).toEqual({ team: 'A' });
    const s2 = derive(m, serve('b1'), gameTo('B'), { kind: 'next_server', teamBServerId: 'a2' }, gameTo('A'));
    expect(s2.server.id).toBe('b2');
  });

  it('receivers keep their deuce/ad sides for the whole set', () => {
    const log: EventPayload[] = [setup];
    // Game 1: a1 serves to team B. b1 deuce, b2 ad.
    expect(derive(m, log).receiver.id).toBe('b1');
    expect(derive(m, log, pts('A')).receiver.id).toBe('b2');
    expect(derive(m, log, pts('AB')).receiver.id).toBe('b1');
    log.push(...gameTo('A'), { kind: 'next_server', teamBServerId: 'b2' });
    // Game 2: b2 serves to team A. a2 deuce, a1 ad.
    expect(derive(m, log).receiver).toEqual({ id: 'a2', team: 'A' });
    expect(derive(m, log, pts('B')).receiver.id).toBe('a1');
    log.push(...gameTo('B'));
    // Game 3: a2 serves; team B still b1 deuce, b2 ad.
    expect(derive(m, log).server.id).toBe('a2');
    expect(derive(m, log).receiver.id).toBe('b1');
    expect(derive(m, log, pts('A')).receiver.id).toBe('b2');
  });

  it('defaults the deuce receiver to the first listed partner', () => {
    expect(derive(m, serve('a1')).receiver.id).toBe('b1');
  });
});

// ---------------------------------------------------------------------------
// Change of ends
// ---------------------------------------------------------------------------

describe('change of ends', () => {
  const m = singles();

  it('after odd games in a set only', () => {
    const flags = [1, 2, 3, 4, 5].map((n) => derive(m, serve('a'), games('ABABA'.slice(0, n))).changeEnds);
    expect(flags).toEqual([true, false, true, false, true]);
    expect(derive(m, serve('a')).changeEnds).toBe(false);
  });

  it('clears once the next point is played', () => {
    expect(derive(m, serve('a'), games('A'), pts('A')).changeEnds).toBe(false);
  });

  it('after a set ending with an odd total (6-3) but not an even one (6-4)', () => {
    const s63 = derive(m, serve('a'), games('AAAAABBBA'));
    expect(s63.sets[0]).toMatchObject({ gamesA: 6, gamesB: 3, complete: true });
    expect(s63.changeEnds).toBe(true);
    const s64 = derive(m, serve('a'), games('AAAABBBBAA'));
    expect(s64.sets[0]).toMatchObject({ gamesA: 6, gamesB: 4, complete: true });
    expect(s64.changeEnds).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tiebreak
// ---------------------------------------------------------------------------

describe('tiebreak (7-6)', () => {
  const m = singles();

  it('starts at 6-6 with the server whose turn it is, from the deuce court', () => {
    const s = derive(m, serve('a'), toSixAll);
    expect(s.games).toEqual({ A: 6, B: 6 });
    expect(s.inTiebreak).toBe(true);
    expect(s.server.id).toBe('a');
    expect(s.side).toBe('deuce');
  });

  it('switches after point 1, then every 2 points, ad side first for each server', () => {
    const tb = pts('ABABABABABAB'); // up to 6-6 in points
    const rows = Array.from({ length: 9 }, (_, n) => {
      const s = derive(m, serve('a'), toSixAll, tb.slice(0, n));
      return `${s.server.id}:${s.side}`;
    });
    expect(rows).toEqual([
      'a:deuce',
      'b:ad',
      'b:deuce',
      'a:ad',
      'a:deuce',
      'b:ad',
      'b:deuce',
      'a:ad',
      'a:deuce',
    ]);
  });

  it('changes ends every 6 points', () => {
    const tb = pts('ABABABABABAB');
    const flags = Array.from({ length: 13 }, (_, n) => derive(m, serve('a'), toSixAll, tb.slice(0, n)).changeEnds);
    expect(flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0)).toEqual([6, 12]);
  });

  it('needs a 2-point lead and records the set as 7-6 with the tiebreak score', () => {
    const notYet = derive(m, serve('a'), toSixAll, pts('ABABABABABAB'), pts('A'));
    expect(notYet.inTiebreak).toBe(true);
    expect(notYet.pointDisplay).toEqual({ A: '7', B: '6' });
    const done = derive(m, serve('a'), toSixAll, pts('AAAAABBBBBAA'));
    expect(done.sets[0]).toMatchObject({ gamesA: 7, gamesB: 6, tiebreakA: 7, tiebreakB: 5, winner: 'A', complete: true });
    expect(formatSet(done.sets[0])).toBe('7–6(5)');
    expect(done.inTiebreak).toBe(false);
    // A 13-game set has an odd total: change ends.
    expect(done.changeEnds).toBe(true);
  });

  it('the next set is served by whoever received first in the tiebreak', () => {
    const done = derive(m, serve('a'), toSixAll, pts('AAAAAAA'));
    expect(done.sets[0]).toMatchObject({ gamesA: 7, gamesB: 6, tiebreakA: 7, tiebreakB: 0 });
    expect(done.server.id).toBe('b');
    const otherWay = derive(m, serve('b'), toSixAll.map((p) => ({ ...p, winner: p.kind === 'point' && p.winner === 'A' ? 'B' : 'A' }) as EventPayload), pts('AAAAAAA'));
    expect(otherWay.server.id).toBe('a');
  });

  it('rotates all four players in a doubles tiebreak', () => {
    const d = doubles();
    const log: EventPayload[] = [serve('a1'), ...gameTo('A'), { kind: 'next_server', teamBServerId: 'b1' }, ...games('BABABABABAB')];
    expect(derive(d, log).games).toEqual({ A: 6, B: 6 });
    const tb = pts('ABABABAB');
    const servers = Array.from({ length: 8 }, (_, n) => derive(d, log, tb.slice(0, n)).server.id);
    // 12 games played → a1 serves point 1, then b1 x2, a2 x2, b2 x2, a1 ...
    expect(servers).toEqual(['a1', 'b1', 'b1', 'a2', 'a2', 'b2', 'b2', 'a1']);
  });

  it('uses 4-4 tiebreaks in 4-game sets', () => {
    const s = derive(singles({ gamesPerSet: 4 }), serve('a'), games('ABABABAB'));
    expect(s.inTiebreak).toBe(true);
    const won42 = derive(singles({ gamesPerSet: 4 }), serve('a'), games('AAAB' + 'A'));
    expect(won42.sets[0]).toMatchObject({ gamesA: 4, gamesB: 1, complete: true });
  });
});

// ---------------------------------------------------------------------------
// Sets, match and situation flags
// ---------------------------------------------------------------------------

describe('set and match completion', () => {
  it('wins a set 6-4 and 7-5, not 6-5', () => {
    const m = singles();
    expect(derive(m, games('AAAAABBBBBA')).sets[0].complete).toBe(false);
    expect(derive(m, games('AAAAABBBBBAA')).sets[0]).toMatchObject({ gamesA: 7, gamesB: 5, complete: true });
  });

  it('best of 3: two sets wins', () => {
    const s = derive(singles(), games('AAAAAA'), games('AAAAAA'));
    expect(s.isComplete).toBe(true);
    expect(s.winner).toBe('A');
    expect(s.setsWon).toEqual({ A: 2, B: 0 });
    expect(s.sets).toHaveLength(2);
  });

  it('best of 1 and best of 5', () => {
    expect(derive(singles({ bestOf: 1 }), games('BBBBBB')).winner).toBe('B');
    const five = singles({ bestOf: 5 });
    expect(derive(five, games('AAAAAA'.repeat(2))).isComplete).toBe(false);
    expect(derive(five, games('AAAAAA'.repeat(3))).winner).toBe('A');
  });

  it('flags break point for the receiver only', () => {
    const m = singles();
    expect(derive(m, serve('a'), pts('BBB')).breakPointFor).toBe('B');
    expect(derive(m, serve('a'), pts('AAA')).breakPointFor).toBeNull();
    expect(derive(m, serve('a'), pts('AAABBBB')).breakPointFor).toBe('B');
  });

  it('break point and set point can coincide', () => {
    // 5-4, b serving the 10th game, A up 40-0.
    const sp = derive(singles(), serve('a'), games('ABABABABA'), pts('AAA'));
    expect(sp.games).toEqual({ A: 5, B: 4 });
    expect(sp.server.id).toBe('b');
    expect(sp.breakPointFor).toBe('A');
    expect(sp.setPointFor).toBe('A');
  });

  it('flags set point and match point (explicit)', () => {
    const m = singles();
    const setPt = derive(m, serve('a'), games('AAAAA'), pts('AAA'));
    expect(setPt.games).toEqual({ A: 5, B: 0 });
    expect(setPt.setPointFor).toBe('A');
    expect(setPt.matchPointFor).toBeNull();
    const matchPt = derive(m, serve('a'), games('AAAAAA'), games('AAAAA'), pts('AAA'));
    expect(matchPt.matchPointFor).toBe('A');
    expect(matchPt.setPointFor).toBeNull();
    const savedBy = derive(m, serve('a'), games('AAAAAA'), games('AAAAA'), pts('BBB'));
    expect(savedBy.matchPointFor).toBeNull();
  });

  it('flags set point inside a tiebreak but never break point', () => {
    const s = derive(singles(), serve('a'), toSixAll, pts('AAAAAA'));
    expect(s.setPointFor).toBe('A');
    expect(s.breakPointFor).toBeNull();
  });
});

describe('match tiebreak final set', () => {
  const m = singles({ finalSet: 'match_tiebreak' });
  const oneAll = [serve('a'), ...games('AAAAAA'), ...games('BBBBBB')];

  it('plays the deciding set as a 10-point tiebreak', () => {
    const s = derive(m, oneAll);
    expect(s.setsWon).toEqual({ A: 1, B: 1 });
    expect(s.inTiebreak).toBe(true);
    expect(s.isMatchTiebreak).toBe(true);
    expect(s.pointDisplay).toEqual({ A: '0', B: '0' });
  });

  it('needs 10 points and a 2-point lead', () => {
    const at109 = derive(m, oneAll, pts('AB'.repeat(9)), pts('A'));
    expect(at109.pointDisplay).toEqual({ A: '10', B: '9' });
    expect(at109.isComplete).toBe(false);
    expect(at109.matchPointFor).toBe('A');
    const won = derive(m, oneAll, pts('AB'.repeat(9)), pts('AA'));
    expect(won.isComplete).toBe(true);
    expect(won.winner).toBe('A');
    expect(won.sets[2]).toMatchObject({ matchTiebreak: true, tiebreakA: 11, tiebreakB: 9, gamesA: 1, gamesB: 0 });
    expect(formatSet(won.sets[2])).toBe('[11–9]');
  });

  it('changes ends every 6 points in the match tiebreak', () => {
    expect(derive(m, oneAll, pts('AAAAAA')).changeEnds).toBe(true);
    expect(derive(m, oneAll, pts('AAAAA')).changeEnds).toBe(false);
  });

  it('is not used in a best-of-1 match', () => {
    expect(derive(singles({ bestOf: 1, finalSet: 'match_tiebreak' })).isMatchTiebreak).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Undo, ordering and ignored events
// ---------------------------------------------------------------------------

describe('undo (drop the last event)', () => {
  const m = singles();

  it('undoing a game-winning point restores 40-15 and the server', () => {
    const log = toEvents([serve('a'), ...pts('AAABA')]);
    const before = deriveMatchState(m, log);
    expect(before.games).toEqual({ A: 1, B: 0 });
    expect(before.server.id).toBe('b');
    const undone = deriveMatchState(m, log.slice(0, -1));
    expect(undone.games).toEqual({ A: 0, B: 0 });
    expect(undone.pointDisplay).toEqual({ A: '40', B: '15' });
    expect(undone.server.id).toBe('a');
  });

  it('undoing a match-winning point reopens the match', () => {
    const log = toEvents([serve('a'), ...games('AAAAAA'), ...games('AAAAAA')]);
    expect(deriveMatchState(m, log).isComplete).toBe(true);
    const undone = deriveMatchState(m, log.slice(0, -1));
    expect(undone.isComplete).toBe(false);
    expect(undone.games).toEqual({ A: 5, B: 0 });
    expect(undone.pointDisplay).toEqual({ A: '40', B: '0' });
    expect(undone.matchPointFor).toBe('A');
  });

  it('replays events by seq, not array order, and tolerates gaps', () => {
    const events: ScoringEvent[] = [
      { seq: 10, payload: { kind: 'point', winner: 'B' } },
      { seq: 2, payload: { kind: 'point', winner: 'A' } },
      { seq: 5, payload: { kind: 'point', winner: 'A' } },
    ];
    expect(deriveMatchState(m, events).pointDisplay).toEqual({ A: '30', B: '15' });
    expect(nextSeq(events)).toBe(11);
    expect(nextSeq([])).toBe(1);
  });
});

describe('points after the match ends', () => {
  it('are ignored and reported', () => {
    const m = singles({ bestOf: 1 });
    const log = toEvents([...games('AAAAAA'), ...pts('BBBB'), { kind: 'game', winner: 'B' }]);
    const s = deriveMatchState(m, log);
    expect(s.winner).toBe('A');
    expect(s.sets).toHaveLength(1);
    expect(s.sets[0]).toMatchObject({ gamesA: 6, gamesB: 0 });
    expect(s.ignoredSeqs).toEqual([25, 26, 27, 28, 29]);
    expect(s.server.id).toBeNull();
    expect(s.changeEnds).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mixed logs: point + game + set_score
// ---------------------------------------------------------------------------

describe('mixed point / game / set_score logs', () => {
  const m = singles();

  it('game events award whole games and interleave with points', () => {
    const s = derive(m, serve('a'), pts('AA'), { kind: 'game', winner: 'B' }, pts('A'));
    // The partial 30-0 game was awarded to B; the next game is 15-0.
    expect(s.games).toEqual({ A: 0, B: 1 });
    expect(s.pointDisplay).toEqual({ A: '15', B: '0' });
    expect(s.server.id).toBe('b');
  });

  it('a game event during a tiebreak wins the set (score unknown)', () => {
    const s = derive(m, serve('a'), toSixAll, pts('AB'), { kind: 'game', winner: 'B' });
    expect(s.sets[0]).toMatchObject({ gamesA: 6, gamesB: 7, winner: 'B', complete: true });
    expect(s.sets[0].tiebreakA).toBeUndefined();
  });

  it('set_score for the current set completes it and play continues in the next', () => {
    const s = derive(m, serve('a'), pts('AB'), { kind: 'set_score', set: 1, gamesA: 6, gamesB: 3 }, pts('A'));
    expect(s.sets[0]).toMatchObject({ gamesA: 6, gamesB: 3, winner: 'A', complete: true });
    expect(s.currentSet).toBe(2);
    expect(s.pointDisplay).toEqual({ A: '15', B: '0' });
    // 9 games played with a serving first → b serves game 10.
    expect(s.server.id).toBe('b');
  });

  it('set_score can set an in-progress score and points continue from it', () => {
    const s = derive(m, serve('a'), { kind: 'set_score', set: 1, gamesA: 4, gamesB: 4 }, gameTo('A'), gameTo('A'));
    expect(s.sets[0]).toMatchObject({ gamesA: 6, gamesB: 4, complete: true });
  });

  it('set_score at 6-6 with tiebreak points continues the tiebreak', () => {
    const s = derive(m, serve('a'), { kind: 'set_score', set: 1, gamesA: 6, gamesB: 6, tiebreakA: 5, tiebreakB: 6 }, pts('B'));
    expect(s.sets[0]).toMatchObject({ gamesA: 6, gamesB: 7, tiebreakA: 5, tiebreakB: 7, winner: 'B' });
  });

  it('corrects an earlier set and the match result follows', () => {
    const log: EventPayload[] = [
      serve('a'),
      ...games('AAAAAA'),
      ...games('BBBBBB'),
      ...pts('AA'),
    ];
    const before = derive(m, log);
    expect(before.currentSet).toBe(3);
    // Set 2 was actually won by A 6-4: the match is over 2-0.
    const fixed = derive(m, log, { kind: 'set_score', set: 2, gamesA: 6, gamesB: 4 });
    expect(fixed.isComplete).toBe(true);
    expect(fixed.winner).toBe('A');
    expect(fixed.sets.map(formatSet)).toEqual(['6–0', '6–4']);
    // And correcting it back re-opens the match.
    const reopened = derive(m, log, { kind: 'set_score', set: 2, gamesA: 6, gamesB: 4 }, { kind: 'set_score', set: 2, gamesA: 3, gamesB: 6 });
    expect(reopened.isComplete).toBe(false);
    expect(reopened.currentSet).toBe(3);
  });

  it('mixes all three kinds across a whole match', () => {
    const s = derive(
      m,
      serve('a'),
      { kind: 'set_score', set: 1, gamesA: 4, gamesB: 6 },
      pts('AAAA'),
      { kind: 'game', winner: 'A' },
      { kind: 'set_score', set: 2, gamesA: 5, gamesB: 5 },
      games('AA'),
      { kind: 'game', winner: 'B' },
      pts('ABABAB'),
    );
    expect(s.sets.slice(0, 2).map(formatSet)).toEqual(['4–6', '7–5']);
    expect(s.currentSet).toBe(3);
    expect(s.games).toEqual({ A: 0, B: 1 });
    expect(s.call).toBe('Deuce');
  });

  it('ignores set_score for a set that has not started or an impossible score', () => {
    const s = derive(m, { kind: 'set_score', set: 3, gamesA: 6, gamesB: 0 }, { kind: 'set_score', set: 1, gamesA: 9, gamesB: 1 });
    expect(s.ignoredSeqs).toEqual([1, 2]);
    expect(s.warnings).toHaveLength(2);
    expect(s.sets[0]).toMatchObject({ gamesA: 0, gamesB: 0, complete: false });
  });

  it('set_score for a match tiebreak set takes tiebreak points', () => {
    const mtb = singles({ finalSet: 'match_tiebreak' });
    const s = derive(mtb, games('AAAAAA'), games('BBBBBB'), { kind: 'set_score', set: 3, gamesA: 0, gamesB: 0, tiebreakA: 8, tiebreakB: 10 });
    expect(s.winner).toBe('B');
    expect(formatSet(s.sets[2])).toBe('[8–10]');
  });
});

describe('classifySetScore', () => {
  const f = normalizeFormat(undefined);
  it.each([
    [6, 0, 'complete'],
    [6, 4, 'complete'],
    [7, 5, 'complete'],
    [7, 6, 'complete'],
    [6, 5, 'in_progress'],
    [6, 6, 'in_progress'],
    [3, 2, 'in_progress'],
    [7, 3, 'invalid'],
    [8, 6, 'invalid'],
  ])('%i-%i is %s', (a, b, status) => {
    expect(classifySetScore(f, { gamesA: a, gamesB: b }, false).status).toBe(status);
  });
});

describe('summarize', () => {
  it('produces a compact cache for list views', () => {
    const s = derive(singles(), serve('a'), games('AAAAAA'), games('AB'), pts('AAB'));
    expect(summarize(s)).toEqual({
      sets: [
        { a: 6, b: 0, done: true },
        { a: 1, b: 1, done: false },
      ],
      setsWon: { a: 1, b: 0 },
      points: { a: '30', b: '15' },
      inTiebreak: false,
      server: 'A',
    });
  });
});
