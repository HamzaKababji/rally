import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ServeSetupForm, SetScoreForm } from '../components/EventForms';
import { IconArrowLeft, IconArrowRight, IconBack, IconBolt, IconList, IconPause, IconUndo } from '../components/Icons';
import { ScoreTable } from '../components/ScoreTable';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { useEventLog } from '../data/events';
import { useIdentity } from '../data/identity';
import { useMatch } from '../data/matches';
import { usePlayerNames } from '../data/players';
import { toScoringMatch, type MatchRow } from '../data/types';
import { teamName, teamShort, vibrate, type NameOf } from '../lib/names';
import { deriveMatchState, summarize, type EventPayload, type MatchState, type Team } from '../scoring';

function StatusChips({ state, names }: { state: MatchState; names: Record<Team, string> }) {
  const chips: { key: string; label: string; tone: 'ball' | 'ink' | 'plain' }[] = [];
  if (state.isComplete) chips.push({ key: 'done', label: `${names[state.winner!]} win`, tone: 'ball' });
  if (state.matchPointFor) chips.push({ key: 'mp', label: `Match point · ${names[state.matchPointFor]}`, tone: 'ink' });
  else if (state.setPointFor) chips.push({ key: 'sp', label: `Set point · ${names[state.setPointFor]}`, tone: 'ink' });
  if (state.breakPointFor) chips.push({ key: 'bp', label: 'Break point', tone: 'ball' });
  if (state.inTiebreak) chips.push({ key: 'tb', label: state.isMatchTiebreak ? 'Match tiebreak' : 'Tiebreak', tone: 'plain' });
  if (state.decidingPoint) chips.push({ key: 'dp', label: 'Deciding point', tone: 'plain' });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-live="polite">
      {chips.map((c) => (
        <span key={c.key} className={c.tone === 'ball' ? 'chip-ball' : c.tone === 'ink' ? 'chip-ink' : 'chip'}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

function CourtCard({ state, match, nameOf }: { state: MatchState; match: MatchRow; nameOf: NameOf }) {
  const names = { A: teamShort(match.team_a, nameOf), B: teamShort(match.team_b, nameOf) };
  const call =
    state.call === 'Deuce'
      ? state.decidingPoint
        ? 'Deciding point'
        : 'Deuce'
      : state.call === 'Ad A'
        ? `Ad ${names.A}`
        : state.call === 'Ad B'
          ? `Ad ${names.B}`
          : state.inTiebreak
            ? state.isMatchTiebreak
              ? 'Match tiebreak'
              : 'Tiebreak'
            : `Set ${state.currentSet} · Game ${state.games.A + state.games.B + 1}`;
  const serverName = state.server.id ? nameOf(state.server.id) : state.server.team ? `${names[state.server.team]}` : null;
  const deuce = state.side === 'deuce';
  return (
    <section className="court-card px-6 pb-6 pt-5" aria-label="Current game">
      <p className="text-center text-sm font-bold uppercase tracking-[0.12em] text-white/85">{state.isComplete ? 'Final' : call}</p>
      <div className="mt-1 grid grid-cols-2 items-end">
        {(['A', 'B'] as Team[]).map((t) => (
          <div key={t} className="flex flex-col items-center px-2">
            <span
              className={`num pop leading-none ${state.server.team === t ? 'text-ball' : 'text-white'}`}
              style={{ fontSize: 'clamp(64px, 22vw, 96px)', fontWeight: 700 }}
              key={`${t}-${state.pointDisplay[t]}`}
            >
              {state.isComplete ? state.setsWon[t] : state.pointDisplay[t]}
            </span>
            <span className="mt-1 flex max-w-full items-center gap-1.5 truncate text-sm font-bold text-white/90">
              {state.server.team === t && <span className="ball-dot" />}
              <span className="truncate">{names[t]}</span>
            </span>
          </div>
        ))}
      </div>
      {!state.isComplete && serverName && (
        <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl bg-white/10 px-4 py-3">
          <div className="min-w-0 text-sm">
            <p className="flex items-center gap-2 truncate font-bold">
              <span className="ball-dot" /> {serverName} serves
            </p>
            {state.receiver.id && <p className="truncate text-white/80">to {nameOf(state.receiver.id)}</p>}
          </div>
          <span
            className="flex items-center gap-1.5 rounded-full bg-ball px-3 py-1.5 text-sm font-extrabold text-ink"
            aria-label={`${deuce ? 'Deuce' : 'Ad'} court`}
          >
            {/* Deuce = server's right; ad = server's left. */}
            {deuce ? 'Deuce' : 'Ad'}
            {deuce ? <IconArrowRight width={16} height={16} /> : <IconArrowLeft width={16} height={16} />}
          </span>
        </div>
      )}
    </section>
  );
}

export function LiveScoringScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { me } = useIdentity();
  const nameOf = usePlayerNames();
  const matchQ = useMatch(id);
  const log = useEventLog(id, me?.name ?? 'Someone', toast);
  const [sheet, setSheet] = useState<null | 'quick' | 'set' | 'serve'>(null);

  const match = matchQ.data;
  const state = useMemo(
    () => (match && log.events ? deriveMatchState(toScoringMatch(match), log.events) : null),
    [match, log.events],
  );

  const { append } = log;
  const score = useCallback(
    (payload: EventPayload) => {
      if (!match || !log.events || !state || state.isComplete) return;
      // Peek at what this point does, for haptics.
      const next = deriveMatchState(toScoringMatch(match), [...log.events, { seq: Number.MAX_SAFE_INTEGER, payload }]);
      if (next.isComplete) vibrate([40, 60, 40, 60, 120]);
      else if (next.setsWon.A + next.setsWon.B > state.setsWon.A + state.setsWon.B) vibrate([40, 50, 90]);
      else if (next.games.A + next.games.B !== state.games.A + state.games.B) vibrate([25, 40, 25]);
      else vibrate(15);
      append(payload);
    },
    [match, log.events, state, append],
  );

  if (matchQ.isLoading || log.isLoading) {
    return <p className="py-20 text-center text-muted">Loading match…</p>;
  }
  if (!match || !state) {
    return (
      <main className="mx-auto max-w-app px-safe pt-safe">
        <div className="mt-10">
          <EmptyState title="Match not found.">
            <p>It may have been deleted.</p>
            <Link to="/" className="btn-primary mt-4">
              Back home
            </Link>
          </EmptyState>
        </div>
      </main>
    );
  }

  const full = { A: teamName(match.team_a, nameOf), B: teamName(match.team_b, nameOf) };
  const short = { A: teamShort(match.team_a, nameOf), B: teamShort(match.team_b, nameOf) };
  const summary = summarize(state);
  const canUndo = (log.events?.length ?? 0) > 0;
  const needNext = state.needsNextServer;
  const nextOptions = needNext ? (needNext.team === 'A' ? match.team_a : match.team_b) : [];

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 pt-safe backdrop-blur">
        <div className="mx-auto flex h-14 max-w-app items-center justify-between px-safe">
          <Link to="/" className="btn-ghost -ml-3" aria-label="Back to home (match stays in progress)">
            <IconBack /> Home
          </Link>
          <span className="text-sm font-bold text-muted">
            {match.kind === 'doubles' ? 'Doubles' : 'Singles'} · Best of {state.format.bestOf}
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-app flex-col gap-3 px-safe pb-safe pt-3">
        <div className="card overflow-hidden">
          <ScoreTable
            size="lg"
            names={full}
            sets={summary.sets}
            points={state.isComplete ? null : summary.points}
            serverTeam={state.server.team}
            winner={state.winner}
          />
        </div>

        {state.changeEnds && (
          <div className="pop flex items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-ball px-4 py-3 text-lg font-extrabold" role="status">
            ⇄ Change ends
          </div>
        )}

        <StatusChips state={state} names={short} />

        <CourtCard state={state} match={match} nameOf={nameOf} />

        {needNext && (
          <section className="card p-4" aria-label="Choose server">
            <p className="font-extrabold tracking-tighter">Who serves first for {teamName(nextOptions, nameOf)}?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {nextOptions.map((pid) => (
                <button key={pid} className="btn-secondary h-14 text-lg" onClick={() => append({ kind: 'next_server', teamBServerId: pid })}>
                  {nameOf(pid)}
                </button>
              ))}
            </div>
          </section>
        )}

        {state.needsServeSetup && (
          <section className="card p-4">
            <p className="font-extrabold tracking-tighter">Who's serving?</p>
            <button className="btn-secondary mt-3 w-full" onClick={() => setSheet('serve')}>
              Set up serve
            </button>
          </section>
        )}

        {state.isComplete ? (
          <section className="card flex flex-col gap-3 p-4 text-center">
            <p className="text-2xl font-extrabold tracking-tighter">{full[state.winner!]} won</p>
            <p className="text-sm text-muted">Scoring is closed. Undo or edit the log if something's wrong.</p>
            <Link to={`/m/${match.id}/details`} className="btn-primary h-14 text-lg">
              Match details
            </Link>
          </section>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(['A', 'B'] as Team[]).map((t) => (
              <button
                key={t}
                className="btn-primary min-h-[88px] flex-col gap-0 px-3 py-3 text-xl leading-tight"
                onClick={() => score({ kind: 'point', winner: t })}
              >
                <span className="text-sm font-bold uppercase tracking-[0.1em] opacity-70">Point</span>
                <span className="line-clamp-2 break-words">{short[t]}</span>
              </button>
            ))}
          </div>
        )}

        <nav className="grid grid-cols-4 gap-2" aria-label="Match actions">
          {[
            { label: 'Undo', icon: IconUndo, onClick: () => { vibrate(10); log.undo(); }, disabled: !canUndo },
            { label: 'Quick', icon: IconBolt, onClick: () => setSheet('quick'), disabled: false },
            { label: 'Edit log', icon: IconList, onClick: () => navigate(`/m/${match.id}/details#log`), disabled: false },
            { label: 'Pause', icon: IconPause, onClick: () => navigate('/'), disabled: false },
          ].map(({ label, icon: Icon, onClick, disabled }) => (
            <button
              key={label}
              className="btn-secondary min-h-[64px] flex-col gap-0.5 px-1 text-sm"
              onClick={onClick}
              disabled={disabled}
            >
              <Icon width={20} height={20} />
              {label}
            </button>
          ))}
        </nav>
        {log.isWriting && <p className="text-center text-xs text-muted">Saving…</p>}
        <div className="h-4" />
      </main>

      <Sheet open={sheet === 'quick'} onClose={() => setSheet(null)} title="Quick entry">
        <p className="mb-3 text-sm text-muted">Catching up? Award whole games or type in a set score.</p>
        <div className="grid grid-cols-2 gap-3">
          {(['A', 'B'] as Team[]).map((t) => (
            <button
              key={t}
              className="btn-primary min-h-[72px] flex-col gap-0 text-lg leading-tight"
              disabled={state.isComplete}
              onClick={() => score({ kind: 'game', winner: t })}
            >
              <span className="text-sm opacity-70">Game to</span>
              <span className="line-clamp-2">{short[t]}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button className="btn-secondary h-14" onClick={() => setSheet('set')}>
            Enter set score
          </button>
          <button className="btn-secondary h-14" onClick={() => setSheet('serve')} disabled={state.isComplete}>
            Change server
          </button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'set'} onClose={() => setSheet(null)} title="Enter set score">
        <SetScoreForm
          match={match}
          state={state}
          nameOf={nameOf}
          onSubmit={(e) => {
            append(e);
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet open={sheet === 'serve'} onClose={() => setSheet(null)} title="Serve setup">
        <p className="mb-3 text-sm text-muted">Use this at the start of a set if the serving order changes.</p>
        <ServeSetupForm
          match={match}
          nameOf={nameOf}
          onSubmit={(e) => {
            append(e);
            setSheet(null);
          }}
        />
      </Sheet>
    </>
  );
}
