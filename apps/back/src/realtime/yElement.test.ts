import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

// Mock the DB access `joinRoom`/`saveRoom` use. The load result is swappable
// per test, and it resolves via setTimeout so two concurrent joins on the same
// never-collaborated element genuinely race the check-then-act window.
const mocks = vi.hoisted(() => ({
  loadResult: null as unknown,
  findByIdAndUpdate: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../models/Element', () => ({
  Element: {
    findById: vi.fn(() => ({
      select: vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mocks.loadResult), 0);
          }),
      ),
    })),
    findByIdAndUpdate: mocks.findByIdAndUpdate,
  },
}));

import { joinRoom } from './yElement';

afterEach(() => {
  vi.useRealTimers();
});

describe('joinRoom', () => {
  it('lets two concurrent joins on the same never-collaborated element race safely', async () => {
    mocks.loadResult = { body: { type: 'doc', content: [] }, docState: null };

    // No `await` between these two calls — both must observe the check-then-act
    // window before the (mocked, delayed) DB load resolves.
    const [a, b] = await Promise.all([
      joinRoom('race-el-1', 'sockA'),
      joinRoom('race-el-1', 'sockB'),
    ]);

    // Exactly one of the two concurrent joiners claims the seed.
    const seeded = [a, b].filter((r) => r.seedFrom !== null);
    expect(seeded.length).toBe(1);

    // Both joiners see the same hydrated (post-`ready`) doc state.
    expect(a.state).toEqual(b.state);

    // A subsequent joiner never receives a seed — it was already claimed.
    const c = await joinRoom('race-el-1', 'sockC');
    expect(c.seedFrom).toBeNull();
  });

  it('does not schedule a spurious save when hydrating from a stored docState', async () => {
    // Build a real docState: applying it during hydration must NOT mark the
    // room dirty (the update handler attaches only after hydration).
    const source = new Y.Doc();
    source.getXmlFragment('default').insert(0, [new Y.XmlText('hello')]);
    mocks.loadResult = { body: null, docState: Y.encodeStateAsUpdate(source) };
    mocks.findByIdAndUpdate.mockClear();

    vi.useFakeTimers();
    const join = joinRoom('hydrate-el-1', 'sockD');
    await vi.advanceTimersByTimeAsync(0); // let the mocked DB load resolve
    const res = await join;
    expect(res.seedFrom).toBeNull(); // docState path, not the legacy-body seed

    // Advance past SAVE_DEBOUNCE_MS (2000ms): no save may have been scheduled.
    await vi.advanceTimersByTimeAsync(2100);
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
