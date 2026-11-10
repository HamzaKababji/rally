// Event-sourced tennis scoring. `deriveMatchState` is a pure function: given the
// match setup and its ordered event log it replays every event and returns the
// full state. Nothing here touches React, the network or the clock.

import {
  DEFAULT_FORMAT,
  type CourtSide,
  type EventPayload,
  type MatchFormat,
  type MatchState,
  type MatchSummary,
  type ScoringEvent,
  type ScoringMatch,
  type SetScore,
  type SetScoreEvent,
  type Team,
} from './types';

export const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');

export function normalizeFormat(f?: Partial<MatchFormat> | null): MatchFormat {
  const merged = { ...DEFAULT_FORMAT, ...(f ?? {}) };
  if (![1, 3, 5].includes(merged.bestOf)) merged.bestOf = DEFAULT_FORMAT.bestOf;
  if (![4, 6].includes(merged.gamesPerSet)) merged.gamesPerSet = DEFAULT_FORMAT.gamesPerSet;
  if (merged.bestOf === 1) merged.finalSet = 'normal';
  return merged;
}

export function setsToWin(format: MatchFormat): number {
  return Math.ceil(format.bestOf / 2);
}

/** Which team a player belongs to, or null. */
export function teamOf(match: ScoringMatch, playerId: string | null | undefined): Team | null {
  if (!playerId) return null;
  if (match.teamA.includes(playerId)) return 'A';
  if (match.teamB.includes(playerId)) return 'B';
  return null;
}

// ---------------------------------------------------------------------------
// Working state (mutable during replay only; never escapes this module).
// ---------------------------------------------------------------------------

interface Working {
  sets: SetScore[]; // completed sets only
  games: Record<Team, number>;
  points: Record<Team, number>;
  /** Serving rotation: [X1, Y1] for singles, [X1, Y1, X2, Y2] for doubles. Empty until serve_setup. */
  rotation: (string | null)[];
  /** Team of each rotation slot. */
  rotationTeams: Team[];
  /** Index into rotation of whoever serves the current game (or point 1 of a tiebreak). */
  rotationPos: number;
  receiverDeuce: Record<Team, string | null>;
  changeEndsPending: boolean;
  winner: Team | null;
  /** Monotonic counters used for point-situation detection. */
  gamesWonTotal: Record<Team, number>;
  ignored: number[];
  warnings: string[];
  totalPoints: number;
}

interface Ctx {
  match: ScoringMatch;
  format: MatchFormat;
  team: Record<Team, string[]>;
}

function emptyWorking(): Working {
  return {
    sets: [],
    games: { A: 0, B: 0 },
    points: { A: 0, B: 0 },
    rotation: [],
    rotationTeams: [],
    rotationPos: 0,
    receiverDeuce: { A: null, B: null },
    changeEndsPending: false,
    winner: null,
    gamesWonTotal: { A: 0, B: 0 },
    ignored: [],
    warnings: [],
    totalPoints: 0,
  };
}

function cloneWorking(w: Working): Working {
  return {
    ...w,
    sets: w.sets.map((s) => ({ ...s })),
    games: { ...w.games },
    points: { ...w.points },
    rotation: [...w.rotation],
    rotationTeams: [...w.rotationTeams],
    receiverDeuce: { ...w.receiverDeuce },
    gamesWonTotal: { ...w.gamesWonTotal },
    ignored: [...w.ignored],
    warnings: [...w.warnings],
  };
}

const setsWonBy = (sets: SetScore[], t: Team) => sets.filter((s) => s.winner === t).length;

/** The set being played is the deciding one, played as a match tiebreak. */
function isMatchTiebreakSet(ctx: Ctx, w: Working): boolean {
  return (
    ctx.format.finalSet === 'match_tiebreak' &&
    ctx.format.bestOf > 1 &&
    w.sets.length === ctx.format.bestOf - 1
  );
}

function inTiebreak(ctx: Ctx, w: Working): boolean {
  if (isMatchTiebreakSet(ctx, w)) return true;
  const g = ctx.format.gamesPerSet;
  return w.games.A === g && w.games.B === g;
}

function tiebreakTarget(ctx: Ctx, w: Working): number {
  return isMatchTiebreakSet(ctx, w) ? ctx.format.matchTiebreakPoints : ctx.format.tiebreakPoints;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function completeSet(ctx: Ctx, w: Working, result: SetScore) {
  w.sets.push(result);
  w.games = { A: 0, B: 0 };
  w.points = { A: 0, B: 0 };
  const total = result.gamesA + result.gamesB;
  w.changeEndsPending = total % 2 === 1;
  checkMatchWinner(ctx, w);
}

function checkMatchWinner(ctx: Ctx, w: Working) {
  const need = setsToWin(ctx.format);
  w.winner = null;
  const won = { A: 0, B: 0 };
  for (let i = 0; i < w.sets.length; i++) {
    const s = w.sets[i];
    if (s.winner) won[s.winner]++;
    if (won.A >= need || won.B >= need) {
      w.winner = won.A >= need ? 'A' : 'B';
      if (i < w.sets.length - 1) {
        w.warnings.push(`Sets after set ${i + 1} were dropped: the match was already decided.`);
        w.sets = w.sets.slice(0, i + 1);
      }
      w.games = { A: 0, B: 0 };
      w.points = { A: 0, B: 0 };
      w.changeEndsPending = false;
      return;
    }
  }
}

function completeGame(ctx: Ctx, w: Working, team: Team) {
  w.games[team]++;
  w.gamesWonTotal[team]++;
  w.points = { A: 0, B: 0 };
  w.rotationPos++;
  const g = ctx.format.gamesPerSet;
  const mine = w.games[team];
  const theirs = w.games[other(team)];
  if (mine >= g && mine - theirs >= 2) {
    completeSet(ctx, w, {
      gamesA: w.games.A,
      gamesB: w.games.B,
      winner: team,
      complete: true,
    });
    return;
  }
  w.changeEndsPending = (w.games.A + w.games.B) % 2 === 1;
}

function completeTiebreak(ctx: Ctx, w: Working, team: Team, knownPoints: boolean) {
  const matchTb = isMatchTiebreakSet(ctx, w);
  const tb = knownPoints ? { tiebreakA: w.points.A, tiebreakB: w.points.B } : {};
  w.gamesWonTotal[team]++;
  // The tiebreak counts as one game in the rotation, so the next set is served
  // by whoever received first in the tiebreak.
  w.rotationPos++;
  if (matchTb) {
    completeSet(ctx, w, {
      gamesA: team === 'A' ? 1 : 0,
      gamesB: team === 'B' ? 1 : 0,
      ...tb,
      matchTiebreak: true,
      winner: team,
      complete: true,
    });
  } else {
    const games = { ...w.games };
    games[team]++;
    completeSet(ctx, w, {
      gamesA: games.A,
      gamesB: games.B,
      ...tb,
      winner: team,
      complete: true,
    });
  }
}

function applyPoint(ctx: Ctx, w: Working, team: Team) {
  w.changeEndsPending = false;
  w.points[team]++;
  w.totalPoints++;
  const mine = w.points[team];
  const theirs = w.points[other(team)];
  if (inTiebreak(ctx, w)) {
    if (mine >= tiebreakTarget(ctx, w) && mine - theirs >= 2) {
      completeTiebreak(ctx, w, team, true);
    } else if ((w.points.A + w.points.B) % 6 === 0) {
      w.changeEndsPending = true;
    }
    return;
  }
  const won = ctx.format.advantage ? mine >= 4 && mine - theirs >= 2 : mine >= 4;
  if (won) completeGame(ctx, w, team);
}

function applyGame(ctx: Ctx, w: Working, team: Team) {
  w.changeEndsPending = false;
  if (inTiebreak(ctx, w)) {
    completeTiebreak(ctx, w, team, false);
  } else {
    w.points = { A: 0, B: 0 };
    completeGame(ctx, w, team);
  }
}

type SetCheck =
  | { status: 'complete'; winner: Team }
  | { status: 'in_progress' }
  | { status: 'invalid'; reason: string };

/** Classify a set score under the match format. */
export function classifySetScore(
  format: MatchFormat,
  s: { gamesA: number; gamesB: number; tiebreakA?: number; tiebreakB?: number },
  matchTiebreak: boolean,
): SetCheck {
  const ints = [s.gamesA, s.gamesB, s.tiebreakA ?? 0, s.tiebreakB ?? 0];
  if (ints.some((n) => !Number.isInteger(n) || n < 0)) {
    return { status: 'invalid', reason: 'Scores must be whole numbers ≥ 0.' };
  }
  if (matchTiebreak) {
    if (s.tiebreakA !== undefined && s.tiebreakB !== undefined) {
      const hi = Math.max(s.tiebreakA, s.tiebreakB);
      const lo = Math.min(s.tiebreakA, s.tiebreakB);
      if (hi >= format.matchTiebreakPoints && hi - lo >= 2) {
        if (hi > format.matchTiebreakPoints && hi - lo !== 2) {
          return { status: 'invalid', reason: 'A match tiebreak past the target ends at a 2-point lead.' };
        }
        return { status: 'complete', winner: s.tiebreakA > s.tiebreakB ? 'A' : 'B' };
      }
      return { status: 'in_progress' };
    }
    if (s.gamesA + s.gamesB === 1) return { status: 'complete', winner: s.gamesA === 1 ? 'A' : 'B' };
    if (s.gamesA + s.gamesB === 0) return { status: 'in_progress' };
    return { status: 'invalid', reason: 'A match tiebreak is entered as tiebreak points.' };
  }
  const g = format.gamesPerSet;
  const hi = Math.max(s.gamesA, s.gamesB);
  const lo = Math.min(s.gamesA, s.gamesB);
  const leader: Team = s.gamesA > s.gamesB ? 'A' : 'B';
  if ((hi === g && lo <= g - 2) || (hi === g + 1 && lo === g - 1)) {
    return { status: 'complete', winner: leader };
  }
  if (hi === g + 1 && lo === g) {
    if (s.tiebreakA !== undefined && s.tiebreakB !== undefined) {
      const tbWinner: Team = s.tiebreakA > s.tiebreakB ? 'A' : 'B';
      if (tbWinner !== leader) {
        return { status: 'invalid', reason: 'The tiebreak winner must be the team with 7 games.' };
      }
    }
    return { status: 'complete', winner: leader };
  }
  if (hi < g || (hi === g && lo >= g - 1)) return { status: 'in_progress' };
  return { status: 'invalid', reason: `${s.gamesA}–${s.gamesB} is not a possible set score.` };
}

function applySetScore(ctx: Ctx, w: Working, ev: SetScoreEvent, seq: number) {
  const n = Math.floor(ev.set);
  const completed = w.sets.length;
  if (!Number.isFinite(n) || n < 1 || n > completed + 1) {
    w.warnings.push(`Set ${ev.set} can't be entered yet.`);
    w.ignored.push(seq);
    return;
  }
  if (n === completed + 1) {
    // The current set.
    if (w.winner) {
      w.ignored.push(seq);
      return;
    }
    const matchTb = isMatchTiebreakSet(ctx, w);
    const check = classifySetScore(ctx.format, ev, matchTb);
    if (check.status === 'invalid') {
      w.warnings.push(check.reason);
      w.ignored.push(seq);
      return;
    }
    w.changeEndsPending = false;
    if (matchTb) {
      if (check.status === 'complete') {
        w.rotationPos++;
        w.gamesWonTotal[check.winner]++;
        completeSet(ctx, w, {
          gamesA: check.winner === 'A' ? 1 : 0,
          gamesB: check.winner === 'B' ? 1 : 0,
          tiebreakA: ev.tiebreakA,
          tiebreakB: ev.tiebreakB,
          matchTiebreak: true,
          winner: check.winner,
          complete: true,
        });
      } else {
        w.points = { A: ev.tiebreakA ?? 0, B: ev.tiebreakB ?? 0 };
      }
      return;
    }
    // Keep the serving rotation aligned with the number of games played.
    const before = w.games.A + w.games.B;
    const after = ev.gamesA + ev.gamesB;
    w.rotationPos += after - before;
    w.points = { A: 0, B: 0 };
    if (check.status === 'complete') {
      completeSet(ctx, w, {
        gamesA: ev.gamesA,
        gamesB: ev.gamesB,
        ...(ev.tiebreakA !== undefined && ev.tiebreakB !== undefined
          ? { tiebreakA: ev.tiebreakA, tiebreakB: ev.tiebreakB }
          : {}),
        winner: check.winner,
        complete: true,
      });
    } else {
      w.games = { A: ev.gamesA, B: ev.gamesB };
      if (inTiebreak(ctx, w)) w.points = { A: ev.tiebreakA ?? 0, B: ev.tiebreakB ?? 0 };
      w.changeEndsPending = after > 0 && after % 2 === 1;
    }
    return;
  }
  // Correcting a set that is already complete.
  const wasMatchTb = !!w.sets[n - 1].matchTiebreak;
  const check = classifySetScore(ctx.format, ev, wasMatchTb);
  if (check.status !== 'complete') {
    w.warnings.push(
      check.status === 'invalid' ? check.reason : `Set ${n} is finished, so it needs a final score.`,
    );
    w.ignored.push(seq);
    return;
  }
  w.sets[n - 1] = {
    gamesA: wasMatchTb ? (check.winner === 'A' ? 1 : 0) : ev.gamesA,
    gamesB: wasMatchTb ? (check.winner === 'B' ? 1 : 0) : ev.gamesB,
    ...(ev.tiebreakA !== undefined && ev.tiebreakB !== undefined
      ? { tiebreakA: ev.tiebreakA, tiebreakB: ev.tiebreakB }
      : {}),
    ...(wasMatchTb ? { matchTiebreak: true } : {}),
    winner: check.winner,
    complete: true,
  };
  const wasOver = w.winner !== null;
  checkMatchWinner(ctx, w);
  if (wasOver && !w.winner) {
    // The correction re-opened the match: the next set starts fresh.
    w.games = { A: 0, B: 0 };
    w.points = { A: 0, B: 0 };
  }
}

function applyServeSetup(
  ctx: Ctx,
  w: Working,
  ev: Extract<EventPayload, { kind: 'serve_setup' }>,
  seq: number,
) {
  const x = teamOf(ctx.match, ev.firstServerId);
  if (!x) {
    w.warnings.push('The first server is not in this match.');
    w.ignored.push(seq);
    return;
  }
  const y = other(x);
  if (ctx.match.kind === 'singles') {
    w.rotation = [ev.firstServerId, ctx.team[y][0] ?? null];
    w.rotationTeams = [x, y];
  } else {
    const x2 = ctx.team[x].find((p) => p !== ev.firstServerId) ?? null;
    // Keep the other team's order if we already know it.
    const prevY1 =
      w.rotation.find((p, i) => p !== null && w.rotationTeams[i] === y) ?? null;
    const y2 = prevY1 ? (ctx.team[y].find((p) => p !== prevY1) ?? null) : null;
    w.rotation = [ev.firstServerId, prevY1, x2, y2];
    w.rotationTeams = [x, y, x, y];
  }
  w.rotationPos = 0;
  for (const t of ['A', 'B'] as Team[]) {
    const id = t === 'A' ? ev.receiverDeuceIdA : ev.receiverDeuceIdB;
    if (id && ctx.team[t].includes(id)) w.receiverDeuce[t] = id;
  }
}

function applyNextServer(ctx: Ctx, w: Working, id: string, seq: number) {
  const t = teamOf(ctx.match, id);
  if (!t || ctx.match.kind !== 'doubles' || w.rotation.length !== 4) {
    w.warnings.push('Next server ignored: set up who serves first before choosing the next server.');
    w.ignored.push(seq);
    return;
  }
  const slots = w.rotationTeams.map((team, i) => (team === t ? i : -1)).filter((i) => i >= 0);
  const partner = ctx.team[t].find((p) => p !== id) ?? null;
  w.rotation[slots[0]] = id;
  w.rotation[slots[1]] = partner;
}

function applyEvent(ctx: Ctx, w: Working, ev: ScoringEvent) {
  const p = ev.payload;
  switch (p?.kind) {
    case 'point':
    case 'game':
      if (w.winner || (p.winner !== 'A' && p.winner !== 'B')) {
        w.ignored.push(ev.seq);
        return;
      }
      if (p.kind === 'point') applyPoint(ctx, w, p.winner);
      else applyGame(ctx, w, p.winner);
      return;
    case 'set_score':
      applySetScore(ctx, w, p, ev.seq);
      return;
    case 'serve_setup':
      applyServeSetup(ctx, w, p, ev.seq);
      return;
    case 'next_server':
      applyNextServer(ctx, w, p.teamBServerId, ev.seq);
      return;
    default:
      w.ignored.push(ev.seq);
  }
}

// ---------------------------------------------------------------------------
// Read-out
// ---------------------------------------------------------------------------

const GAME_LABELS = ['0', '15', '30', '40'];

function pointDisplay(ctx: Ctx, w: Working) {
  const { A, B } = w.points;
  if (inTiebreak(ctx, w)) {
    return { display: { A: String(A), B: String(B) }, call: null, deciding: false };
  }
  if (A >= 3 && B >= 3) {
    if (A === B) {
      return {
        display: { A: '40', B: '40' },
        call: 'Deuce' as const,
        deciding: !ctx.format.advantage,
      };
    }
    const lead: Team = A > B ? 'A' : 'B';
    return {
      display: { A: lead === 'A' ? 'Ad' : '40', B: lead === 'B' ? 'Ad' : '40' },
      call: (lead === 'A' ? 'Ad A' : 'Ad B') as 'Ad A' | 'Ad B',
      deciding: false,
    };
  }
  return {
    display: { A: GAME_LABELS[Math.min(A, 3)], B: GAME_LABELS[Math.min(B, 3)] },
    call: null,
    deciding: false,
  };
}

function serveInfo(ctx: Ctx, w: Working) {
  const total = w.points.A + w.points.B;
  const decidingNoAd =
    !ctx.format.advantage && !inTiebreak(ctx, w) && w.points.A >= 3 && w.points.B >= 3;
  // Receiving team picks the side on a no-ad deciding point; we default to deuce.
  const side: CourtSide = decidingNoAd ? 'deuce' : total % 2 === 0 ? 'deuce' : 'ad';
  if (w.rotation.length === 0) {
    return { server: { id: null, team: null }, receiver: { id: null, team: null }, side, slotTeam: null };
  }
  const len = w.rotation.length;
  const turn = inTiebreak(ctx, w) ? Math.floor((total + 1) / 2) : 0;
  const slot = (((w.rotationPos + turn) % len) + len) % len;
  const serverTeam = w.rotationTeams[slot];
  const serverId = w.rotation[slot];
  const rt = other(serverTeam);
  let receiverId: string | null;
  if (ctx.match.kind === 'singles') {
    receiverId = ctx.team[rt][0] ?? null;
  } else {
    const deuce = w.receiverDeuce[rt] ?? ctx.team[rt][0] ?? null;
    receiverId = side === 'deuce' ? deuce : (ctx.team[rt].find((p) => p !== deuce) ?? null);
  }
  return {
    server: { id: serverId, team: serverTeam },
    receiver: { id: receiverId, team: rt },
    side,
    slotTeam: serverTeam,
  };
}

function situationFlags(ctx: Ctx, w: Working, serverTeam: Team | null) {
  const flags = {
    breakPointFor: null as Team | null,
    setPointFor: null as Team | null,
    matchPointFor: null as Team | null,
  };
  if (w.winner) return flags;
  const tb = inTiebreak(ctx, w);
  for (const t of ['A', 'B'] as Team[]) {
    const sim = cloneWorking(w);
    applyPoint(ctx, sim, t);
    const wonGame = sim.gamesWonTotal[t] > w.gamesWonTotal[t];
    const wonSet = sim.sets.length > w.sets.length && sim.sets[sim.sets.length - 1]?.winner === t;
    if (sim.winner === t && !flags.matchPointFor) flags.matchPointFor = t;
    else if (wonSet && !flags.setPointFor) flags.setPointFor = t;
    if (!tb && wonGame && serverTeam && t !== serverTeam && !flags.breakPointFor) {
      flags.breakPointFor = t;
    }
  }
  return flags;
}

/**
 * Replay the event log for a match and return its full derived state.
 * Pure: same inputs always give the same output.
 */
export function deriveMatchState(match: ScoringMatch, events: ScoringEvent[]): MatchState {
  const format = normalizeFormat(match.format);
  const ctx: Ctx = { match, format, team: { A: match.teamA, B: match.teamB } };
  const w = emptyWorking();
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  for (const ev of ordered) applyEvent(ctx, w, ev);

  const tb = !w.winner && inTiebreak(ctx, w);
  const matchTb = !w.winner && isMatchTiebreakSet(ctx, w);
  const disp = pointDisplay(ctx, w);
  const serve = serveInfo(ctx, w);
  const flags = situationFlags(ctx, w, serve.server.team);

  const sets: SetScore[] = w.sets.map((s) => ({ ...s }));
  if (!w.winner) {
    sets.push({
      gamesA: w.games.A,
      gamesB: w.games.B,
      ...(tb ? { tiebreakA: w.points.A, tiebreakB: w.points.B } : {}),
      ...(matchTb ? { matchTiebreak: true } : {}),
      winner: null,
      complete: false,
    });
  }

  const needsNextServer =
    !w.winner && match.kind === 'doubles' && w.rotation.length === 4 && serve.server.id === null
      ? { team: serve.server.team as Team }
      : null;

  return {
    format,
    sets,
    setsWon: { A: setsWonBy(w.sets, 'A'), B: setsWonBy(w.sets, 'B') },
    currentSet: w.winner ? w.sets.length : w.sets.length + 1,
    games: { ...w.games },
    points: { ...w.points },
    pointDisplay: disp.display,
    call: w.winner ? null : disp.call,
    inTiebreak: tb,
    isMatchTiebreak: matchTb,
    decidingPoint: !w.winner && disp.deciding,
    server: w.winner ? { id: null, team: null } : serve.server,
    receiver: w.winner ? { id: null, team: null } : serve.receiver,
    side: serve.side,
    needsServeSetup: !w.winner && w.rotation.length === 0,
    needsNextServer,
    changeEnds: !w.winner && w.changeEndsPending,
    ...flags,
    isComplete: w.winner !== null,
    winner: w.winner,
    ignoredSeqs: w.ignored,
    warnings: w.warnings,
    totalPoints: w.totalPoints,
  };
}

/** Compact snapshot to cache on the match row. */
export function summarize(state: MatchState): MatchSummary {
  return {
    sets: state.sets.map((s) => ({
        a: s.gamesA,
        b: s.gamesB,
        ...(s.tiebreakA !== undefined ? { tba: s.tiebreakA } : {}),
        ...(s.tiebreakB !== undefined ? { tbb: s.tiebreakB } : {}),
        ...(s.matchTiebreak ? { mtb: true } : {}),
        done: s.complete,
      })),
    setsWon: { a: state.setsWon.A, b: state.setsWon.B },
    points: state.isComplete ? null : { a: state.pointDisplay.A, b: state.pointDisplay.B },
    inTiebreak: state.inTiebreak,
    server: state.server.team,
  };
}

/** Next sequence number for a log. */
export function nextSeq(events: { seq: number }[]): number {
  return events.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
}
