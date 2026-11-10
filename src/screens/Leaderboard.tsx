import { useMemo, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { useMatches } from '../data/matches';
import { usePlayerNames } from '../data/players';
import type { NameOf } from '../lib/names';
import { doublesIndividualTable, doublesPairTable, singlesTable, winPct, type Record_ } from '../lib/stats';

function Table({ rows, nameOf, label }: { rows: Record_[]; nameOf: NameOf; label: string }) {
  return (
    <div className="panel overflow-hidden">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="border-b-2 border-ink text-xs uppercase tracking-wider text-muted">
            <th className="py-2 pl-4 pr-1 font-bold">#</th>
            <th className="px-1 py-2 font-bold">{label}</th>
            <th className="px-1 py-2 text-right font-bold">W–L</th>
            <th className="px-1 py-2 text-right font-bold">Win</th>
            <th className="px-1 py-2 text-right font-bold">Sets</th>
            <th className="py-2 pl-1 pr-4 text-right font-bold">Games</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className={`border-b border-line last:border-b-0 ${i === 0 ? 'bg-ball/40' : ''}`}>
              <td className="num py-3 pl-4 pr-1 text-sm text-muted">{i + 1}</td>
              <td className="max-w-0 truncate px-1 py-3 font-bold">{r.ids.map((id) => nameOf(id)).join(' & ')}</td>
              <td className="num px-1 py-3 text-right font-bold">
                {r.wins}–{r.losses}
              </td>
              <td className="num px-1 py-3 text-right">{Math.round(winPct(r) * 100)}%</td>
              <td className="num px-1 py-3 text-right text-sm text-muted">
                {r.setsWon}–{r.setsLost}
              </td>
              <td className="num py-3 pl-1 pr-4 text-right text-sm text-muted">
                {r.gamesWon}–{r.gamesLost}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeaderboardScreen() {
  const [tab, setTab] = useState<'singles' | 'doubles'>('singles');
  const { data: matches, isLoading } = useMatches();
  const nameOf = usePlayerNames();
  const tables = useMemo(() => {
    const m = matches ?? [];
    return { singles: singlesTable(m), pairs: doublesPairTable(m), individuals: doublesIndividualTable(m) };
  }, [matches]);

  return (
    <>
      <h1 className="text-3xl">Leaderboard</h1>
      <p className="mt-1 text-sm text-muted">Completed matches only.</p>
      <div className="segmented mt-4" role="tablist" aria-label="Match type">
        {(['singles', 'doubles'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'singles' ? 'Singles' : 'Doubles'}
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-6">
        {isLoading && <p className="text-center text-muted">Loading…</p>}
        {!isLoading && tab === 'singles' && (
          tables.singles.length ? (
            <Table rows={tables.singles} nameOf={nameOf} label="Player" />
          ) : (
            <EmptyState title="No singles results yet.">Finish a singles match and it'll show up here.</EmptyState>
          )
        )}
        {!isLoading && tab === 'doubles' && (
          tables.pairs.length ? (
            <>
              <section>
                <h2 className="mb-2 text-xl">Pairs</h2>
                <Table rows={tables.pairs} nameOf={nameOf} label="Pair" />
              </section>
              <section>
                <h2 className="mb-2 text-xl">Individuals</h2>
                <Table rows={tables.individuals} nameOf={nameOf} label="Player" />
              </section>
            </>
          ) : (
            <EmptyState title="No doubles results yet.">Finish a doubles match and it'll show up here.</EmptyState>
          )
        )}
      </div>
    </>
  );
}
