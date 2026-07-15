# Plan 006: Performance quick wins — code-split the editor stack, lean queries, compound indexes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4cea7..HEAD -- apps/front/src/App.tsx apps/front/src/components/ElementForm.tsx apps/back/src/models/Activity.ts apps/back/src/models/Session.ts apps/back/src/elements/routes.ts apps/back/src/campaigns/routes.ts apps/back/src/collab/routes.ts apps/back/src/sessions/routes.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plan 004 legitimately edits
> `elements/routes.ts` and plan 003 edits nothing here — a changed links
> block in the PATCH handler is expected, not drift; see Step 3 notes.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (coordinate with 004 on `elements/routes.ts` — see Step 3)
- **Category**: perf
- **Planned at**: commit `8d4cea7`, 2026-07-14

## Why this matters

The app is served from a Raspberry Pi, so both client payload and server CPU/RAM are scarce. Three cheap, high-yield fixes:

1. **The entire TipTap/Yjs/ProseMirror stack ships in the single entry chunk** — parsed and executed on first load of *every* route, including the unauthenticated auth screen and the public `/share/:token` player page, which never edit anything. There is no `React.lazy` anywhere in the app.
2. **Zero `.lean()` on read-only Mongoose queries** — the hottest read paths (500-element list, search, export, activity feed) hydrate full Mongoose documents only to immediately map them to plain objects.
3. **Two missing compound indexes** — the Activity feed sorts on `createdAt` and Session queries filter on `status` against single-field `campaignId` indexes, forcing in-memory sorts as per-campaign history grows. (The `Element` model already has the right compound indexes — these two models are the gap.)

## Current state

- `apps/front/src/App.tsx` — all 15 page components are static imports (lines 9–22), e.g.:

  ```ts
  import Campaigns from './pages/Campaigns';
  import CampaignHome from './pages/CampaignHome';
  ...
  import Settings from './pages/Settings';
  import Placeholder from './pages/Placeholder';
  ```

  A `Splash` component already exists in the file (lines 28–34) rendering a centered "Loading…" — reuse it as the Suspense fallback. Routes are declared at lines 55–76; the public share route is `/share/:token` → `SharePage`.

- `apps/front/src/components/ElementForm.tsx` — static imports at lines 4–5:

  ```ts
  import RichTextEditor from './RichTextEditor';
  import CollaborativeEditor from './CollaborativeEditor';
  ```

  Used at lines ~139 and ~149 inside the form body. These two components (and only these two, plus `ProseMirrorView.tsx` used by read views — check its importers) pull the `@tiptap/*`, `yjs`, `y-prosemirror`, `y-protocols` graph.

- `apps/front/vite.config.ts` — plugins + dev proxy only; no `build` options. Vite code-splits automatically at dynamic-import boundaries; no `manualChunks` needed.

- `apps/back/src/models/Activity.ts:5` — `campaignId: { ..., index: true }`; feed query is `Activity.find({campaignId}).populate(...).sort({ createdAt: -1 }).limit(n)` (`apps/back/src/collab/routes.ts:144-147`).

- `apps/back/src/models/Session.ts:42` — `campaignId: { ..., index: true }`; queries: `findOne({campaignId, status:'active'}).sort({createdAt:-1})` (`sessions/routes.ts:18-20`), `find({campaignId, status:'ended'}).sort({endedAt:-1}).limit(20)` (`sessions/routes.ts:116-118`).

- Read-only queries that feed serializers and can take `.lean()` — all verified to read plain fields only (their mappers are `publicX(...)` functions with no document methods/virtuals):
  - `apps/back/src/elements/routes.ts:26` — element list (`.limit(500)`), maps via `publicElement`
  - `apps/back/src/elements/routes.ts:227-231` — backlinks query, maps `{id,type,name}`
  - `apps/back/src/campaigns/routes.ts:22-26` — membership + campaign list, maps via `publicCampaign`
  - `apps/back/src/campaigns/routes.ts:252-255` — export element load
  - `apps/back/src/campaigns/routes.ts:283-288` — search (read the handler before editing)
  - `apps/back/src/collab/routes.ts:144-147` — activity feed (uses `.populate('userId','displayName')` — `.lean()` composes with populate)
  - `apps/back/src/sessions/routes.ts:116-119` — session history, maps via `publicSession`

  Do **NOT** lean: any `findOne`/`findById` whose document is later `.save()`d or whose result feeds `findByIdAndUpdate` version checks (`elements/routes.ts` `findInCampaign` when used by PATCH/DELETE — it's shared by GET too, so leave `findInCampaign` untouched entirely), the auth `Credential` (it calls `.save()`), and anything in `realtime/yElement.ts`.

- Types caveat: with `.lean()` the result is a POJO; the existing casts like `publicElement(e as ElementDoc)` keep compiling because the mappers only read fields. If tsc complains, cast via `as unknown as ElementDoc` — matching the pattern already at `campaigns/routes.ts:252-255`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Build     | `npm run build`     | exit 0              |
| Tests     | `npm test` (if 001 landed) | all pass     |
| Bundle check | `ls apps/front/dist/assets/*.js \| wc -l` after build | see Step 2 |

## Scope

**In scope** (the only files you should modify):
- `apps/front/src/App.tsx`
- `apps/front/src/components/ElementForm.tsx`
- `apps/back/src/models/Activity.ts`
- `apps/back/src/models/Session.ts`
- `apps/back/src/elements/routes.ts`, `apps/back/src/campaigns/routes.ts`, `apps/back/src/collab/routes.ts`, `apps/back/src/sessions/routes.ts` (append `.lean()` at the listed sites only)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `vite.config.ts` — no `manualChunks`; dynamic imports are sufficient.
- `apps/back/src/realtime/yElement.ts` — its reads feed live docs; also owned by plan 004.
- The Yjs room-cache TTL/sweep idea and the export streaming/pretty-print change — separate findings, not in this plan (see `plans/README.md`).
- `CampaignMap.tsx` layout simulation — separate deferred finding.
- Any query that writes or is followed by `.save()`.

## Git workflow

- One commit, e.g. `Perf: lazy-load routes and editor stack, lean read queries, compound indexes`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Lazy-load the page components

In `App.tsx`, convert the page imports (lines 9–22) to `React.lazy`:

```ts
import { lazy, Suspense } from 'react';
const Campaigns = lazy(() => import('./pages/Campaigns'));
const CampaignHome = lazy(() => import('./pages/CampaignHome'));
// ... every page in lines 9–22, including SharePage and Placeholder ...
```

Keep `AuthScreen`, `AppShell`, and the providers as static imports (they're needed on first paint). Wrap the `<Routes>` element (line 55) in `<Suspense fallback={<Splash />}>…</Suspense>`.

**Verify**: `npm run typecheck` → exit 0. `npm run dev:front` + `npm run dev:back`, click through campaigns → element list → editor → run session → share link: every route renders (brief Splash flash acceptable).

### Step 2: Lazy-load the editors inside ElementForm

In `ElementForm.tsx`, replace lines 4–5 with:

```ts
import { lazy, Suspense } from 'react';
const RichTextEditor = lazy(() => import('./RichTextEditor'));
const CollaborativeEditor = lazy(() => import('./CollaborativeEditor'));
```

Wrap each usage site (lines ~139, ~149) in `<Suspense fallback={<div className="mt-1 h-40 animate-pulse rounded-lg border border-app-border bg-app-bg" />}>` (match the file's Tailwind token classes — `app-border`/`app-bg` are the repo's theme tokens).

Then check `ProseMirrorView.tsx` importers: `grep -rn "ProseMirrorView" apps/front/src --include='*.tsx' -l`. If it is imported by `SharePage.tsx` or other read-only routes, those routes were already made lazy in Step 1 — nothing more to do; note the finding in the commit message if the share page still transitively pulls `@tiptap/pm`.

**Verify**: `npm run build` → exit 0. Then:
- `ls apps/front/dist/assets/*.js | wc -l` → **> 10** (route-level chunks exist; before this change the count is ~1–3).
- `for f in apps/front/dist/assets/index-*.js; do grep -c "prosemirror" $f || true; done` → `0` (the entry chunk no longer contains the editor stack; the string `prosemirror` appears only in lazy chunks: confirm with `grep -l "prosemirror" apps/front/dist/assets/*.js` → filenames that are NOT `index-*`).

### Step 3: Add `.lean()` to the listed read-only queries

Append `.lean()` to exactly the seven query sites listed in "Current state". Example (`elements/routes.ts:26`):

```ts
const els = await Element.find(filter).sort({ updatedAt: -1 }).limit(500).lean();
```

Coordination note: if plan 004 already landed, the PATCH handler in `elements/routes.ts` uses a pipeline update — that code path is untouched by this step (you are only editing the GET list at line 26 and backlinks at 227; `findInCampaign` stays as-is).

Fix any resulting type errors with `as unknown as ElementDoc` (or the equivalent doc type) at the mapper call — never by removing `.lean()`.

**Verify**: `npm run typecheck` → exit 0. Manual: element list renders, search works, activity feed shows names (the populated `userId.displayName` still resolves — populate+lean returns the populated POJO), campaign export downloads and re-imports.

### Step 4: Compound indexes

In `Activity.ts`, after the schema definition add:

```ts
activitySchema.index({ campaignId: 1, createdAt: -1 });
```

and remove `index: true` from the `campaignId` field (line 5) — the compound index's prefix covers it.

In `Session.ts`, after the schema definition add:

```ts
sessionSchema.index({ campaignId: 1, status: 1, createdAt: -1 });
```

and remove `index: true` from `campaignId` (line 42). This serves both the active-session lookup (`{campaignId, status:'active'}` sorted by `createdAt`) and the ended-history filter; the `endedAt` sort on ≤20 ended rows per campaign is fine in memory.

Mongoose auto-creates indexes on boot in dev (`autoIndex` default). The old single-field indexes remain in the database until manually dropped — harmless; note it in the commit message for the operator.

**Verify**: `npm run typecheck` → exit 0. Boot `npm run dev:back`, then in `mongosh` (if available): `db.activities.getIndexes()` shows the compound index. If mongosh isn't available, the boot log showing no index errors + typecheck is sufficient.

## Test plan

No new unit tests — this plan changes no logic. If plan 001/005 landed, `npm test` must still pass (regression gate). The manual checks in Steps 1–3 are the behavioral verification; list the ones you ran in your report.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` and `npm run build` exit 0; `npm test` exits 0 (if present)
- [ ] `grep -c "lazy(() => import" apps/front/src/App.tsx` ≥ 14
- [ ] `grep -l "prosemirror" apps/front/dist/assets/*.js` lists only non-`index-*` chunk files (run after `npm run build`)
- [ ] `grep -c "\.lean()" apps/back/src` across the four route files ≥ 7 (`grep -rc ".lean()" apps/back/src/elements/routes.ts apps/back/src/campaigns/routes.ts apps/back/src/collab/routes.ts apps/back/src/sessions/routes.ts`)
- [ ] `grep -n "schema.index" apps/back/src/models/Activity.ts apps/back/src/models/Session.ts` shows both compound indexes
- [ ] `git status --porcelain` shows changes only to in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Lazy-loading `SharePage` or `AuthScreen` breaks the unauthenticated flows (blank page instead of Splash) after one fix attempt — the Suspense boundary placement may need design input.
- `.lean()` on the activity feed breaks the populated `displayName` mapping (populate+lean shape mismatch) — revert that one site and report; keep the others.
- Any `.lean()` site turns out to feed a later `.save()` or document method you find while editing — skip that site and report it (the list above was verified at `8d4cea7`, but plan 004 may have moved code).
- The bundle check in Step 2 still shows `prosemirror` in the entry chunk after both lazy conversions — a hidden static import path exists (e.g. `CommandPalette` or `mentionSuggestion`); report the import chain (`npx vite-bundle-visualizer` is NOT installed — use `grep -rn "from './RichTextEditor'\|from './CollaborativeEditor'\|@tiptap" apps/front/src --include='*.ts*' -l` to trace) rather than refactoring further files.

## Maintenance notes

- New pages must follow the lazy pattern in `App.tsx` — a reviewer should reject a static page import.
- New read-only list endpoints should ship with `.lean()` and an index matching their filter+sort shape (copy `Element.ts:47-50`'s style).
- The old single-field `campaignId` indexes on `activities`/`sessions` collections can be dropped manually in production once the compound ones exist (`db.activities.dropIndex('campaignId_1')`) — operator task, not code.
- Deferred (recorded in `plans/README.md`): export streaming/pretty-print removal, Yjs room-cache sweep, CampaignMap layout worker.
