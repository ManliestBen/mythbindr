import { describe, expect, it, vi } from 'vitest';

// shareNamespace.ts imports roomToSharedSessionInput from ./sessionRooms,
// which in turn imports getIO from ./io — and io.ts eagerly reads process.env
// via ../lib/env at module load (throws without MONGODB_URI). This suite only
// exercises the pure/mockable cooldown/cap/disconnect helpers below, so mock
// ./sessionRooms to keep that chain (and any real DB/env requirement) out of
// this unit test, matching the yElement.test.ts mocking pattern.
vi.mock('./sessionRooms', () => ({
  roomToSharedSessionInput: () => ({}),
}));

import {
  MAX_SOCKETS_PER_TOKEN,
  HANDSHAKE_COOLDOWN_MS,
  checkHandshakeCooldown,
  registerSocket,
  unregisterSocket,
  tokenSocketCount,
  disconnectShareToken,
} from './shareNamespace';

function fakeSocket(id: string) {
  return { id, disconnect: vi.fn() };
}

describe('checkHandshakeCooldown', () => {
  it('allows the first handshake from an IP', () => {
    expect(checkHandshakeCooldown('1.1.1.1', 1_000)).toBe(true);
  });

  it('rejects a second handshake from the same IP within the cooldown window', () => {
    checkHandshakeCooldown('2.2.2.2', 1_000);
    expect(checkHandshakeCooldown('2.2.2.2', 1_000 + HANDSHAKE_COOLDOWN_MS - 1)).toBe(false);
  });

  it('allows a handshake from the same IP once the cooldown window has elapsed', () => {
    checkHandshakeCooldown('3.3.3.3', 1_000);
    expect(checkHandshakeCooldown('3.3.3.3', 1_000 + HANDSHAKE_COOLDOWN_MS)).toBe(true);
  });

  it('tracks IPs independently', () => {
    checkHandshakeCooldown('4.4.4.4', 5_000);
    expect(checkHandshakeCooldown('5.5.5.5', 5_000)).toBe(true);
  });
});

describe('registerSocket / token cap', () => {
  it(`allows up to MAX_SOCKETS_PER_TOKEN (${MAX_SOCKETS_PER_TOKEN}) sockets, rejects the next one`, () => {
    const token = 'tok-cap-test';
    for (let i = 0; i < MAX_SOCKETS_PER_TOKEN; i++) {
      expect(registerSocket(token, fakeSocket(`s${i}`))).toBe(true);
    }
    expect(tokenSocketCount(token)).toBe(MAX_SOCKETS_PER_TOKEN);
    // The 11th (one past the cap) is rejected.
    expect(registerSocket(token, fakeSocket('s-overflow'))).toBe(false);
    expect(tokenSocketCount(token)).toBe(MAX_SOCKETS_PER_TOKEN);
  });

  it('frees a slot on unregister, admitting a new socket after', () => {
    const token = 'tok-unregister-test';
    const sockets = Array.from({ length: MAX_SOCKETS_PER_TOKEN }, (_, i) => fakeSocket(`u${i}`));
    for (const s of sockets) registerSocket(token, s);
    expect(registerSocket(token, fakeSocket('u-overflow'))).toBe(false);

    unregisterSocket(token, sockets[0]);
    expect(tokenSocketCount(token)).toBe(MAX_SOCKETS_PER_TOKEN - 1);
    expect(registerSocket(token, fakeSocket('u-new'))).toBe(true);
  });

  it('drops the token entry entirely once its last socket unregisters', () => {
    const token = 'tok-drain-test';
    const s = fakeSocket('d0');
    registerSocket(token, s);
    unregisterSocket(token, s);
    expect(tokenSocketCount(token)).toBe(0);
  });
});

describe('disconnectShareToken', () => {
  it('disconnects exactly the sockets registered under that token, and none other', () => {
    const tokenA = 'tok-disconnect-a';
    const tokenB = 'tok-disconnect-b';
    const aSockets = [fakeSocket('a0'), fakeSocket('a1')];
    const bSockets = [fakeSocket('b0')];
    for (const s of aSockets) registerSocket(tokenA, s);
    for (const s of bSockets) registerSocket(tokenB, s);

    disconnectShareToken(tokenA);

    for (const s of aSockets) expect(s.disconnect).toHaveBeenCalledWith(true);
    for (const s of bSockets) expect(s.disconnect).not.toHaveBeenCalled();
    expect(tokenSocketCount(tokenA)).toBe(0);
    expect(tokenSocketCount(tokenB)).toBe(1);
  });

  it('is a no-op for a token with no registered sockets', () => {
    expect(() => disconnectShareToken('tok-never-registered')).not.toThrow();
  });
});
