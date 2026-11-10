import type { EventPayload, MatchFormat, MatchKind, MatchSummary, ScoringMatch, Team } from '../scoring';

export interface Player {
  id: string;
  name: string;
  created_at: string;
}

export interface MatchRow {
  id: string;
  kind: MatchKind;
  team_a: string[];
  team_b: string[];
  format: Partial<MatchFormat>;
  status: 'in_progress' | 'completed';
  winner: Team | null;
  summary: Partial<MatchSummary>;
  played_on: string;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  match_id: string;
  seq: number;
  payload: EventPayload;
  created_by: string | null;
  created_at: string;
  /** Client-only: optimistic event not yet confirmed by the server. */
  pending?: boolean;
}

export const toScoringMatch = (m: Pick<MatchRow, 'kind' | 'team_a' | 'team_b' | 'format'>): ScoringMatch => ({
  kind: m.kind,
  teamA: m.team_a,
  teamB: m.team_b,
  format: m.format,
});
