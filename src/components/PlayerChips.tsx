import type { Player } from '../data/types';

/** Tap-to-toggle chips for picking players. */
export function PlayerChips({
  players,
  selected,
  disabled = [],
  onToggle,
}: {
  players: Player[];
  selected: string[];
  disabled?: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {players.map((p) => {
        const on = selected.includes(p.id);
        const off = !on && disabled.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            disabled={off}
            onClick={() => onToggle(p.id)}
            className={`min-h-[44px] rounded-full border-2 px-4 text-base font-bold transition-colors ${
              on ? 'border-ink bg-ink text-white' : 'border-ink bg-surface text-ink'
            } ${off ? 'opacity-30' : ''}`}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
