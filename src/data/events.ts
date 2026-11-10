import { useMutation, useMutationState, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { nextSeq, type EventPayload } from '../scoring';
import { db } from '../lib/supabase';
import { keys } from './keys';
import { fetchMatch, syncMatchCache } from './matches';
import type { EventRow, MatchRow } from './types';

export async function fetchEvents(matchId: string): Promise<EventRow[]> {
  const { data, error } = await db()
    .from('match_events')
    .select('*')
    .eq('match_id', matchId)
    .order('seq', { ascending: true });
  if (error) throw error;
  return data as EventRow[];
}

export type EventWrite =
  | { op: 'append'; payload: EventPayload; tempId: string }
  | { op: 'undo' }
  | { op: 'delete'; id: string }
  | { op: 'update'; id: string; payload: EventPayload };

export const CONFLICT_MESSAGE = 'Someone else just scored. Refreshed.';

export class ConflictError extends Error {
  constructor() {
    super(CONFLICT_MESSAGE);
    this.name = 'ConflictError';
  }
}

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';

/** Apply not-yet-confirmed writes on top of the server's log, for instant feedback. */
export function applyOverlay(server: EventRow[], writes: EventWrite[]): EventRow[] {
  let out = [...server];
  for (const w of writes) {
    switch (w.op) {
      case 'append':
        out.push({
          id: w.tempId,
          match_id: out[0]?.match_id ?? '',
          seq: nextSeq(out),
          payload: w.payload,
          created_by: null,
          created_at: new Date().toISOString(),
          pending: true,
        });
        break;
      case 'undo': {
        const last = out.reduce<EventRow | null>((m, e) => (!m || e.seq > m.seq ? e : m), null);
        if (last) out = out.filter((e) => e !== last);
        break;
      }
      case 'delete':
        out = out.filter((e) => e.id !== w.id);
        break;
      case 'update':
        out = out.map((e) => (e.id === w.id ? { ...e, payload: w.payload, pending: true } : e));
        break;
    }
  }
  return out;
}

async function insertEvent(matchId: string, seq: number, payload: EventPayload, createdBy: string) {
  return db().from('match_events').insert({ match_id: matchId, seq, payload, created_by: createdBy });
}

/** Push the latest server log into the cache and refresh the match's cached summary. */
async function refreshAfterWrite(qc: QueryClient, matchId: string) {
  const events = await fetchEvents(matchId);
  qc.setQueryData(keys.events(matchId), events);
  const match = qc.getQueryData<MatchRow | null>(keys.match(matchId)) ?? (await fetchMatch(matchId));
  if (match) {
    const updated = await syncMatchCache(match, events);
    qc.setQueryData(keys.match(matchId), updated);
    if (updated !== match) qc.invalidateQueries({ queryKey: keys.matches });
  }
}

export function useMatchEvents(matchId: string) {
  return useQuery({ queryKey: keys.events(matchId), queryFn: () => fetchEvents(matchId) });
}

/**
 * Read + write access to a match's event log.
 * Writes for one match run one at a time (mutation scope), and pending writes are
 * shown immediately as an overlay on top of the server log.
 */
export function useEventLog(matchId: string, createdBy: string, onConflict?: (msg: string) => void) {
  const qc = useQueryClient();
  const query = useMatchEvents(matchId);

  const mutation = useMutation({
    mutationKey: keys.eventWrites(matchId),
    scope: { id: `events-${matchId}` },
    mutationFn: async (w: EventWrite) => {
      let conflicted = false;
      if (w.op === 'append') {
        const current = qc.getQueryData<EventRow[]>(keys.events(matchId)) ?? (await fetchEvents(matchId));
        let { error } = await insertEvent(matchId, nextSeq(current), w.payload, createdBy);
        if (error && isUniqueViolation(error)) {
          // Someone else wrote this seq first: refetch and retry once.
          conflicted = true;
          const fresh = await fetchEvents(matchId);
          qc.setQueryData(keys.events(matchId), fresh);
          ({ error } = await insertEvent(matchId, nextSeq(fresh), w.payload, createdBy));
          if (error && isUniqueViolation(error)) {
            await refreshAfterWrite(qc, matchId);
            throw new ConflictError();
          }
        }
        if (error) throw error;
      } else if (w.op === 'undo') {
        const { data, error } = await db()
          .from('match_events')
          .select('id')
          .eq('match_id', matchId)
          .order('seq', { ascending: false })
          .limit(1);
        if (error) throw error;
        if (data?.[0]) {
          const del = await db().from('match_events').delete().eq('id', data[0].id);
          if (del.error) throw del.error;
        }
      } else if (w.op === 'delete') {
        const { error } = await db().from('match_events').delete().eq('id', w.id);
        if (error) throw error;
      } else {
        const { error } = await db().from('match_events').update({ payload: w.payload }).eq('id', w.id);
        if (error) throw error;
      }
      await refreshAfterWrite(qc, matchId);
      return { conflicted };
    },
    onSuccess: (r) => {
      if (r.conflicted) onConflict?.(CONFLICT_MESSAGE);
    },
    onError: (e) => {
      onConflict?.(e instanceof ConflictError ? CONFLICT_MESSAGE : `Couldn't save: ${(e as Error).message}`);
    },
  });

  const pending = useMutationState({
    filters: { mutationKey: keys.eventWrites(matchId), status: 'pending' },
    select: (m) => m.state.variables as EventWrite,
  });

  const events = useMemo(
    () => (query.data ? applyOverlay(query.data, pending) : undefined),
    [query.data, pending],
  );

  const { mutate } = mutation;
  const append = useCallback(
    (payload: EventPayload) => mutate({ op: 'append', payload, tempId: `temp-${crypto.randomUUID()}` }),
    [mutate],
  );
  const undo = useCallback(() => mutate({ op: 'undo' }), [mutate]);
  const remove = useCallback((id: string) => mutate({ op: 'delete', id }), [mutate]);
  const update = useCallback((id: string, payload: EventPayload) => mutate({ op: 'update', id, payload }), [mutate]);

  return {
    events,
    isLoading: query.isLoading,
    error: query.error,
    isWriting: pending.length > 0,
    append,
    undo,
    remove,
    update,
  };
}
