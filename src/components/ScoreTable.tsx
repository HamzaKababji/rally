import type { MatchSummary, Team } from '../scoring';

type SetCell = MatchSummary['sets'][number];

/**
 * Team rows × set columns, with the current game points in a ball-yellow column.
 */
export function ScoreTable({
  names,
  sets,
  points,
  serverTeam,
  winner,
  size = 'md',
}: {
  names: Record<Team, string>;
  sets: SetCell[];
  points?: { a: string; b: string } | null;
  serverTeam?: Team | null;
  winner?: Team | null;
  size?: 'md' | 'lg';
}) {
  const big = size === 'lg';
  const row = (t: Team) => {
    const isWinner = winner === t;
    return (
      <tr key={t} className={t === 'A' ? 'border-b border-line' : ''}>
        <th scope="row" className={`py-2.5 pl-4 pr-2 text-left ${big ? 'text-lg' : 'text-base'} font-bold`}>
          <span className="flex min-w-0 items-center gap-2">
            <span className={`truncate ${isWinner ? 'font-extrabold' : ''}`}>{names[t]}</span>
            {serverTeam === t && <span className="ball-dot" aria-label="serving" />}
            {isWinner && <span className="text-court" aria-label="winner">✓</span>}
          </span>
        </th>
        {sets.map((s, i) => {
          const mine = t === 'A' ? s.a : s.b;
          const theirs = t === 'A' ? s.b : s.a;
          const tb = t === 'A' ? s.tba : s.tbb;
          const tbOther = t === 'A' ? s.tbb : s.tba;
          const wonSet = s.done && (s.mtb ? (tb ?? mine) > (tbOther ?? theirs) : mine > theirs);
          const value = s.mtb && tb !== undefined ? tb : mine;
          const showTbSup = !s.mtb && s.done && tb !== undefined && tbOther !== undefined && !wonSet;
          return (
            <td
              key={i}
              className={`num w-9 px-1 text-center ${big ? 'text-xl' : 'text-lg'} ${
                wonSet ? 'font-bold text-ink' : s.done ? 'font-medium text-muted' : 'font-bold text-ink'
              }`}
            >
              {value}
              {showTbSup && <sup className="ml-0.5 text-[0.6em] font-medium">{tb}</sup>}
            </td>
          );
        })}
        {points && (
          <td className={`num w-14 bg-ball px-2 text-center ${big ? 'text-xl' : 'text-lg'} font-bold`}>
            {t === 'A' ? points.a : points.b}
          </td>
        )}
      </tr>
    );
  };
  return (
    <table className="w-full table-fixed border-collapse overflow-hidden">
      <colgroup>
        <col />
        {sets.map((_, i) => (
          <col key={i} className="w-9" />
        ))}
        {points && <col className="w-14" />}
      </colgroup>
      <thead className="sr-only">
        <tr>
          <th>Team</th>
          {sets.map((_, i) => (
            <th key={i}>Set {i + 1}</th>
          ))}
          {points && <th>Points</th>}
        </tr>
      </thead>
      <tbody>{(['A', 'B'] as Team[]).map(row)}</tbody>
    </table>
  );
}
