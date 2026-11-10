import type { EventPayload } from '../scoring';
import { DEFAULT_FORMAT } from '../scoring';
import { db } from '../lib/supabase';
import { createMatch } from './matches';
import type { Player } from './types';

const DEMO_NAMES = ['Alex', 'Sam', 'Jordan', 'Riley'];

/** Four sample players and one in-progress doubles match. */
export async function loadDemoData(createdBy: string | null): Promise<Player[]> {
  const { data, error } = await db()
    .from('players')
    .insert(DEMO_NAMES.map((name) => ({ name })))
    .select();
  if (error) throw error;
  const players = data as Player[];
  const id = (n: string) => players.find((p) => p.name === n)!.id;
  const [a1, a2, b1, b2] = DEMO_NAMES.map(id);
  const p = (w: 'A' | 'B', n = 1): EventPayload[] => Array.from({ length: n }, () => ({ kind: 'point', winner: w }));
  const events: EventPayload[] = [
    { kind: 'serve_setup', firstServerId: a1, receiverDeuceIdA: a2, receiverDeuceIdB: b1 },
    ...p('A', 4), // a1 holds
    { kind: 'next_server', teamBServerId: b2 },
    ...p('B', 3), ...p('A', 1), ...p('B', 1), // b2 holds
    { kind: 'game', winner: 'A' }, // a2 holds (quick entry)
    ...p('A', 2), ...p('B', 3), // 30–40 on b1's serve
  ];
  await createMatch({
    kind: 'doubles',
    teamA: [a1, a2],
    teamB: [b1, b2],
    format: DEFAULT_FORMAT,
    playedOn: new Date().toISOString().slice(0, 10),
    location: 'Park courts',
    notes: 'Demo match',
    createdBy: createdBy ?? 'Demo',
    initialEvents: events,
  });
  return players;
}
