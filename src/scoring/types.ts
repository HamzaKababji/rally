// Pure scoring types. No React, no Supabase: this folder must stay framework-free.

export type Team = 'A' | 'B';
export type CourtSide = 'deuce' | 'ad';
export type MatchKind = 'singles' | 'doubles';

export interface MatchFormat {
  /** Number of sets in the match: 1, 3 or 5. */
  bestOf: 1 | 3 | 5;
  /** Games needed to win a set (win by 2, tiebreak at games-all). */
  gamesPerSet: 4 | 6;
  /** true = deuce/advantage; false = no-ad (sudden death at deuce). */
  advantage: boolean;
  /** Points needed to win a normal tiebreak (win by 2). */
  tiebreakPoints: number;
  /** How the deciding set is played. */
  finalSet: 'normal' | 'match_tiebreak';
  /** Points needed to win a match tiebreak (win by 2). */
  matchTiebreakPoints: number;
}

export const DEFAULT_FORMAT: MatchFormat = {
  bestOf: 3,
  gamesPerSet: 6,
  advantage: true,
  tiebreakPoints: 7,
  finalSet: 'normal',
  matchTiebreakPoints: 10,
};

export type PointEvent = { kind: 'point'; winner: Team };
export type GameEvent = { kind: 'game'; winner: Team };
export type SetScoreEvent = {
  kind: 'set_score';
  /** 1-based set number. */
  set: number;
  gamesA: number;
  gamesB: number;
  tiebreakA?: number;
  tiebreakB?: number;
};
export type ServeSetupEvent = {
  kind: 'serve_setup';
  firstServerId: string;
  /** Doubles: the Team A partner who receives in the deuce court for this set. */
  receiverDeuceIdA?: string;
  /** Doubles: the Team B partner who receives in the deuce court for this set. */
  receiverDeuceIdB?: string;
};
export type NextServerEvent = {
  kind: 'next_server';
  /**
   * Doubles: the partner who serves first for the team that did NOT serve first
   * ("B1" in the rotation A1, B1, A2, B2). Named after the spec; it works whichever
   * side of the net that team is listed on.
   */
  teamBServerId: string;
};

export type EventPayload =
  | PointEvent
  | GameEvent
  | SetScoreEvent
  | ServeSetupEvent
  | NextServerEvent;

export type EventKind = EventPayload['kind'];

/** The minimum an event needs for scoring: its order and payload. */
export interface ScoringEvent {
  seq: number;
  payload: EventPayload;
}

/** The minimum a match needs for scoring. */
export interface ScoringMatch {
  kind: MatchKind;
  teamA: string[];
  teamB: string[];
  format?: Partial<MatchFormat> | null;
}

export interface SetScore {
  gamesA: number;
  gamesB: number;
  tiebreakA?: number;
  tiebreakB?: number;
  /** This "set" was a match tiebreak played instead of a full final set. */
  matchTiebreak?: boolean;
  winner: Team | null;
  complete: boolean;
}

export interface MatchState {
  format: MatchFormat;
  /** Completed sets followed by the current set (if the match is still going). */
  sets: SetScore[];
  setsWon: Record<Team, number>;
  /** 1-based number of the set being played (or the last set, once complete). */
  currentSet: number;
  games: Record<Team, number>;
  /** Raw points in the current game or tiebreak. */
  points: Record<Team, number>;
  /** What to print in each team's point cell: 0/15/30/40/Ad, or plain numbers in a tiebreak. */
  pointDisplay: Record<Team, string>;
  /** The umpire-style call: 'Deuce', 'Ad A', 'Ad B', or null. */
  call: 'Deuce' | 'Ad A' | 'Ad B' | null;
  inTiebreak: boolean;
  isMatchTiebreak: boolean;
  /** No-ad deciding point at deuce (receiving team would choose; we default to deuce court). */
  decidingPoint: boolean;
  server: { id: string | null; team: Team | null };
  receiver: { id: string | null; team: Team | null };
  side: CourtSide;
  /** No serve_setup event yet: we don't know who serves. */
  needsServeSetup: boolean;
  /** Doubles: the serving team's first server hasn't been chosen yet. */
  needsNextServer: { team: Team } | null;
  /** Players should change ends before the next point. */
  changeEnds: boolean;
  breakPointFor: Team | null;
  setPointFor: Team | null;
  matchPointFor: Team | null;
  isComplete: boolean;
  winner: Team | null;
  /** seqs of events that had no effect (e.g. points after the match ended). */
  ignoredSeqs: number[];
  warnings: string[];
  totalPoints: number;
}

/** Compact snapshot cached on the match row for lists and the leaderboard. */
export interface MatchSummary {
  sets: { a: number; b: number; tba?: number; tbb?: number; mtb?: boolean; done: boolean }[];
  setsWon: { a: number; b: number };
  points: { a: string; b: string } | null;
  inTiebreak: boolean;
  server: Team | null;
}
