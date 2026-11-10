import type { Team } from '../scoring';
import type { MatchRow } from '../data/types';

export interface Record_ {
  key: string;
  ids: string[];
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
}

export const winPct = (r: Pick<Record_, 'wins' | 'losses'>) =>
  r.wins + r.losses === 0 ? 0 : r.wins / (r.wins + r.losses);

/** Unordered pair key: the same two players give the same key either way round. */
export const pairKey = (ids: string[]) => [...ids].sort().join('+');

type Row = Pick<MatchRow, 'kind' | 'team_a' | 'team_b' | 'status' | 'winner' | 'summary'>;

function totals(m: Row) {
  const sets = m.summary?.sets ?? [];
  let gA = 0;
  let gB = 0;
  for (const s of sets) {
    gA += s.a;
    gB += s.b;
  }
  return {
    setsA: m.summary?.setsWon?.a ?? 0,
    setsB: m.summary?.setsWon?.b ?? 0,
    gamesA: gA,
    gamesB: gB,
  };
}

function bump(map: Map<string, Record_>, key: string, ids: string[], m: Row, side: Team) {
  const r =
    map.get(key) ??
    ({ key, ids, wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 } as Record_);
  const t = totals(m);
  if (m.winner === side) r.wins++;
  else r.losses++;
  r.setsWon += side === 'A' ? t.setsA : t.setsB;
  r.setsLost += side === 'A' ? t.setsB : t.setsA;
  r.gamesWon += side === 'A' ? t.gamesA : t.gamesB;
  r.gamesLost += side === 'A' ? t.gamesB : t.gamesA;
  map.set(key, r);
}

const rank = (a: Record_, b: Record_) =>
  winPct(b) - winPct(a) ||
  b.wins - a.wins ||
  b.setsWon - b.setsLost - (a.setsWon - a.setsLost) ||
  b.gamesWon - b.gamesLost - (a.gamesWon - a.gamesLost);

const counted = (m: Row) => m.status === 'completed' && (m.winner === 'A' || m.winner === 'B');

export function singlesTable(matches: Row[]): Record_[] {
  const map = new Map<string, Record_>();
  for (const m of matches) {
    if (m.kind !== 'singles' || !counted(m)) continue;
    bump(map, m.team_a[0], [m.team_a[0]], m, 'A');
    bump(map, m.team_b[0], [m.team_b[0]], m, 'B');
  }
  return [...map.values()].sort(rank);
}

export function doublesPairTable(matches: Row[]): Record_[] {
  const map = new Map<string, Record_>();
  for (const m of matches) {
    if (m.kind !== 'doubles' || !counted(m)) continue;
    bump(map, pairKey(m.team_a), [...m.team_a].sort(), m, 'A');
    bump(map, pairKey(m.team_b), [...m.team_b].sort(), m, 'B');
  }
  return [...map.values()].sort(rank);
}

export function doublesIndividualTable(matches: Row[]): Record_[] {
  const map = new Map<string, Record_>();
  for (const m of matches) {
    if (m.kind !== 'doubles' || !counted(m)) continue;
    for (const id of m.team_a) bump(map, id, [id], m, 'A');
    for (const id of m.team_b) bump(map, id, [id], m, 'B');
  }
  return [...map.values()].sort(rank);
}

const sameSide = (team: string[], side: string[]) =>
  team.length === side.length && pairKey(team) === pairKey(side);

export interface HeadToHead<M> {
  matches: { match: M; firstIs: Team }[];
  wins1: number;
  wins2: number;
}

/** Matches where side1 played side2 (either way round). Only completed ones count toward the record. */
export function headToHead<M extends Row>(all: M[], side1: string[], side2: string[]): HeadToHead<M> {
  const out: HeadToHead<M> = { matches: [], wins1: 0, wins2: 0 };
  if (!side1.length || !side2.length) return out;
  for (const m of all) {
    let firstIs: Team | null = null;
    if (sameSide(m.team_a, side1) && sameSide(m.team_b, side2)) firstIs = 'A';
    else if (sameSide(m.team_b, side1) && sameSide(m.team_a, side2)) firstIs = 'B';
    if (!firstIs) continue;
    out.matches.push({ match: m, firstIs });
    if (counted(m)) {
      if (m.winner === firstIs) out.wins1++;
      else out.wins2++;
    }
  }
  return out;
}
