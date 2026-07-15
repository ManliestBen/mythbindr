import { describe, expect, it, vi } from 'vitest';
import type { SessionDoc } from '../models/Session';
import type { SessionRoom } from './sessionState';

// Mock the socket server so we can inspect what gets emitted without a real
// Socket.IO instance. `to(room).emit(event, payload)` is the only surface used
// on the main namespace; `of('/share').to(room).emit(...)` is the share fan-out
// added in plan 012 — stub it too so broadcastSessionState's additive share
// emit doesn't need a real `io.of`.
const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  shareEmit: vi.fn(),
  ioValue: null as {
    to: (room: string) => { emit: (...a: unknown[]) => void };
    of: (name: string) => { to: (room: string) => { emit: (...a: unknown[]) => void } };
  } | null,
}));

vi.mock('./io', () => ({
  getIO: () => mocks.ioValue,
}));

import { broadcastRoomState, broadcastSessionState, roomStatePayload } from './sessionRooms';
import type { SharedSessionView } from '@mythbindr/shared';

function fakeSession(id: string, status: 'active' | 'ended' = 'active'): SessionDoc {
  return {
    _id: id,
    campaignId: 'camp-1',
    status,
    sourceEncounterId: null,
    round: 1,
    turnIndex: 0,
    combatants: [
      { cid: 'c1', name: 'Aria', isPlayer: true, currentHp: 10, maxHp: 12, notes: 'secret note' },
    ],
    log: [
      { at: '2026-07-14T00:00:00Z', kind: 'roll', text: 'rolled a 12', by: 'GM' },
      { at: '2026-07-14T00:00:01Z', kind: 'note', text: 'secretly a doppelganger', by: 'GM' },
    ],
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
    meta: {
      sourceEncounterId: null,
      startedAt: new Date('2026-07-14T00:00:00Z'),
      campaignId: 'camp-1',
    },
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
    mocks.ioValue = { to: () => ({ emit: mocks.emit }), of: () => ({ to: () => ({ emit: mocks.shareEmit }) }) };

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
    mocks.ioValue = { to: () => ({ emit: mocks.emit }), of: () => ({ to: () => ({ emit: mocks.shareEmit }) }) };

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

// ── Share fan-out (plan 012, reconciled against the plan 010/011 room API) ──
// Every authenticated broadcast, whichever path produced it, must also emit a
// FILTERED payload to the read-only `share:<campaignId>` room with the same
// seq as the authenticated emit — see docs/design/live-session.md ("Player
// view & share scope"). `broadcastToShareRoom` (shareNamespace.ts) is exercised
// for real here (not mocked) so these assertions cover the actual whitelist
// (`sharedSession()`), not a stand-in.
describe('broadcastSessionState share fan-out', () => {
  it('emits a filtered payload to the share room at the same seq (0) as the authenticated emit', () => {
    mocks.emit = vi.fn();
    mocks.shareEmit = vi.fn();
    mocks.ioValue = { to: () => ({ emit: mocks.emit }), of: () => ({ to: () => ({ emit: mocks.shareEmit }) }) };

    broadcastSessionState(fakeSession('sess-share'));

    expect(mocks.shareEmit).toHaveBeenCalledTimes(1);
    const [event, payload] = mocks.shareEmit.mock.calls[0] as [
      string,
      { seq: number; session: SharedSessionView },
    ];
    expect(event).toBe('session:state');
    expect(payload.seq).toBe(0);
    // Whitelist behavior, not a re-implementation of it: GM-only fields never
    // reach the share room.
    expect(payload.session.log.some((l) => l.kind === 'note')).toBe(false);
    expect(payload.session.combatants[0]).not.toHaveProperty('notes');
  });
});

describe('broadcastRoomState share fan-out', () => {
  it('emits a filtered payload to the share room using the room\'s campaignId and seq', () => {
    mocks.emit = vi.fn();
    mocks.shareEmit = vi.fn();
    mocks.ioValue = { to: () => ({ emit: mocks.emit }), of: () => ({ to: () => ({ emit: mocks.shareEmit }) }) };

    const room = fakeRoom({ seq: 9, meta: { sourceEncounterId: null, startedAt: new Date(), campaignId: 'camp-9' } });
    broadcastRoomState('sess-share-room', room);

    expect(mocks.shareEmit).toHaveBeenCalledTimes(1);
    const [, payload] = mocks.shareEmit.mock.calls[0] as [string, { seq: number }];
    expect(payload.seq).toBe(9);
  });

  it('does not fan out to share when the room has not hydrated a campaignId yet', () => {
    mocks.emit = vi.fn();
    mocks.shareEmit = vi.fn();
    mocks.ioValue = { to: () => ({ emit: mocks.emit }), of: () => ({ to: () => ({ emit: mocks.shareEmit }) }) };

    const room = fakeRoom({ meta: { sourceEncounterId: null, startedAt: new Date(), campaignId: '' } });
    broadcastRoomState('sess-not-hydrated', room);

    expect(mocks.emit).toHaveBeenCalledTimes(1); // authenticated emit still fires
    expect(mocks.shareEmit).not.toHaveBeenCalled();
  });
});
