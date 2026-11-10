import { useState } from 'react';
import type { MatchRow } from '../data/types';
import { teamName, type NameOf } from '../lib/names';
import {
  classifySetScore,
  normalizeFormat,
  type MatchState,
  type ServeSetupEvent,
  type SetScoreEvent,
} from '../scoring';
import { PlayerChips } from './PlayerChips';

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex-1">
      <span className="label truncate">{label}</span>
      <input
        className="field num text-center text-2xl font-bold"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 2))}
      />
    </label>
  );
}

/** Enter or correct a whole set's score. */
export function SetScoreForm({
  match,
  state,
  nameOf,
  initial,
  onSubmit,
}: {
  match: MatchRow;
  state: MatchState;
  nameOf: NameOf;
  initial?: SetScoreEvent;
  onSubmit: (e: SetScoreEvent) => void;
}) {
  const maxSet = state.isComplete ? state.sets.length : state.currentSet;
  const [set, setSet] = useState(initial?.set ?? state.currentSet);
  const existing = state.sets[set - 1];
  const [gA, setGA] = useState(String(initial?.gamesA ?? existing?.gamesA ?? ''));
  const [gB, setGB] = useState(String(initial?.gamesB ?? existing?.gamesB ?? ''));
  const [tA, setTA] = useState(initial?.tiebreakA !== undefined ? String(initial.tiebreakA) : '');
  const [tB, setTB] = useState(initial?.tiebreakB !== undefined ? String(initial.tiebreakB) : '');
  const format = normalizeFormat(match.format);
  const isMtb =
    format.finalSet === 'match_tiebreak' && format.bestOf > 1 && set === format.bestOf;
  const g = format.gamesPerSet;
  const needsTb = !isMtb && Math.max(+gA || 0, +gB || 0) === g + 1 && Math.min(+gA || 0, +gB || 0) === g;
  const atTb = !isMtb && +gA === g && +gB === g;
  const showTb = isMtb || needsTb || atTb;

  const ev: SetScoreEvent = {
    kind: 'set_score',
    set,
    gamesA: isMtb ? 0 : Number(gA || 0),
    gamesB: isMtb ? 0 : Number(gB || 0),
    ...(showTb && tA !== '' && tB !== '' ? { tiebreakA: Number(tA), tiebreakB: Number(tB) } : {}),
  };
  const check = classifySetScore(format, ev, isMtb);
  const filled = isMtb ? tA !== '' && tB !== '' : gA !== '' && gB !== '';
  const nameA = teamName(match.team_a, nameOf);
  const nameB = teamName(match.team_b, nameOf);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (filled && check.status !== 'invalid') onSubmit(ev);
      }}
    >
      <div>
        <span className="label">Set</span>
        <div className="segmented" role="group" aria-label="Set number">
          {Array.from({ length: Math.max(1, Math.min(maxSet, format.bestOf)) }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={set === n}
              onClick={() => {
                setSet(n);
                const s = state.sets[n - 1];
                setGA(s ? String(s.gamesA) : '');
                setGB(s ? String(s.gamesB) : '');
                setTA('');
                setTB('');
              }}
            >
              <span className="num">{n}</span>
            </button>
          ))}
        </div>
      </div>
      {!isMtb && (
        <div className="flex gap-3">
          <NumField label={`Games ${nameA}`} value={gA} onChange={setGA} />
          <NumField label={`Games ${nameB}`} value={gB} onChange={setGB} />
        </div>
      )}
      {showTb && (
        <div className="flex gap-3">
          <NumField label={`${isMtb ? 'Match TB' : 'Tiebreak'} ${nameA}`} value={tA} onChange={setTA} />
          <NumField label={`${isMtb ? 'Match TB' : 'Tiebreak'} ${nameB}`} value={tB} onChange={setTB} />
        </div>
      )}
      <p className={`text-sm ${check.status === 'invalid' && filled ? 'font-bold text-red-700' : 'text-muted'}`}>
        {!filled
          ? 'Enter the score.'
          : check.status === 'invalid'
            ? check.reason
            : check.status === 'complete'
              ? `Set ${set} final. Play continues from the next set.`
              : `Set ${set} in progress. Play continues from this score.`}
      </p>
      <button className="btn-primary h-14 text-lg" disabled={!filled || check.status === 'invalid'}>
        Save set score
      </button>
    </form>
  );
}

/** Who serves first (and, in doubles, who receives in the deuce court). */
export function ServeSetupForm({
  match,
  nameOf,
  initial,
  onSubmit,
}: {
  match: MatchRow;
  nameOf: NameOf;
  initial?: Partial<ServeSetupEvent>;
  onSubmit: (e: ServeSetupEvent) => void;
}) {
  const everyone = [...match.team_a, ...match.team_b];
  const [server, setServer] = useState(initial?.firstServerId ?? everyone[0]);
  const [recA, setRecA] = useState(initial?.receiverDeuceIdA ?? match.team_a[0]);
  const [recB, setRecB] = useState(initial?.receiverDeuceIdB ?? match.team_b[0]);
  const asPlayers = (ids: string[]) => ids.map((id) => ({ id, name: nameOf(id), created_at: '' }));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="label">Serving first</span>
        <PlayerChips players={asPlayers(everyone)} selected={[server]} onToggle={setServer} />
      </div>
      {match.kind === 'doubles' && (
        <>
          <div>
            <span className="label">Team A deuce-court receiver</span>
            <PlayerChips players={asPlayers(match.team_a)} selected={[recA]} onToggle={setRecA} />
          </div>
          <div>
            <span className="label">Team B deuce-court receiver</span>
            <PlayerChips players={asPlayers(match.team_b)} selected={[recB]} onToggle={setRecB} />
          </div>
        </>
      )}
      <button
        className="btn-primary h-14 text-lg"
        onClick={() =>
          onSubmit({
            kind: 'serve_setup',
            firstServerId: server,
            ...(match.kind === 'doubles' ? { receiverDeuceIdA: recA, receiverDeuceIdB: recB } : {}),
          })
        }
      >
        Save serve setup
      </button>
    </div>
  );
}
