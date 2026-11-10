import { Link } from 'react-router-dom';
import type { MatchRow } from '../data/types';
import { formatDate, teamName, type NameOf } from '../lib/names';
import { ScoreTable } from './ScoreTable';

export function LiveMatchCard({ match, nameOf }: { match: MatchRow; nameOf: NameOf }) {
  const s = match.summary;
  return (
    <article className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pb-1 pt-3 text-sm">
        <span className="chip-ball">
          <span className="h-2 w-2 rounded-full bg-ink" /> Live
        </span>
        <span className="text-muted">
          {match.kind === 'doubles' ? 'Doubles' : 'Singles'} · {formatDate(match.played_on)}
          {match.location ? ` · ${match.location}` : ''}
        </span>
      </div>
      <ScoreTable
        size="lg"
        names={{ A: teamName(match.team_a, nameOf), B: teamName(match.team_b, nameOf) }}
        sets={s.sets ?? [{ a: 0, b: 0, done: false }]}
        points={s.points ?? { a: '0', b: '0' }}
        serverTeam={s.server ?? null}
      />
      <div className="flex gap-2 border-t-2 border-ink bg-paper/60 p-3">
        <Link to={`/m/${match.id}`} className="btn-primary flex-1 text-lg">
          Resume
        </Link>
        <Link to={`/m/${match.id}/details`} className="btn-secondary">
          Details
        </Link>
      </div>
    </article>
  );
}

export function ResultRow({ match, nameOf }: { match: MatchRow; nameOf: NameOf }) {
  const s = match.summary;
  return (
    <Link to={`/m/${match.id}/details`} className="panel block overflow-hidden transition-colors active:bg-line/40">
      <div className="flex items-center justify-between px-4 pt-2.5 text-xs text-muted">
        <span>
          {match.kind === 'doubles' ? 'Doubles' : 'Singles'} · {formatDate(match.played_on)}
        </span>
        {match.location && <span className="truncate pl-2">{match.location}</span>}
      </div>
      <ScoreTable
        names={{ A: teamName(match.team_a, nameOf), B: teamName(match.team_b, nameOf) }}
        sets={s.sets ?? []}
        winner={match.winner}
      />
    </Link>
  );
}
