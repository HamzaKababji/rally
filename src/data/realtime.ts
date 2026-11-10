import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { keys } from './keys';
import type { EventRow, MatchRow } from './types';

/**
 * One app-wide Realtime channel. Changes from other phones invalidate the
 * relevant queries; our own in-flight writes are left alone (they refresh
 * the cache themselves when they finish).
 */
export function useRealtimeSync() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    const refreshEvents = (matchId: string | undefined) => {
      if (matchId) {
        if (qc.isMutating({ mutationKey: keys.eventWrites(matchId) }) > 0) return;
        qc.invalidateQueries({ queryKey: keys.events(matchId) });
      } else {
        // DELETE payloads may only carry the primary key: refresh any open log.
        qc.invalidateQueries({ queryKey: ['events'] });
      }
    };
    const channel = sb
      .channel('rally-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events' }, (msg) => {
        const row = (msg.new && 'match_id' in msg.new ? msg.new : msg.old) as Partial<EventRow>;
        refreshEvents(row?.match_id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (msg) => {
        const row = (msg.new && 'id' in msg.new ? msg.new : msg.old) as Partial<MatchRow>;
        if (row?.id) {
          if (msg.eventType === 'DELETE') qc.removeQueries({ queryKey: keys.match(row.id) });
          else if (qc.isMutating({ mutationKey: keys.eventWrites(row.id) }) === 0) {
            qc.invalidateQueries({ queryKey: keys.match(row.id) });
          }
        }
        qc.invalidateQueries({ queryKey: keys.matches });
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));
    return () => {
      sb.removeChannel(channel);
    };
  }, [qc]);

  return connected;
}
