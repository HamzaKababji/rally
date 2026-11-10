import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ServeSetupForm, SetScoreForm } from '../components/EventForms';
import { IconBack } from '../components/Icons';
import { ScoreTable } from '../components/ScoreTable';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { useEventLog } from '../data/events';
import { useIdentity } from '../data/identity';
import { useDeleteMatch, useMatch, useUpdateMatchMeta } from '../data/matches';
import { usePlayerNames } from '../data/players';
import { toScoringMatch, type EventRow, type MatchRow } from '../data/types';
import { formatDate, teamName, teamShort, type NameOf } from '../lib/names';
import { deriveMatchState, describeEvent, formatSet, summarize, type EventPayload, type Team } from '../scoring';

function MetaEditor({ match }: { match: MatchRow }) {
  const update = useUpdateMatchMeta(match.id);
  const toast = useToast();
  const [playedOn, setPlayedOn] = useState(match.played_on);
  const [location, setLocation] = useState(match.location ?? '');
  const [notes, setNotes] = useState(match.notes ?? '');
  const dirty = playedOn !== match.played_on || location !== (match.location ?? '') || notes !== (match.notes ?? '');
  return (
    <section className="panel mt-4 p-4" aria-labelledby="meta-h">
      <h2 id="meta-h" className="text-xl">
        Details
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label>
          <span className="label">Date</span>
          <input type="date" className="field num" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
        </label>
        <label>
          <span className="label">Location</span>
          <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="label">Notes</span>
        <textarea className="field min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {match.created_by && <p className="mt-2 text-xs text-muted">Created by {match.created_by}</p>}
      {dirty && (
        <button
          className="btn-primary mt-3 w-full"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              { played_on: playedOn, location: location.trim() || null, notes: notes.trim() || null },
              { onSuccess: () => toast('Saved.'), onError: (e) => toast(`Couldn't save: ${e.message}`) },
            )
          }
        >
          Save details
        </button>
      )}
    </section>
  );
}

function EventRowView({
  ev,
  ignored,
  label,
  nameOf,
  onEdit,
  onDelete,
}: {
  ev: EventRow;
  ignored: boolean;
  label: (t: Team) => string;
  nameOf: NameOf;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const time = new Date(ev.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return (
    <li className={`flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 ${ev.pending ? 'opacity-50' : ''}`}>
      <span className="num w-8 shrink-0 text-sm text-muted">#{ev.seq}</span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-bold ${ignored ? 'text-muted line-through' : ''}`}>{describeEvent(ev.payload, label, nameOf)}</p>
        <p className="truncate text-xs text-muted">
          {ignored ? 'No effect · ' : ''}
          {ev.created_by ?? 'Someone'} · <span className="num">{time}</span>
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 gap-1">
          <button className="btn-ghost text-muted" onClick={() => setConfirming(false)}>
            Keep
          </button>
          <button
            className="rounded-full bg-red-700 px-3 py-2 text-sm font-bold text-white"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-1">
          <button className="btn-ghost" onClick={onEdit} disabled={ev.pending}>
            Edit
          </button>
          <button className="btn-ghost text-muted" onClick={() => setConfirming(true)} disabled={ev.pending} aria-label={`Delete event ${ev.seq}`}>
            ✕
          </button>
        </div>
      )}
    </li>
  );
}

export function MatchDetailScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { me } = useIdentity();
  const nameOf = usePlayerNames();
  const matchQ = useMatch(id);
  const log = useEventLog(id, me?.name ?? 'Someone', toast);
  const del = useDeleteMatch();
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [addingSet, setAddingSet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const match = matchQ.data;
  const state = useMemo(
    () => (match && log.events ? deriveMatchState(toScoringMatch(match), log.events) : null),
    [match, log.events],
  );

  useEffect(() => {
    if (location.hash === '#log' && state) {
      document.getElementById('log')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, state]);

  if (matchQ.isLoading || log.isLoading) return <p className="py-20 text-center text-muted">Loading match…</p>;
  if (!match || !state || !log.events) {
    return (
      <EmptyState title="Match not found.">
        <p>It may have been deleted.</p>
        <Link to="/" className="btn-primary mt-4">
          Back home
        </Link>
      </EmptyState>
    );
  }

  const full = { A: teamName(match.team_a, nameOf), B: teamName(match.team_b, nameOf) };
  const short = { A: teamShort(match.team_a, nameOf), B: teamShort(match.team_b, nameOf) };
  const summary = summarize(state);
  const ignored = new Set(state.ignoredSeqs);
  const events = [...log.events].sort((a, b) => b.seq - a.seq);

  /** Drop events from the end until the match is no longer complete. */
  const reopen = () => {
    const ordered = [...log.events!].sort((a, b) => a.seq - b.seq);
    const scoring = toScoringMatch(match);
    let n = ordered.length;
    while (n > 0 && deriveMatchState(scoring, ordered.slice(0, n)).isComplete) n--;
    ordered.slice(n).reverse().forEach((e) => log.remove(e.id));
    toast('Match reopened.');
  };

  const saveEdit = (payload: EventPayload) => {
    if (editing) log.update(editing.id, payload);
    setEditing(null);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <Link to="/" className="btn-ghost -ml-3">
          <IconBack /> Home
        </Link>
        <span className={state.isComplete ? 'chip' : 'chip-ball'}>{state.isComplete ? 'Completed' : 'In progress'}</span>
      </div>

      <h1 className="mt-2 text-3xl leading-tight">
        {full.A} <span className="text-muted">vs</span> {full.B}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {match.kind === 'doubles' ? 'Doubles' : 'Singles'} · {formatDate(match.played_on)}
        {match.location ? ` · ${match.location}` : ''}
      </p>

      <div className="card mt-4 overflow-hidden">
        <ScoreTable
          size="lg"
          names={full}
          sets={summary.sets}
          points={state.isComplete ? null : summary.points}
          serverTeam={state.server.team}
          winner={state.winner}
        />
      </div>
      {state.sets.some((s) => s.complete) && (
        <p className="num mt-2 text-center text-sm text-muted">
          {state.sets.filter((s) => s.complete).map(formatSet).join('  ')}
        </p>
      )}

      <div className="mt-4 grid gap-2">
        {state.isComplete ? (
          <button className="btn-secondary" onClick={reopen}>
            Reopen match
          </button>
        ) : (
          <Link to={`/m/${match.id}`} className="btn-primary h-14 text-lg">
            Resume scoring
          </Link>
        )}
      </div>

      {state.warnings.length > 0 && (
        <div className="panel mt-4 border-ink p-3 text-sm">
          <p className="font-bold">Some log entries were skipped:</p>
          <ul className="ml-4 list-disc text-muted">
            {[...new Set(state.warnings)].map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <MetaEditor key={match.updated_at} match={match} />

      <section id="log" className="mt-6 scroll-mt-20" aria-labelledby="log-h">
        <div className="flex items-end justify-between">
          <div>
            <h2 id="log-h" className="text-xl">
              Event log
            </h2>
            <p className="text-sm text-muted">The score is rebuilt from this list. Newest first.</p>
          </div>
          <button className="btn-secondary min-h-[40px] px-3 text-sm" onClick={() => setAddingSet(true)}>
            + Set score
          </button>
        </div>
        {events.length === 0 ? (
          <p className="panel mt-3 p-4 text-center text-muted">No events yet.</p>
        ) : (
          <ul className="panel mt-3 overflow-hidden">
            {events.map((ev) => (
              <EventRowView
                key={ev.id}
                ev={ev}
                ignored={ignored.has(ev.seq)}
                label={(t) => short[t]}
                nameOf={nameOf}
                onEdit={() => setEditing(ev)}
                onDelete={() => log.remove(ev.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-[20px] border-2 border-dashed border-red-700/40 p-4">
        <h2 className="text-lg">Delete match</h2>
        <p className="text-sm text-muted">Removes the match and its whole log for everyone.</p>
        {confirmDelete ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="font-bold text-red-700">Delete this match for good? This can't be undone.</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button
                className="btn border-red-800 bg-red-700 text-white"
                disabled={del.isPending}
                onClick={() =>
                  del.mutate(match.id, {
                    onSuccess: () => {
                      toast('Match deleted.');
                      navigate('/', { replace: true });
                    },
                    onError: (e) => toast(`Couldn't delete: ${e.message}`),
                  })
                }
              >
                Yes, delete
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary mt-3 w-full" onClick={() => setConfirmDelete(true)}>
            Delete match…
          </button>
        )}
      </section>

      <Sheet open={addingSet} onClose={() => setAddingSet(false)} title="Add set score">
        <SetScoreForm
          match={match}
          state={state}
          nameOf={nameOf}
          onSubmit={(e) => {
            log.append(e);
            setAddingSet(false);
          }}
        />
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit #${editing.seq}` : 'Edit'}>
        {editing && (editing.payload.kind === 'point' || editing.payload.kind === 'game') && (
          <div className="grid grid-cols-2 gap-3">
            {(['A', 'B'] as Team[]).map((t) => (
              <button
                key={t}
                className={`btn min-h-[72px] flex-col gap-0 text-lg ${
                  editing.payload.kind !== 'set_score' && 'winner' in editing.payload && editing.payload.winner === t ? 'bg-ball' : 'bg-surface'
                }`}
                onClick={() => saveEdit({ kind: editing.payload.kind as 'point' | 'game', winner: t })}
              >
                <span className="text-sm opacity-70">{editing.payload.kind === 'point' ? 'Point to' : 'Game to'}</span>
                {short[t]}
              </button>
            ))}
          </div>
        )}
        {editing?.payload.kind === 'set_score' && (
          <SetScoreForm match={match} state={state} nameOf={nameOf} initial={editing.payload} onSubmit={saveEdit} />
        )}
        {editing?.payload.kind === 'serve_setup' && (
          <ServeSetupForm match={match} nameOf={nameOf} initial={editing.payload} onSubmit={saveEdit} />
        )}
        {editing?.payload.kind === 'next_server' && (
          <div className="grid grid-cols-2 gap-3">
            {[...match.team_a, ...match.team_b].map((pid) => (
              <button
                key={pid}
                className={`btn h-14 ${editing.payload.kind === 'next_server' && editing.payload.teamBServerId === pid ? 'bg-ball' : 'bg-surface'}`}
                onClick={() => saveEdit({ kind: 'next_server', teamBServerId: pid })}
              >
                {nameOf(pid)}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
