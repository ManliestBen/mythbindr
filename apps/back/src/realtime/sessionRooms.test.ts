import { describe, expect, it, vi } from 'vitest';
import type { SessionDoc } from '../models/Session';

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

import { broadcastSessionState, currentSeq } from './sessionRooms';

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

describe('broadcastSessionState', () => {
  it('does not throw and does not emit when getIO() returns null', () => {
    mocks.ioValue = null;
    expect(() => broadcastSessionState(fakeSession('sess-null'))).not.toThrow();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('increments seq per session and starts a different session at 1', () => {
    mocks.emit = vi.fn();
    mocks.ioValue = { to: () => ({ emit: mocks.emit }), of: () => ({ to: () => ({ emit: mocks.shareEmit }) }) };

    broadcastSessionState(fakeSession('sess-a'));
    broadcastSessionState(fakeSession('sess-a'));
    broadcastSessionState(fakeSession('sess-b'));

    expect(mocks.emit).toHaveBeenCalledTimes(3);
    const seqs = mocks.emit.mock.calls.map((c) => (c[1] as { seq: number }).seq);
    expect(seqs).toEqual([1, 2, 1]);
    expect(currentSeq('sess-a')).toBe(2);
    expect(currentSeq('sess-b')).toBe(1);
  });

  it('frees the counter once the session ends, so the next broadcast restarts at 1', () => {
    mocks.emit = vi.fn();
    mocks.ioValue = { to: () => ({ emit: mocks.emit }), of: () => ({ to: () => ({ emit: mocks.shareEmit }) }) };

    broadcastSessionState(fakeSession('sess-c'));
    broadcastSessionState(fakeSession('sess-c'));
    broadcastSessionState(fakeSession('sess-c', 'ended'));
    expect(currentSeq('sess-c')).toBe(0); // freed

    broadcastSessionState(fakeSession('sess-c'));
    const seqs = mocks.emit.mock.calls.map((c) => (c[1] as { seq: number }).seq);
    expect(seqs).toEqual([1, 2, 3, 1]);
  });
});
