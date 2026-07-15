# Plan 004: Fix the Yjs room-seeding race and the links clobber between REST and collab saves

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4cea7..HEAD -- apps/back/src/realtime/yElement.ts apps/back/src/elements/routes.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (001 recommended so `npm test` exists)
- **Category**: bug
- **Planned at**: commit `8d4cea7`, 2026-07-14

## Why this matters

Two data-loss bugs in the collaborative-editing path:

1. **Room-seeding race (check-then-act).** `joinRoom` checks the in-memory room map, then `await`s a DB load, then inserts the room. Two clients opening the same never-collaborated element in the same tick both miss the check, both create a `Y.Doc`, and the second `rooms.set` orphans the first client's room — subsequent updates/saves target the wrong doc. Both callers also receive `seedFrom`, so both seed the doc and the element body is **duplicated**. The doc comment says "server controls who seeds, avoiding races" — the implementation doesn't deliver that.
2. **Links clobber.** The debounced collab save and the REST element PATCH both rewrite the whole `links` array from a read-then-write. If a REST relationship edit races the 2-second debounced Yjs save, whichever write lands second silently erases the other's just-added mention or relationship, and backlinks go stale.

## Current state

- `apps/back/src/realtime/yElement.ts` — the whole file is ~110 lines; read it fully before editing. Key parts:

  Room shape and map (lines 8–16):

  ```ts
  interface Room {
    doc: Y.Doc;
    sockets: Set<string>;
    saveTimer: ReturnType<typeof setTimeout> | null;
    dirty: boolean;
  }
  const rooms = new Map<string, Room>();
  ```

  The racy join (lines 25–52) — note the `await` between the `rooms.get` miss and `rooms.set`:

  ```ts
  export async function joinRoom(elementId, socketId) {
    const existing = rooms.get(elementId);
    if (existing) {
      existing.sockets.add(socketId);
      return { state: Y.encodeStateAsUpdate(existing.doc), seedFrom: null };
    }
    const doc = new Y.Doc();
    const el = await Element.findById(elementId).select('docState body');   // ← race window
    let seedFrom: unknown | null = null;
    if (el?.docState) {
      Y.applyUpdate(doc, new Uint8Array(el.docState as Buffer));
    } else if (el && el.body != null) {
      seedFrom = el.body; // first joiner seeds the empty doc from the legacy body
    }
    const room: Room = { doc, sockets: new Set([socketId]), saveTimer: null, dirty: false };
    rooms.set(elementId, room);
    doc.on('update', () => { room.dirty = true; scheduleSave(elementId); });
    return { state: Y.encodeStateAsUpdate(doc), seedFrom };
  }
  ```

  The read-then-write save (lines 79–109, abridged):

  ```ts
  async function saveRoom(elementId, cleanup) {
    const room = rooms.get(elementId);
    if (!room) return;
    if (room.dirty) {
      room.dirty = false;
      const docState = Buffer.from(Y.encodeStateAsUpdate(room.doc));
      const body = yDocToProsemirrorJSON(room.doc, FRAGMENT);
      const current = await Element.findById(elementId).select('links');       // ← read
      const rel = (current?.links ?? []).filter((l) => l.source === 'relationship').map(...);
      await Element.findByIdAndUpdate(elementId, {                              // ← write (clobbers)
        $set: { docState, body, bodyText: deriveBodyText(body), links: [...rel, ...mentionLinks(body)] },
      });
    }
    if (cleanup && room.sockets.size === 0) { /* clear timer, destroy doc, delete room */ }
  }
  ```

- `apps/back/src/elements/routes.ts` — REST PATCH `/:id` (lines 89–162). The links recompute (lines 124–140) reads `el.links` (fetched at request start) and rebuilds:

  ```ts
  if (b.body !== undefined || b.relationships !== undefined) {
    const existing = (el.links ?? []).map((l) => ({ targetId: l.targetId, relType: l.relType, source: l.source }));
    const mention = b.body !== undefined ? mentionLinks(b.body) : existing.filter((l) => l.source === 'mention');
    const rel = b.relationships !== undefined ? relationshipLinks(b.relationships) : existing.filter((l) => l.source === 'relationship');
    $set.links = [...rel, ...mention];
  }
  ```

  The write is `Element.findByIdAndUpdate(el._id, { $set, $inc: { version: 1 } }, { new: true })` (lines 147–151).

- `apps/back/src/elements/links.ts` — link builders. `mentionLinks(body)` returns `{ targetId: string; relType: ''; source: 'mention' }[]` (targetId is a **string** id; mongoose casts on write). `relationshipLinks(rels)` returns the `source: 'relationship'` equivalents.

- Consumer of `joinRoom` — `apps/back/src/realtime/io.ts:72-78`: on `yjs:join` (after an editor-role authz check) the server calls `joinRoom(elementId, socket.id)` and emits `yjs:init` with `{ elementId, state, seedFrom }`. The **client** applies `seedFrom` by inserting the legacy body into the doc (see `apps/front/src/realtime/YSocketProvider.ts` — read-only context; do not modify).

- Conventions: TypeScript strict, CommonJS build (`tsc`), mongoose 8. All async socket handlers already tolerate thrown promise rejections poorly — keep `joinRoom`'s external signature `Promise<{ state: Uint8Array; seedFrom: unknown | null }>` unchanged.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Build     | `npm run build`     | exit 0              |
| Tests     | `npm test` (if 001 landed) | all pass     |
| Manual    | `npm run dev:back` + `npm run dev:front`, two browser windows on the same element | see steps |

## Scope

**In scope** (the only files you should modify/create):
- `apps/back/src/realtime/yElement.ts`
- `apps/back/src/elements/routes.ts` (the links-recompute block only)
- `apps/back/src/realtime/yElement.test.ts` (create, if plan 001 landed)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `apps/back/src/realtime/io.ts` — the authz and relay logic is correct; the `yjs:init` contract must not change.
- `apps/front/src/realtime/YSocketProvider.ts` and the shared event contract (`packages/shared/src/realtime/events.ts`) — no client or contract changes.
- Awareness/ghost-caret handling — a separate known issue, deliberately deferred (see `plans/README.md`).
- The element `version` optimistic-concurrency scheme — do not extend it to collab saves in this plan.

## Git workflow

- One commit, e.g. `Fix Yjs room seeding race and atomic links merge`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Make room creation synchronous with an async hydration promise

Rewrite `joinRoom` in `yElement.ts` so the room is registered in the map **before** any `await`, and every joiner (creator or concurrent) waits for one shared hydration:

```ts
interface Room {
  doc: Y.Doc;
  sockets: Set<string>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  dirty: boolean;
  /** Resolves when the doc is hydrated from the DB; holds the one-time seed. */
  ready: Promise<void>;
  seedFrom: unknown | null;
  seedClaimed: boolean;
}

export async function joinRoom(
  elementId: string,
  socketId: string,
): Promise<{ state: Uint8Array; seedFrom: unknown | null }> {
  let room = rooms.get(elementId);
  if (!room) {
    const doc = new Y.Doc();
    const r: Room = {
      doc,
      sockets: new Set<string>(),
      saveTimer: null,
      dirty: false,
      seedFrom: null,
      seedClaimed: false,
      ready: (async () => {
        const el = await Element.findById(elementId).select('docState body');
        if (el?.docState) {
          Y.applyUpdate(doc, new Uint8Array(el.docState as Buffer));
        } else if (el && el.body != null) {
          r.seedFrom = el.body; // exactly one joiner will claim this
        }
      })(),
    };
    // Register BEFORE any await so a concurrent join reuses this room.
    rooms.set(elementId, r);
    doc.on('update', () => {
      r.dirty = true;
      scheduleSave(elementId);
    });
    room = r;
  }
  room.sockets.add(socketId);
  await room.ready;               // every joiner waits for hydration
  let seedFrom: unknown | null = null;
  if (room.seedFrom != null && !room.seedClaimed) {
    room.seedClaimed = true;      // hand the seed to exactly one client
    seedFrom = room.seedFrom;
  }
  return { state: Y.encodeStateAsUpdate(room.doc), seedFrom };
}
```

Notes that are load-bearing:
- `rooms.set` before `await` closes the race: the second joiner takes the `room` branch and awaits the same `ready`.
- Every joiner awaits `ready`, so no one receives a pre-hydration empty state.
- `seedClaimed` guarantees at most one `yjs:init` carries `seedFrom` — that's the "server controls who seeds" contract the old comment promised.
- The forward reference `r` inside its own initializer is fine because the async IIFE body runs after `r` is assigned; TypeScript accepts it (the closure captures the binding). If tsc complains, hoist `seedFrom`/`seedClaimed` assignment into the promise with a local `let` and copy after — but try the direct form first.
- If the `ready` promise rejects (DB error), the room stays in the map with an unhydrated doc. Add a `.catch` inside the IIFE that logs (`console.error('yjs hydrate error:', err)`) and leaves `seedFrom` null — matching the file's existing error style in `saveRoom`.

**Verify**: `npm run typecheck` → exit 0. Manual: open the **same brand-new element** (created fresh, some body text typed via the plain editor path if available, or just any element never co-edited) in two windows as simultaneously as possible; the body must appear once, not duplicated, and edits in each window must reach the other.

### Step 2: Make the collab save merge links atomically

In `saveRoom`, replace the read-then-write (the `const current = await Element.findById(...)` line and the `findByIdAndUpdate` `$set` object) with a single **aggregation-pipeline update** that preserves `source: 'relationship'` entries as they exist at write time and replaces only mention links:

```ts
const docState = Buffer.from(Y.encodeStateAsUpdate(room.doc));
const body = yDocToProsemirrorJSON(room.doc, FRAGMENT);
await Element.findByIdAndUpdate(elementId, [
  {
    $set: {
      docState: { $literal: docState },
      body: { $literal: body },
      bodyText: { $literal: deriveBodyText(body) },
      links: {
        $concatArrays: [
          {
            $filter: {
              input: { $ifNull: ['$links', []] },
              cond: { $eq: ['$$this.source', 'relationship'] },
            },
          },
          { $literal: mentionLinks(body) },
        ],
      },
    },
  },
]);
```

Load-bearing notes:
- The `$literal` wrappers are required: in pipeline updates, plain objects/arrays are interpreted as aggregation expressions; `$literal` makes them values. `docState` is a Buffer — mongoose serializes it as BinData inside `$literal`; verify by reloading the element (STOP condition if it round-trips wrong).
- `mentionLinks(body)` returns `targetId` as **strings**. In a pipeline `$literal`, mongoose does *not* cast paths, so cast explicitly: map to `new mongoose.Types.ObjectId(l.targetId)` before embedding, i.e. build `const mentions = mentionLinks(body).map((l) => ({ ...l, targetId: new mongoose.Types.ObjectId(l.targetId) }));` and use `{ $literal: mentions }`. Import `mongoose` (or `Types` from `'mongoose'`) at the top of the file.
- Delete the now-unused `const current = await Element.findById(elementId).select('links');` block.

**Verify**: `npm run typecheck` → exit 0. Manual: open an element in the collab editor, type an `@mention` of another element; within ~3 s (debounce) reload the element via REST (navigate away/back) — the mention link must appear under backlinks of the target AND any pre-existing typed relationship must still be present.

### Step 3: Make the REST PATCH links-merge atomic the same way

In `elements/routes.ts`, the recompute block (lines 124–140) already handles three cases (body changed / relationships changed / both). Convert it to pipeline form so the *unchanged* kind is preserved from the DB at write time instead of from the stale request-start read:

Replace the `$set.links = [...rel, ...mention]` construction plus the plain-object `findByIdAndUpdate` with:

```ts
const linkStages: unknown[] = [];
if (b.body !== undefined || b.relationships !== undefined) {
  const keepSource = b.body !== undefined && b.relationships === undefined
    ? 'relationship'                         // body changed → keep stored relationships
    : b.relationships !== undefined && b.body === undefined
      ? 'mention'                            // relationships changed → keep stored mentions
      : null;                                // both changed → full replace
  const fresh = [
    ...(b.relationships !== undefined ? relationshipLinks(b.relationships) : []),
    ...(b.body !== undefined ? mentionLinks(b.body) : []),
  ].map((l) => ({ ...l, targetId: new mongoose.Types.ObjectId(l.targetId as string) }));
  linkStages.push({
    $set: {
      links: keepSource
        ? {
            $concatArrays: [
              { $filter: { input: { $ifNull: ['$links', []] }, cond: { $eq: ['$$this.source', keepSource] } } },
              { $literal: fresh },
            ],
          }
        : { $literal: fresh },
    },
  });
}

const updated = await Element.findByIdAndUpdate(
  el._id,
  [
    { $set: { ...Object.fromEntries(Object.entries($set).map(([k, v]) => [k, { $literal: v }])) } },
    ...linkStages,
    { $set: { version: { $add: [{ $ifNull: ['$version', 0] }, 1] } } },
  ],
  { new: true },
);
```

Load-bearing notes:
- `$inc` is not available in pipeline updates — the `$add` stage above replaces it. The `version` field exists on the schema (used by the optimistic-concurrency check at lines 98–106).
- `$set` (the plain map built earlier in the handler: `name`, `body`, `bodyText`, `tags`, `playerVisible`, `secrets`, `soundtrack`, `data`, `updatedBy`) must be `$literal`-wrapped per key, as shown, so arrays like `tags` aren't treated as expressions. Remove `links` from that map — it's handled by `linkStages`.
- `updatedBy` is a string userId; mongoose won't cast in `$literal` — wrap it: `new mongoose.Types.ObjectId(req.session.userId)`. `mongoose` may not be imported in this file; `isValidObjectId` is imported from `'mongoose'` already, so extend that import (`import { isValidObjectId, Types } from 'mongoose'`).
- Everything else in the handler (validation, version check, activity log) stays unchanged.

**Verify**: `npm run typecheck` → exit 0. Manual regression sweep (this step touches every element edit): edit name only → saves; edit body with a mention → mention backlink appears, relationships intact; edit relationships only → mentions intact; the 409 stale-version path still triggers when two tabs edit the same element (second save without reload → conflict toast).

## Test plan

If plan 001 landed, create `apps/back/src/realtime/yElement.test.ts` for the race (no DB needed if you mock the model — do NOT stand up mongodb-memory-server in this plan):

- Mock `Element.findById` (vi.mock of `'../models/Element'`) to return `{ body: { some: 'body' }, docState: null }` after a `setTimeout(0)` delay.
- Call `joinRoom('el1', 'sockA')` and `joinRoom('el1', 'sockB')` **without awaiting between them**; `await Promise.all`.
- Assert exactly one of the two results has non-null `seedFrom`, and both `state` payloads decode into the same doc (apply both to fresh `Y.Doc`s and compare `Y.encodeStateAsUpdate` byte lengths, or simply assert both joins used the same room by calling a third `joinRoom` and checking `seedFrom === null`).

Step 2/3's pipeline updates are integration-shaped (need a real Mongo) — cover them with the manual checks above and defer automated coverage to plan 005's deferred-integration note. State this in the commit message.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm run build` exits 0
- [ ] In `yElement.ts`: `grep -n "rooms.set" apps/back/src/realtime/yElement.ts` appears **before** any `await Element.findById` line in `joinRoom` (by line number)
- [ ] `grep -c "seedClaimed" apps/back/src/realtime/yElement.ts` ≥ 2
- [ ] `grep -n "findById(elementId).select('links')" apps/back/src/realtime/yElement.ts` → no matches (read-then-write removed)
- [ ] `grep -c "concatArrays" apps/back/src/realtime/yElement.ts apps/back/src/elements/routes.ts` → ≥ 1 each
- [ ] `npm test` exits 0 including the new race test (if 001 landed)
- [ ] Manual checks from Steps 1–3 performed and passing (list them in the report)
- [ ] `git status --porcelain` shows changes only to in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The live code doesn't match the "Current state" excerpts (drift).
- Mongoose 8 rejects the pipeline update (`Cast`/`Update pipeline` errors) or the Buffer in `$literal` doesn't round-trip as BinData (reload shows corrupted `docState`) — the fallback design (split `links` into two schema fields) is a bigger change that needs the operator's sign-off.
- The `version` `$add` stage breaks the 409 optimistic-concurrency test in Step 3's manual sweep.
- The TypeScript forward-reference in Step 1's `Room` initializer can't be made to compile after one restructuring attempt.
- You find `yjs:init`/`YSocketProvider` needs changes — the client contract is out of scope; report instead.

## Maintenance notes

- The awareness/ghost-caret issue (server never broadcasts awareness removal on disconnect; idle carets vanish at ~30 s) is known and deliberately deferred — do not "fix" it here.
- Plan 006 adds `.lean()` to read paths; it must NOT touch the two pipeline updates introduced here.
- Reviewer should scrutinize: the `$literal` casting of `targetId`/`updatedBy` ObjectIds, and that `saveRoom`'s cleanup branch (`room.sockets.size === 0`) still destroys the doc and deletes the room after the rewrite.
- Future work: making collab saves participate in the `version` scheme (bumping version on Yjs saves) was considered and deferred — it would 409 innocent REST edits mid-co-editing; needs product thought.
