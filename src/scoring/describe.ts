import type { EventPayload, SetScore, Team } from './types';

/** Human-readable one-liner for an event in the log. `name` maps a player id to a display name. */
export function describeEvent(
  p: EventPayload,
  teamLabel: (t: Team) => string,
  name: (id: string) => string,
): string {
  switch (p.kind) {
    case 'point':
      return `Point to ${teamLabel(p.winner)}`;
    case 'game':
      return `Game to ${teamLabel(p.winner)}`;
    case 'set_score': {
      const tb =
        p.tiebreakA !== undefined && p.tiebreakB !== undefined
          ? ` (${p.tiebreakA}–${p.tiebreakB})`
          : '';
      return `Set ${p.set} entered as ${p.gamesA}–${p.gamesB}${tb}`;
    }
    case 'serve_setup':
      return `${name(p.firstServerId)} serves first`;
    case 'next_server':
      return `${name(p.teamBServerId)} serves for their team`;
    default:
      return 'Unknown event';
  }
}

/** "6–4", "7–6(5)", "[10–8]" */
export function formatSet(s: Pick<SetScore, 'gamesA' | 'gamesB' | 'tiebreakA' | 'tiebreakB' | 'matchTiebreak'>): string {
  if (s.matchTiebreak) {
    return `[${s.tiebreakA ?? s.gamesA}–${s.tiebreakB ?? s.gamesB}]`;
  }
  const base = `${s.gamesA}–${s.gamesB}`;
  if (s.tiebreakA !== undefined && s.tiebreakB !== undefined && s.gamesA !== s.gamesB) {
    return `${base}(${Math.min(s.tiebreakA, s.tiebreakB)})`;
  }
  return base;
}
