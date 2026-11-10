import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useIdentity } from '../data/identity';
import { keys } from '../data/keys';
import { usePlayers } from '../data/players';
import { loadDemoData } from '../data/seed';
import { AddPlayerInline } from './AddPlayerInline';

/** Full-screen "Who are you?" picker shown on first open or when switching. */
export function IdentityGate() {
  const { me, setMe, switching, setSwitching } = useIdentity();
  const { data: players, isLoading, error } = usePlayers();
  const qc = useQueryClient();
  const [seeding, setSeeding] = useState<string | null>(null);
  if (me && !switching) return null;
  const seed = async () => {
    setSeeding('Loading…');
    try {
      await loadDemoData(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.players }),
        qc.invalidateQueries({ queryKey: keys.matches }),
      ]);
      setSeeding(null);
    } catch (e) {
      setSeeding(`Couldn't load demo data: ${(e as Error).message}`);
    }
  };
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-paper pt-safe pb-safe" role="dialog" aria-modal="true" aria-labelledby="who-title">
      <div className="mx-auto flex min-h-full max-w-app flex-col px-safe py-8">
        <p className="flex items-center gap-2 text-sm font-bold text-court">
          <span className="ball-dot" /> Rally
        </p>
        <h1 id="who-title" className="mt-3 text-4xl">
          Who are you?
        </h1>
        <p className="mt-2 text-muted">Pick your name so everyone knows who scored what. You can switch any time.</p>
        <div className="mt-6 flex flex-col gap-2">
          {isLoading && <p className="text-muted">Loading players…</p>}
          {error && <p className="font-bold text-red-700">Couldn't load players: {error.message}</p>}
          {players?.map((p) => (
            <button
              key={p.id}
              className={`btn ${me?.id === p.id ? 'bg-ball' : 'bg-surface'} min-h-[56px] justify-start text-lg`}
              onClick={() => {
                setMe({ id: p.id, name: p.name });
                setSwitching(false);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-6">
          <p className="label">{players?.length ? 'Not on the list?' : 'Add yourself to get started'}</p>
          <AddPlayerInline
            buttonLabel="Add me"
            onAdded={(p) => {
              setMe({ id: p.id, name: p.name });
              setSwitching(false);
            }}
          />
        </div>
        {players && players.length === 0 && (
          <div className="panel mt-6 p-4">
            <p className="font-bold">Just trying Rally out?</p>
            <p className="text-sm text-muted">Load 4 sample players and a live doubles match, then pick one of them.</p>
            <button className="btn-secondary mt-3 w-full" onClick={seed} disabled={seeding === 'Loading…'}>
              {seeding === 'Loading…' ? 'Loading…' : 'Load demo data'}
            </button>
            {seeding && seeding !== 'Loading…' && <p className="mt-2 text-sm font-bold text-red-700">{seeding}</p>}
          </div>
        )}
        {me && (
          <button className="btn-ghost mt-6 self-center" onClick={() => setSwitching(false)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
