import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { IconPlus } from '../components/Icons';
import { LiveMatchCard, ResultRow } from '../components/MatchCard';
import { useMatches } from '../data/matches';
import { usePlayerNames } from '../data/players';

export function HomeScreen() {
  const { data: matches, isLoading, error } = useMatches();
  const nameOf = usePlayerNames();
  const live = matches?.filter((m) => m.status === 'in_progress') ?? [];
  const done = matches?.filter((m) => m.status === 'completed').slice(0, 30) ?? [];

  return (
    <>
      {isLoading && <p className="py-10 text-center text-muted">Loading matches…</p>}
      {error && <p className="font-bold text-red-700">Couldn't load matches: {error.message}</p>}

      {matches && matches.length === 0 && (
        <EmptyState title="No matches yet.">
          <p>Start one to begin your scorebook.</p>
          <Link to="/new" className="btn-primary mt-4">
            New match
          </Link>
        </EmptyState>
      )}

      {live.length > 0 && (
        <section aria-labelledby="live-h" className="mb-8">
          <h2 id="live-h" className="mb-3 text-2xl">
            In progress
          </h2>
          <div className="flex flex-col gap-4">
            {live.map((m) => (
              <LiveMatchCard key={m.id} match={m} nameOf={nameOf} />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-3 text-2xl">
            Recent results
          </h2>
          <div className="flex flex-col gap-2.5">
            {done.map((m) => (
              <ResultRow key={m.id} match={m} nameOf={nameOf} />
            ))}
          </div>
        </section>
      )}

      <Link
        to="/new"
        className="btn-primary fixed z-10 h-14 px-6 text-lg shadow-[0_4px_0_#16233D]"
        style={{
          bottom: 'calc(76px + env(safe-area-inset-bottom))',
          right: 'max(16px, calc((100vw - 480px) / 2 + 16px))',
        }}
      >
        <IconPlus /> New match
      </Link>
    </>
  );
}
