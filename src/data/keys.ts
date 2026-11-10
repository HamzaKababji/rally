export const keys = {
  players: ['players'] as const,
  matches: ['matches'] as const,
  match: (id: string) => ['match', id] as const,
  events: (id: string) => ['events', id] as const,
  eventWrites: (id: string) => ['event-writes', id] as const,
};
