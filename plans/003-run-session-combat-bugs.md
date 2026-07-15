# Plan 003: Fix four run-session combat-tracker bugs (turn pointer, healing, save indicator, trailing save)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4cea7..HEAD -- apps/front/src/pages/RunSession.tsx apps/front/src/components/session/CombatantCard.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (001 recommended first; plan 005 later adds tests over the helper extracted here)
- **Category**: bug
- **Planned at**: commit `8d4cea7`, 2026-07-14

## Why this matters

Run Session (initiative/HP/conditions tracker) is the app's core at-the-table surface, and it has four real bugs:

1. **Removing a combatant skips someone's turn.** Removal just filters the array; if the removed combatant sorts above the current one, every lower entry slides up while `turnIndex` stays fixed, so the "current turn" ring silently jumps past the active creature. The codebase already solves this exact problem for initiative *edits* — removal never got the same treatment.
2. **Healing a downed combatant heals from negative HP.** A PC at −15 healed for 10 shows −5 and stays down; 5e healing starts from 0. Death-save pips are also never reset when HP rises above 0, so stale successes/failures resurface the next time the PC drops.
3. **The save indicator lies.** It shows "Saved" during the 800 ms debounce window because it only reflects the in-flight mutation, not the buffered edit.
4. **The debounce timer survives unmount/end-session**, so a trailing PATCH can land on a session the user already ended.

## Current state

- `apps/front/src/pages/RunSession.tsx` — the session page. Local state `session` (type `GameSessionT` from `../data/session`), mutated through `patch(updater)` which calls `persist(next)`, an 800 ms debounced `update.mutate` (React Query mutation from `useUpdateSession`).

  The debounce (lines 81–98):

  ```ts
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (next: GameSessionT) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        update.mutate({
          sid: next.id,
          patch: { round: next.round, turnIndex: next.turnIndex, combatants: next.combatants, log: next.log },
        });
      }, 800);
    },
    [update],
  );
  ```

  The turn pointer and the existing "follow the combatant" pattern (lines 143–161):

  ```ts
  const order = sortByInit(session.combatants);
  const currentCid = order.length ? order[session.turnIndex % order.length]?.cid : null;

  const changeCombatant = (next: Combatant) =>
    patch((s) => {
      const before = sortByInit(s.combatants);
      const onTurn = before.length ? before[s.turnIndex % before.length]?.cid : null;
      const combatants = s.combatants.map((c) => (c.cid === next.cid ? next : c));
      // Editing initiative re-sorts the order, which would otherwise slide the
      // turn pointer onto whoever now occupies that slot. Follow the combatant
      // whose turn it actually is.
      const after = sortByInit(combatants);
      const ti = onTurn ? after.findIndex((c) => c.cid === onTurn) : -1;
      return { ...s, combatants, turnIndex: ti >= 0 ? ti : s.turnIndex };
    });
  const removeCombatant = (rm: string) =>
    patch((s) => ({ ...s, combatants: s.combatants.filter((c) => c.cid !== rm) }));
  ```

  The save indicator usage (line 291): `<SaveStatus pending={update.isPending} error={update.isError} />`, and the component (lines 413–430) renders `pending ? 'Saving…' : 'Saved'`.

  `finishSession` (lines 243–276) optionally creates a recap note, then `end.mutate(session.id, { onSuccess: () => { setSession(null); navigate(...); } })` — it never clears or flushes `timer.current`.

- `apps/front/src/components/session/CombatantCard.tsx` — per-combatant card. Damage clamps at −99; heal (lines 48–52):

  ```ts
  const heal = () => {
    const max = c.maxHp || c.currentHp + n;
    onChange({ ...c, currentHp: Math.min(c.currentHp + n, max) });
    setAmt('');
  };
  ```

  `c` is a `Combatant` (`apps/front/src/data/session.ts:9`) with `deathSaves: { successes: number; failures: number }`.

- Backend context (do not modify): `PATCH /api/campaigns/:cid/session/:sid` (`apps/back/src/sessions/routes.ts:62`) replaces `round/turnIndex/combatants/log` wholesale and does **not** reject PATCHes to ended sessions — which is why the trailing-timer bug can resurrect state onto an ended session.

- Conventions: function components, hooks, Tailwind classes, single-file page components. No tests exist for these files yet (plan 005 adds them); this plan extracts one pure helper so 005 can test it.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Build     | `npm run build`     | exit 0              |
| Tests     | `npm test` (if 001 landed) | all pass     |
| Manual    | `npm run dev:back` + `npm run dev:front`, open a campaign → Run Session | see per-step checks |

## Scope

**In scope** (the only files you should modify/create):
- `apps/front/src/pages/RunSession.tsx`
- `apps/front/src/components/session/CombatantCard.tsx`
- `apps/front/src/lib/combat.ts` (create — extracted pure helper)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `apps/back/src/sessions/routes.ts` — accepting PATCHes on ended sessions is used by the flush in Step 4; leave as is.
- `apps/front/src/components/session/DiceRoller.tsx` — plan 005 extracts its logic; don't touch here.
- `apps/front/src/data/session.ts` — types and mutations are correct.
- Initiative *sorting* (`sortByInit`) — behavior is correct.

## Git workflow

- One commit, short imperative summary, e.g. `Fix combat tracker: turn pointer on remove, heal from 0, honest save status`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Removal follows the acting combatant

In `RunSession.tsx`, replace `removeCombatant` (lines 158–159) with the same follow-the-turn pattern `changeCombatant` uses:

```ts
const removeCombatant = (rm: string) =>
  patch((s) => {
    const before = sortByInit(s.combatants);
    const onTurn = before.length ? before[s.turnIndex % before.length]?.cid : null;
    const combatants = s.combatants.filter((c) => c.cid !== rm);
    const after = sortByInit(combatants);
    // Follow whoever's turn it is; if THEY were removed, keep the same slot
    // (clamped) so the ring lands on the next creature in order.
    const ti = onTurn && onTurn !== rm ? after.findIndex((c) => c.cid === onTurn) : -1;
    const fallback = after.length ? Math.min(s.turnIndex, after.length - 1) : 0;
    return { ...s, combatants, turnIndex: ti >= 0 ? ti : fallback };
  });
```

**Verify**: `npm run typecheck` → exit 0. Manual: add combatants A(init 20), B(15), C(10); advance to B's turn; remove A → ring must stay on B (not jump to C).

### Step 2: Heal from 0 and reset death saves (pure helper)

Create `apps/front/src/lib/combat.ts`:

```ts
import type { Combatant } from '../data/session';

/**
 * 5e healing: a downed creature heals from 0, not from negative HP, and
 * regaining hit points clears accumulated death saves.
 */
export function applyHeal(c: Combatant, amount: number): Combatant {
  const max = c.maxHp || Math.max(c.currentHp, 0) + amount;
  const from = Math.max(c.currentHp, 0);
  const currentHp = Math.min(from + amount, max);
  const deathSaves =
    c.currentHp <= 0 && currentHp > 0 ? { successes: 0, failures: 0 } : c.deathSaves;
  return { ...c, currentHp, deathSaves };
}
```

In `CombatantCard.tsx`, import it and replace the body of `heal` (lines 48–52):

```ts
const heal = () => {
  onChange(applyHeal(c, n));
  setAmt('');
};
```

**Verify**: `npm run typecheck` → exit 0. Manual: set a combatant to −15 HP (maxHp 20) with 2 death-save failures, heal 10 → HP shows 10 and death saves show 0/0.

### Step 3: Honest save indicator

In `RunSession.tsx`:

1. Add dirty state next to the timer ref: `const [dirty, setDirty] = useState(false);`
2. In `persist`, call `setDirty(true)` before scheduling, and make the timeout's `update.mutate` clear it on settle:

   ```ts
   update.mutate({ ... }, { onSettled: () => setDirty(false) });
   ```

   (`onSettled` covers success *and* error; on error the `SaveStatus` `error` prop takes over the display.)
3. Change the usage (line 291) to `<SaveStatus pending={update.isPending || dirty} error={update.isError} />`.

Note: `dirty` must be cleared in the mutation callback, not when the timer fires — between timer-fire and response the mutation's own `isPending` is true, so the combined flag stays truthful throughout.

**Verify**: `npm run typecheck` → exit 0. Manual: edit a combatant's HP and watch the header — it must read "Saving…" immediately (during the 800 ms window), then "Saved" only after the network call settles.

### Step 4: Flush (don't leak) the debounce on unmount and end-session

In `RunSession.tsx`:

1. Add an unmount cleanup near the `timer` ref:

   ```ts
   useEffect(
     () => () => {
       if (timer.current) clearTimeout(timer.current);
     },
     [],
   );
   ```

2. In `finishSession` (line 243), first line of the function: cancel any pending debounce and flush the latest state synchronously so the final log/HP edits are persisted *before* the session is ended:

   ```ts
   if (timer.current) {
     clearTimeout(timer.current);
     timer.current = null;
     await update.mutateAsync({
       sid: session.id,
       patch: {
         round: session.round,
         turnIndex: session.turnIndex,
         combatants: session.combatants,
         log: session.log,
       },
     }).catch(() => {/* ending anyway; the end call is the priority */});
   }
   ```

   (`finishSession` is already `async`.)

**Verify**: `npm run typecheck` → exit 0. Manual: add a log note, immediately click End session → after confirming, reopen the campaign's session history — the note must be present in the ended session's log.

## Test plan

If plan 001 has landed, create `apps/front/src/lib/combat.test.ts` covering `applyHeal`:
- heal from positive HP clamps at `maxHp`
- heal from negative HP starts at 0 (−15 + 10 → 10, maxHp 20)
- crossing 0 resets `deathSaves` to `{successes: 0, failures: 0}`
- healing while already above 0 leaves `deathSaves` untouched
- `maxHp === 0` fallback (unset max) doesn't clamp below the healed value

Model after `apps/back/src/campaigns/access.test.ts`. Verification: `npm test` → all pass. Steps 1/3/4 live inside components and are covered by the manual checks above (component tests are out of scope; plan 005 note).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm run build` exits 0
- [ ] `apps/front/src/lib/combat.ts` exists and `grep -n "applyHeal" apps/front/src/components/session/CombatantCard.tsx` shows the import + call
- [ ] `grep -n "onTurn" apps/front/src/pages/RunSession.tsx` shows ≥ 2 sites (changeCombatant + removeCombatant)
- [ ] `grep -n "update.isPending || dirty" apps/front/src/pages/RunSession.tsx` matches
- [ ] `grep -n "clearTimeout" apps/front/src/pages/RunSession.tsx` shows ≥ 3 sites (persist, unmount cleanup, finishSession)
- [ ] `npm test` exits 0 with the new `combat.test.ts` passing (if 001 landed)
- [ ] `git status --porcelain` shows changes only to in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- `sortByInit` turns out to be non-deterministic for ties in a way that breaks the follow-the-turn `findIndex` (e.g. unstable sort reshuffling equal initiatives between calls) — report; don't invent a tiebreaker.
- Step 4's `mutateAsync` flush causes a visible double-save race with `end.mutate` (session ends before the flush lands) after one fix attempt.
- Fixing anything appears to require changing the PATCH route or `data/session.ts` types.

## Maintenance notes

- Plan 008 (live shared session spike) will move this state to a socket-broadcast model; the pure `applyHeal` helper and the follow-the-turn pattern survive that move — the debounce/SaveStatus machinery is what gets replaced.
- Reviewer should scrutinize: turn-pointer behavior when the *acting* combatant is removed (Step 1's `fallback` branch) and the interplay of `dirty` + `isPending` in Step 3.
- Deferred deliberately: negative-HP display semantics (damage still tracks to −99 — some tables use it); only *healing* semantics changed.
