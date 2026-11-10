import { useMemo, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { ResultRow } from '../components/MatchCard';
import { PlayerChips } from '../components/PlayerChips';
import { useMatches } from '../data/matches';
import { usePlayerNames, usePlayers } from '../data/players';
import { headToHead } from '../lib/stats';

export function HeadToHeadScreen() {
  const [mode, setMode] = useState<'singles' | 'doubles'>('singles');
  const [side1, setSide1] = useState<string[]>([]);
  const [side2, setSide2] = useState<string[]>([]);
  const { data: players = [] } = usePlayers();
  const { data: matches = [] } = useMatches();
  const nameOf = usePlayerNames();
  const size = mode === 'singles' ? 1 : 2;

  const toggle = (which: 1 | 2) => (id: string) => {
    const [list, set] = which === 1 ? [side1, setSide1] : [side2, setSide2];
    if (list.includes(id)) set(list.filter((p) => p !== id));
    else set([...list, id].slice(-size));
  };

  const ready = side1.length === size && side2.length === size;
  const h2h = useMemo(
    () => (ready ? headToHead(matches.filter((m) => m.kind === mode), side1, side2) : null),
    [ready, matches, mode, side1, side2],
  );
  const label = (ids: string[]) => ids.map((id) => nameOf(id)).join(' & ');

  return (
    <>
      <h1 className="text-3xl">Head to head</h1>
      <div className="segmented mt-4" role="group" aria-label="Match type">
        {(['singles', 'doubles'] as const).map((t) => (
          <button
            key={t}
            aria-pressed={mode === t}
            onClick={() => {
              setMode(t);
              setSide1([]);
              setSide2([]);
            }}
          >
            {t === 'singles' ? 'Players' : 'Pairs'}
          </button>
        ))}
      </div>

      {players.length < size * 2 ? (
        <div className="mt-5">
          <EmptyState title="Not enough players yet.">Add players to compare them.</EmptyState>
        </div>
      ) : (
        <>
          <section className="mt-5">
            <h2 className="text-lg">{mode === 'singles' ? 'Player 1' : 'Pair 1'}</h2>
            <div className="mt-2">
              <PlayerChips players={players} selected={side1} disabled={side2} onToggle={toggle(1)} />
            </div>
          </section>
          <section className="mt-5">
            <h2 className="text-lg">{mode === 'singles' ? 'Player 2' : 'Pair 2'}</h2>
            <div className="mt-2">
              <PlayerChips players={players} selected={side2} disabled={side1} onToggle={toggle(2)} />
            </div>
          </section>
        </>
      )}

      {h2h && (
        <section className="mt-6" aria-live="polite">
          <div className="court-card px-6 py-6">
            <div className="grid grid-cols-2 text-center">
              {[
                [side1, h2h.wins1],
                [side2, h2h.wins2],
              ].map(([ids, wins], i) => (
                <div key={i} className="flex flex-col items-center px-2">
                  <span className={`num text-7xl font-bold leading-none ${(wins as number) > (i === 0 ? h2h.wins2 : h2h.wins1) ? 'text-ball' : ''}`}>
                    {wins as number}
                  </span>
                  <span className="mt-2 line-clamp-2 text-sm font-bold">{label(ids as string[])}</span>
                </div>
              ))}
            </div>
          </div>
          <h2 className="mb-2 mt-6 text-xl">Matches</h2>
          {h2h.matches.length ? (
            <div className="flex flex-col gap-2.5">
              {h2h.matches.map(({ match }) => (
                <ResultRow key={match.id} match={match} nameOf={nameOf} />
              ))}
            </div>
          ) : (
            <EmptyState title="They haven't played yet.">Set up a match and settle it.</EmptyState>
          )}
        </section>
      )}
    </>
  );
}
