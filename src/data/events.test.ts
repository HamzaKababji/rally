import { describe, expect, it } from 'vitest';
import { applyOverlay } from './events';
import type { EventRow } from './types';

const ev = (seq: number, id = `e${seq}`): EventRow => ({
  id,
  match_id: 'm',
  seq,
  payload: { kind: 'point', winner: 'A' },
  created_by: null,
  created_at: '',
});

describe('optimistic overlay', () => {
  it('appends pending events after the highest seq', () => {
    const out = applyOverlay([ev(1), ev(2)], [
      { op: 'append', payload: { kind: 'point', winner: 'B' }, tempId: 't1' },
      { op: 'append', payload: { kind: 'point', winner: 'B' }, tempId: 't2' },
    ]);
    expect(out.map((e) => [e.seq, !!e.pending])).toEqual([[1, false], [2, false], [3, true], [4, true]]);
  });
  it('undo removes the latest event, including a pending one', () => {
    const out = applyOverlay([ev(1), ev(2)], [
      { op: 'append', payload: { kind: 'point', winner: 'B' }, tempId: 't1' },
      { op: 'undo' },
      { op: 'undo' },
    ]);
    expect(out.map((e) => e.seq)).toEqual([1]);
  });
  it('deletes and updates by id', () => {
    const out = applyOverlay([ev(1), ev(2), ev(3)], [
      { op: 'delete', id: 'e2' },
      { op: 'update', id: 'e3', payload: { kind: 'game', winner: 'B' } },
    ]);
    expect(out.map((e) => e.payload.kind)).toEqual(['point', 'game']);
  });
});
