import { describe, expect, it } from 'vitest';
import { eventRows } from '../src/events.js';

describe('eventRows', () => {
  it('порядок: тайм, затем минута; компенсированное время первого тайма раньше второго тайма', () => {
    const rows = eventRows([
      { kind: 'yellow', minute: 50, half: 2, teamSourceId: 1, playerSourceId: 10 },
      { kind: 'goal', minute: 47, half: 1, teamSourceId: 1, playerSourceId: 11, assistSourceId: 12 },
      { kind: 'sub', minute: 60, half: 2, teamSourceId: 2, outSourceId: 20, inSourceId: 21 },
      { kind: 'unknown', minute: 70, rawType: 'var' }
    ]);
    expect(rows).toEqual([
      { idx: 0, minute: 47, kind: 'goal', teamSourceId: 1, playerSourceId: 11, otherSourceId: 12 },
      { idx: 1, minute: 50, kind: 'yellow', teamSourceId: 1, playerSourceId: 10, otherSourceId: null },
      { idx: 2, minute: 60, kind: 'sub', teamSourceId: 2, playerSourceId: 21, otherSourceId: 20 }
    ]);
  });
});
