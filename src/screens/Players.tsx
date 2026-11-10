import { useState } from 'react';
import { AddPlayerInline } from '../components/AddPlayerInline';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { useIdentity } from '../data/identity';
import { keys } from '../data/keys';
import { usePlayers, useRenamePlayer } from '../data/players';
import { loadDemoData } from '../data/seed';
import type { Player } from '../data/types';

function PlayerRow({ player, isMe }: { player: Player; isMe: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const rename = useRenamePlayer();
  const { me, setMe } = useIdentity();
  if (editing) {
    return (
      <li className="border-b border-line px-4 py-3 last:border-b-0">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || name.trim() === player.name) return setEditing(false);
            rename.mutate(
              { id: player.id, name },
              {
                onSuccess: (p) => {
                  setEditing(false);
                  if (me?.id === p.id) setMe({ id: p.id, name: p.name });
                },
              },
            );
          }}
        >
          <input className="field flex-1" value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} aria-label="Player name" />
          <button className="btn-primary" disabled={rename.isPending}>
            Save
          </button>
        </form>
        {rename.error && <p className="mt-1 text-sm font-bold text-red-700">{rename.error.message}</p>}
        <button className="btn-ghost mt-1 text-muted" onClick={() => { setEditing(false); setName(player.name); rename.reset(); }}>
          Cancel
        </button>
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between border-b border-line px-4 py-3 last:border-b-0">
      <span className="flex items-center gap-2 text-lg font-bold">
        {player.name}
        {isMe && <span className="chip-ball">You</span>}
      </span>
      <button className="btn-ghost" onClick={() => setEditing(true)}>
        Rename
      </button>
    </li>
  );
}

export function PlayersScreen() {
  const { data: players, isLoading, error } = usePlayers();
  const { me } = useIdentity();
  const toast = useToast();
  const qc = useQueryClient();
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true);
    try {
      await loadDemoData(me?.name ?? null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.players }),
        qc.invalidateQueries({ queryKey: keys.matches }),
      ]);
      toast('Demo data loaded: 4 players and a live doubles match.');
    } catch (e) {
      toast(`Couldn't load demo data: ${(e as Error).message}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <h1 className="text-3xl">Players</h1>
      <div className="mt-4">
        <AddPlayerInline buttonLabel="Add" />
      </div>
      <div className="mt-5">
        {isLoading && <p className="text-center text-muted">Loading…</p>}
        {error && <p className="font-bold text-red-700">Couldn't load players: {error.message}</p>}
        {players && players.length === 0 && (
          <EmptyState title="No players yet.">
            <p>Add your friends above, or try Rally with some sample data.</p>
            <button className="btn-primary mt-4" onClick={seed} disabled={seeding}>
              {seeding ? 'Loading…' : 'Load demo data'}
            </button>
          </EmptyState>
        )}
        {players && players.length > 0 && (
          <ul className="panel overflow-hidden">
            {players.map((p) => (
              <PlayerRow key={p.id} player={p} isMe={me?.id === p.id} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
