import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionDoc } from '../models/Session';

// Mock only the DB access `joinSessionRoom`/`saveRoom` use; keep the real
// `publicSession` so hydration goes through the same mapping the REST layer
// uses. The load result resolves via setTimeout so two concurrent joins on
// the same not-yet-live session genuinely race the check-then-act window —
// same pattern as yElement.test.ts.
const mocks = vi.hoisted(() => ({
  loadResult: null as unknown,
  findByIdAndUpdate: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../models/Session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../models/Session')>();
  return {
    ...actual,
    GameSession: {
      findById: vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mocks.loadResult), 0);
          }),
      ),
      findByIdAndUpdate: mocks.findByIdAndUpdate,
    },
  };
});

import { OpError } from '@mythbindr/shared';
import {
  applySessionOp,
  getLiveRoom,
  joinSessionRoom,
  leaveSessionRoom,
} from './sessionState';

function fakeSessionDoc(id: string, overrides: Partial<SessionDoc> = {}): SessionDoc {
  return {
    _id: id,
    status: 'active',
    sourceEncounterId: null,
    round: 1,
    turnIndex: 0,
    combatants: [
      {
        cid: 'c1',
        name: 'Aria',
        initiative: 15,
        maxHp: 20,
        currentHp: 20,
        tempHp: 0,
        conditions: [],
        deathSaves: { successes: 0, failures: 0 },
        isPlayer: true,
        sourceElementId: null,
        notes: '',
      },
    ],
    log: [],
    startedBy: 'user-1',
    endedAt: null,
    createdAt: new Date('2026-07-14T00:00:00Z'),
    updatedAt: new Date('2026-07-14T00:00:00Z'),
    ...overrides,
  } as unknown as SessionDoc;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('joinSessionRoom', () => {
  it('lets two concurrent joins on the same not-yet-live session race safely, both seeing the same hydrated state', async () => {
    mocks.loadResult = fakeSessionDoc('race-sess-1');

    const [a, b] = await Promise.all([
      joinSessionRoom('race-sess-1', 'sockA'),
      joinSessionRoom('race-sess-1', 'sockB'),
    ]);

    expect(a).toEqual(b);
    expect(a.combatants).toHaveLength(1);
    expect(a.combatants[0].cid).toBe('c1');

    const room = getLiveRoom('race-sess-1');
    expect(room?.sockets.size).toBe(2);
  });
});

describe('applySessionOp', () => {
  it('increments seq and marks the room dirty', async () => {
    mocks.loadResult = fakeSessionDoc('sess-op-1');
    await joinSessionRoom('sess-op-1', 'sockA');

    const before = getLiveRoom('sess-op-1')!;
    expect(before.seq).toBe(0);

    applySessionOp('sess-op-1', { kind: 'nextTurn' });

    const after = getLiveRoom('sess-op-1')!;
    expect(after.seq).toBe(1);
    expect(after.dirty).toBe(true);
  });

  it('debounces the save: two rapid ops fire exactly one persisted write', async () => {
    vi.useFakeTimers();
    mocks.loadResult = fakeSessionDoc('sess-op-2');
    mocks.findByIdAndUpdate.mockClear();

    const join = joinSessionRoom('sess-op-2', 'sockA');
    await vi.advanceTimersByTimeAsync(0); // let the mocked DB load resolve
    await join;

    applySessionOp('sess-op-2', { kind: 'nextTurn' });
    applySessionOp('sess-op-2', { kind: 'nextTurn' });

    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled(); // still within the debounce window
    await vi.advanceTimersByTimeAsync(2100); // past SAVE_DEBOUNCE_MS
    expect(mocks.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('an op on an ended session throws OpError and does not change seq', async () => {
    mocks.loadResult = fakeSessionDoc('sess-op-3', { status: 'ended' });
    await joinSessionRoom('sess-op-3', 'sockA');

    const before = getLiveRoom('sess-op-3')!;
    expect(before.seq).toBe(0);

    expect(() => applySessionOp('sess-op-3', { kind: 'nextTurn' })).toThrow(OpError);

    const after = getLiveRoom('sess-op-3')!;
    expect(after.seq).toBe(0);
    expect(after.dirty).toBe(false);
  });
});

describe('leaveSessionRoom', () => {
  it('flushes the pending save and deletes the room once the last socket leaves', async () => {
    vi.useFakeTimers();
    mocks.loadResult = fakeSessionDoc('sess-leave-1');
    mocks.findByIdAndUpdate.mockClear();

    const join = joinSessionRoom('sess-leave-1', 'sockA');
    await vi.advanceTimersByTimeAsync(0);
    await join;

    applySessionOp('sess-leave-1', { kind: 'nextTurn' });
    expect(getLiveRoom('sess-leave-1')).toBeDefined();

    leaveSessionRoom('sess-leave-1', 'sockA');
    await vi.advanceTimersByTimeAsync(0); // let the flush save's async work settle

    expect(mocks.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(getLiveRoom('sess-leave-1')).toBeUndefined();
  });
});
