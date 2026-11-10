import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AddPlayerInline } from '../components/AddPlayerInline';
import { IconBack } from '../components/Icons';
import { PlayerChips } from '../components/PlayerChips';
import { useIdentity } from '../data/identity';
import { useCreateMatch } from '../data/matches';
import { usePlayerNames, usePlayers } from '../data/players';
import type { Player } from '../data/types';
import { todayISO } from '../lib/names';
import { DEFAULT_FORMAT, type EventPayload, type MatchFormat, type MatchKind } from '../scoring';

function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="mt-7">
      <h2 className="text-xl">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function NewMatchScreen() {
  const navigate = useNavigate();
  const { me } = useIdentity();
  const { data: players = [] } = usePlayers();
  const nameOf = usePlayerNames();
  const create = useCreateMatch();

  const [kind, setKind] = useState<MatchKind>('singles');
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [format, setFormat] = useState<MatchFormat>(DEFAULT_FORMAT);
  const [playedOn, setPlayedOn] = useState(todayISO());
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [firstServer, setFirstServer] = useState<string | null>(null);
  const [deuceA, setDeuceA] = useState<string | null>(null);
  const [deuceB, setDeuceB] = useState<string | null>(null);

  const size = kind === 'singles' ? 1 : 2;
  const toggle = (team: 'A' | 'B') => (id: string) => {
    const [list, set] = team === 'A' ? [teamA, setTeamA] : [teamB, setTeamB];
    if (list.includes(id)) set(list.filter((p) => p !== id));
    else set([...list, id].slice(-size));
  };
  const changeKind = (k: MatchKind) => {
    setKind(k);
    const n = k === 'singles' ? 1 : 2;
    setTeamA((t) => t.slice(0, n));
    setTeamB((t) => t.slice(0, n));
  };
  const onAdded = (p: Player) => {
    if (teamA.length < size) setTeamA([...teamA, p.id]);
    else if (teamB.length < size) setTeamB([...teamB, p.id]);
  };

  const ready = teamA.length === size && teamB.length === size;
  const everyone = [...teamA, ...teamB];
  // Sensible defaults that follow the current selection.
  const server = firstServer && everyone.includes(firstServer) ? firstServer : (teamA[0] ?? null);
  const recA = deuceA && teamA.includes(deuceA) ? deuceA : (teamA[0] ?? null);
  const recB = deuceB && teamB.includes(deuceB) ? deuceB : (teamB[0] ?? null);

  const start = () => {
    if (!ready || !server) return;
    const setup: EventPayload = {
      kind: 'serve_setup',
      firstServerId: server,
      ...(kind === 'doubles' && recA ? { receiverDeuceIdA: recA } : {}),
      ...(kind === 'doubles' && recB ? { receiverDeuceIdB: recB } : {}),
    };
    create.mutate(
      {
        kind,
        teamA,
        teamB,
        format,
        playedOn,
        location,
        notes,
        createdBy: me?.name ?? 'Someone',
        initialEvents: [setup],
      },
      { onSuccess: (m) => navigate(`/m/${m.id}`, { replace: true }) },
    );
  };

  const formatSummary = [
    `Best of ${format.bestOf}`,
    `${format.gamesPerSet}-game sets`,
    format.advantage ? 'Ad scoring' : 'No-ad',
    format.finalSet === 'match_tiebreak' && format.bestOf > 1 ? 'Match TB final set' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 pt-safe backdrop-blur">
        <div className="mx-auto flex h-14 max-w-app items-center gap-2 px-safe">
          <Link to="/" className="btn-ghost -ml-3" aria-label="Back">
            <IconBack />
          </Link>
          <h1 className="text-2xl">New match</h1>
        </div>
      </header>
      <main className="mx-auto max-w-app px-safe pb-40 pt-4">
        <Segmented
          label="Match type"
          value={kind}
          onChange={changeKind}
          options={[
            { value: 'singles', label: 'Singles' },
            { value: 'doubles', label: 'Doubles' },
          ]}
        />

        <Section title="Team A" hint={`Pick ${size === 1 ? 'one player' : 'two players'}`}>
          {players.length ? (
            <PlayerChips players={players} selected={teamA} disabled={teamB} onToggle={toggle('A')} />
          ) : (
            <p className="text-sm text-muted">No players yet. Add some below.</p>
          )}
        </Section>
        <Section title="Team B" hint={`Pick ${size === 1 ? 'one player' : 'two players'}`}>
          {players.length > 0 && <PlayerChips players={players} selected={teamB} disabled={teamA} onToggle={toggle('B')} />}
        </Section>
        <div className="mt-4">
          <AddPlayerInline onAdded={onAdded} buttonLabel="Add player" />
        </div>

        <details className="panel mt-7 p-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between">
            <span>
              <span className="block text-xl font-extrabold tracking-tighter">Rules</span>
              <span className="text-sm text-muted">{formatSummary}</span>
            </span>
            <span className="chip">Edit</span>
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <span className="label">Sets</span>
              <Segmented
                label="Best of"
                value={format.bestOf}
                onChange={(v) => setFormat({ ...format, bestOf: v })}
                options={[1, 3, 5].map((n) => ({ value: n as 1 | 3 | 5, label: `Best of ${n}` }))}
              />
            </div>
            <div>
              <span className="label">Games per set</span>
              <Segmented
                label="Games per set"
                value={format.gamesPerSet}
                onChange={(v) => setFormat({ ...format, gamesPerSet: v })}
                options={[
                  { value: 6 as const, label: '6 games' },
                  { value: 4 as const, label: '4 games' },
                ]}
              />
            </div>
            <div>
              <span className="label">At deuce</span>
              <Segmented
                label="Deuce scoring"
                value={format.advantage}
                onChange={(v) => setFormat({ ...format, advantage: v })}
                options={[
                  { value: true, label: 'Advantage' },
                  { value: false, label: 'No-ad' },
                ]}
              />
            </div>
            {format.bestOf > 1 && (
              <div>
                <span className="label">Final set</span>
                <Segmented
                  label="Final set"
                  value={format.finalSet}
                  onChange={(v) => setFormat({ ...format, finalSet: v })}
                  options={[
                    { value: 'normal' as const, label: 'Full set' },
                    { value: 'match_tiebreak' as const, label: '10-pt tiebreak' },
                  ]}
                />
              </div>
            )}
            <p className="text-sm text-muted">
              Tiebreak to {format.tiebreakPoints} at {format.gamesPerSet}–{format.gamesPerSet}, win by 2.
            </p>
          </div>
        </details>

        <Section title="When & where">
          <div className="grid gap-3">
            <label>
              <span className="label">Date</span>
              <input type="date" className="field num" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
            </label>
            <label>
              <span className="label">Location</span>
              <input className="field" placeholder="Court 3" value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="label">Notes</span>
            <textarea className="field min-h-[80px]" placeholder="Windy, new balls…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </Section>

        {ready && (
          <Section title="Serve" hint="Who serves the first game?">
            <PlayerChips
              players={everyone.map((id) => ({ id, name: nameOf(id), created_at: '' }))}
              selected={server ? [server] : []}
              onToggle={setFirstServer}
            />
            {kind === 'doubles' && (
              <div className="mt-5 grid gap-4">
                {(
                  [
                    ['A', teamA, recA, setDeuceA],
                    ['B', teamB, recB, setDeuceB],
                  ] as const
                ).map(([t, team, rec, set]) => (
                  <div key={t}>
                    <span className="label">Team {t}: who receives in the deuce (right) court?</span>
                    <PlayerChips
                      players={team.map((id) => ({ id, name: nameOf(id), created_at: '' }))}
                      selected={rec ? [rec] : []}
                      onToggle={set}
                    />
                  </div>
                ))}
                <p className="text-sm text-muted">
                  The other team picks their first server when their first service game comes up.
                </p>
              </div>
            )}
          </Section>
        )}

        {create.error && <p className="mt-4 font-bold text-red-700">Couldn't create the match: {create.error.message}</p>}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-surface pb-safe">
        <div className="mx-auto max-w-app px-safe py-3">
          <button className="btn-primary h-16 w-full text-xl" disabled={!ready || !server || create.isPending} onClick={start}>
            {create.isPending ? 'Starting…' : ready ? 'Start match' : `Pick ${size === 1 ? '2 players' : '4 players'}`}
          </button>
        </div>
      </div>
    </>
  );
}
