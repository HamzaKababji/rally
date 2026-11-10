import { useState } from 'react';
import { useAddPlayer } from '../data/players';
import type { Player } from '../data/types';

export function AddPlayerInline({
  onAdded,
  autoFocus,
  buttonLabel = 'Add',
}: {
  onAdded?: (p: Player) => void;
  autoFocus?: boolean;
  buttonLabel?: string;
}) {
  const [name, setName] = useState('');
  const add = useAddPlayer();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    add.mutate(name, {
      onSuccess: (p) => {
        setName('');
        onAdded?.(p);
      },
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          className="field flex-1"
          placeholder="New player name"
          value={name}
          maxLength={40}
          autoFocus={autoFocus}
          autoCapitalize="words"
          onChange={(e) => {
            setName(e.target.value);
            if (add.error) add.reset();
          }}
          aria-label="New player name"
        />
        <button className="btn-secondary" disabled={!name.trim() || add.isPending}>
          {add.isPending ? 'Adding…' : buttonLabel}
        </button>
      </div>
      {add.error && <p className="text-sm font-bold text-red-700">{add.error.message}</p>}
    </form>
  );
}
