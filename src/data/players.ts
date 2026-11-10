import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { db } from '../lib/supabase';
import { keys } from './keys';
import type { Player } from './types';

export async function fetchPlayers(): Promise<Player[]> {
  const { data, error } = await db().from('players').select('*').order('name');
  if (error) throw error;
  return data as Player[];
}

export function usePlayers() {
  return useQuery({ queryKey: keys.players, queryFn: fetchPlayers });
}

/** id → name lookup with a safe fallback. */
export function usePlayerNames() {
  const { data } = usePlayers();
  return useMemo(() => {
    const map = new Map((data ?? []).map((p) => [p.id, p.name]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? 'Unknown') : '—');
  }, [data]);
}

function friendlyNameError(e: unknown): Error {
  const code = (e as { code?: string })?.code;
  if (code === '23505') return new Error('That name is already taken.');
  if (code === '23514') return new Error('Names need 1–40 characters.');
  return e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e));
}

export function useAddPlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await db().from('players').insert({ name: name.trim() }).select().single();
      if (error) throw friendlyNameError(error);
      return data as Player;
    },
    onSuccess: (p) => {
      qc.setQueryData<Player[]>(keys.players, (old) =>
        [...(old ?? []), p].sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
  });
}

export function useRenamePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await db()
        .from('players')
        .update({ name: name.trim() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw friendlyNameError(error);
      return data as Player;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.players }),
  });
}
