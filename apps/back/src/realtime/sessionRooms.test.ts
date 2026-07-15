import { describe, expect, it, vi } from 'vitest';
import type { SessionDoc } from '../models/Session';
import type { SessionRoom } from './sessionState';

// Mock the socket server so we can inspect what gets emitted without a real
// Socket.IO instance. `to(room).emit(event, payload)` is the only surface used.
const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  ioValue: null as { to: (room: string) => { emit: (...a: unknown[]) => void } } | null,
}));

vi.mock('./io', () => ({
  getIO: () => mocks.ioValue,
}));

import { broadcastRoomState, broadcastSessionState, roomStatePayload } from './sessionRooms';

function fakeSession(id: string, status: 'active' | 'ended' = 'active'): SessionDoc {
  return {
    _id: id,
    status,
    sourceEncounterId: null,
    round: 1,
    turnIndex: 0,
    combatants: [],
    log: [],
    startedBy: 'user-1',
    endedAt: null,
    createdAt: new Date('2026-07-14T00:00:00Z'),
    updatedAt: new Date('2026-07-14T00:00:00Z'),
  } as unknown as SessionDoc;
}

function fakeRoom(overrides: Partial<SessionRoom> = {}): SessionRoom {
  return {
    state: {
      id: 'room-a',
      round: 1,
      turnIndex: 0,
      combatants: [],
      log: [],
      status: 'active',
    },
    meta: { sourceEncounterId: null, startedAt: new Date('2026-07-14T00:00:00Z') },
    seq: 0,
    dirty: false,
    saveTimer: null,
    ready: Promise.resolve(),
    sockets: new Set<string>(),
    ...overrides,
  };
}

describe('broadcastSessionState', () => {
  it('does not throw and does not emit when getIO() returns null', () => {
    mocks.ioValue = null;
    expect(() => broadcastSessionState(fakeSession('sess-null'))).not.toThrow();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('always emits seq: 0 — no room exists yet at this REST-only codepath', () => {
    mocks.emit = vi.fn();
    mocks.ioValue = { to: () => ({ emit: mocks.emit }) };

    broadcastSessionState(fakeSession('sess-a'));
    broadcastSessionState(fakeSession('sess-a'));
    broadcastSessionState(fakeSession('sess-b'));

    expect(mocks.emit).toHaveBeenCalledTimes(3);
    const seqs = mocks.emit.mock.calls.map((c) => (c[1] as { seq: number }).seq);
    expect(seqs).toEqual([0, 0, 0]);
  });
});

describe('roomStatePayload', () => {
  it('builds the wire payload from held state + meta, using the room\'s own seq', () => {
    const room = fakeRoom({ seq: 7, state: { id: 'sess-x', round: 3, turnIndex: 1, combatants: [], log: [], status: 'active' } });
    const payload = roomStatePayload('sess-x', room);
    expect(payload).toEqual({
      sessionId: 'sess-x',
      seq: 7,
      session: {
        id: 'sess-x',
        status: 'active',
        sourceEncounterId: null,
        round: 3,
        turnIndex: 1,
        combatants: [],
        log: [],
        startedAt: room.meta.startedAt,
        endedAt: null,
      },
    });
  });

  it('sets endedAt when the room state is ended', () => {
    const room = fakeRoom({ state: { id: 'sess-y', round: 1, turnIndex: 0, combatants: [], log: [], status: 'ended' } });
    const payload = roomStatePayload('sess-y', room);
    expect(payload.session.status).toBe('ended');
    expect(payload.session.endedAt).toBeInstanceOf(Date);
  });
});

describe('broadcastRoomState', () => {
  it('emits to the session room using the room\'s own seq', () => {
    mocks.emit = vi.fn();
    mocks.ioValue = { to: () => ({ emit: mocks.emit }) };

    const room = fakeRoom({ seq: 5 });
    broadcastRoomState('sess-z', room);

    expect(mocks.emit).toHaveBeenCalledTimes(1);
    const [event, payload] = mocks.emit.mock.calls[0] as [string, { seq: number }];
    expect(event).toBe('session:state');
    expect(payload.seq).toBe(5);
  });

  it('does not throw and does not emit when getIO() returns null', () => {
    mocks.ioValue = null;
    expect(() => broadcastRoomState('sess-none', fakeRoom())).not.toThrow();
  });
});
