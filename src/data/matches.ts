import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deriveMatchState, summarize, type EventPayload, type MatchFormat, type MatchKind } from '../scoring';
import { db } from '../lib/supabase';
import { keys } from './keys';
import { toScoringMatch, type EventRow, type MatchRow } from './types';

export async function fetchMatches(): Promise<MatchRow[]> {
  const { data, error } = await db()
    .from('matches')
    .select('*')
    .order('played_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as MatchRow[];
}

export async function fetchMatch(id: string): Promise<MatchRow | null> {
  const { data, error } = await db().from('matches').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as MatchRow | null;
}

export function useMatches() {
  return useQuery({ queryKey: keys.matches, queryFn: fetchMatches });
}

export function useMatch(id: string) {
  return useQuery({ queryKey: keys.match(id), queryFn: () => fetchMatch(id) });
}

/**
 * Re-derive the state from a log and cache status/winner/summary on the match row,
 * but only if something changed. The log stays the source of truth.
 */
export async function syncMatchCache(match: MatchRow, events: EventRow[]): Promise<MatchRow> {
  const state = deriveMatchState(toScoringMatch(match), events);
  const patch = {
    status: state.isComplete ? ('completed' as const) : ('in_progress' as const),
    winner: state.winner,
    summary: summarize(state),
  };
  const same =
    match.status === patch.status &&
    match.winner === patch.winner &&
    JSON.stringify(match.summary) === JSON.stringify(patch.summary);
  if (same) return match;
  const { data, error } = await db().from('matches').update(patch).eq('id', match.id).select().single();
  if (error) throw error;
  return data as MatchRow;
}

export interface NewMatchInput {
  kind: MatchKind;
  teamA: string[];
  teamB: string[];
  format: MatchFormat;
  playedOn: string;
  location: string;
  notes: string;
  createdBy: string;
  /** Initial events, e.g. serve_setup. */
  initialEvents: EventPayload[];
}

export async function createMatch(input: NewMatchInput): Promise<MatchRow> {
  const { data, error } = await db()
    .from('matches')
    .insert({
      kind: input.kind,
      team_a: input.teamA,
      team_b: input.teamB,
      format: input.format,
      played_on: input.playedOn,
      location: input.location.trim() || null,
      notes: input.notes.trim() || null,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  const match = data as MatchRow;
  if (input.initialEvents.length) {
    const rows = input.initialEvents.map((payload, i) => ({
      match_id: match.id,
      seq: i + 1,
      payload,
      created_by: input.createdBy,
    }));
    const { data: evs, error: evErr } = await db().from('match_events').insert(rows).select();
    if (evErr) throw evErr;
    return syncMatchCache(match, evs as EventRow[]);
  }
  return syncMatchCache(match, []);
}

export function useCreateMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMatch,
    onSuccess: (m) => {
      qc.setQueryData(keys.match(m.id), m);
      qc.invalidateQueries({ queryKey: keys.matches });
    },
  });
}

export function useUpdateMatchMeta(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<MatchRow, 'played_on' | 'location' | 'notes'>>) => {
      const { data, error } = await db().from('matches').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data as MatchRow;
    },
    onSuccess: (m) => {
      qc.setQueryData(keys.match(id), m);
      qc.invalidateQueries({ queryKey: keys.matches });
    },
  });
}

export function useDeleteMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('matches').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.removeQueries({ queryKey: keys.match(id) });
      qc.removeQueries({ queryKey: keys.events(id) });
      qc.setQueryData<MatchRow[]>(keys.matches, (old) => old?.filter((m) => m.id !== id));
    },
  });
}
