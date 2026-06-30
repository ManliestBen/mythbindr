# Monorepo migration notes

This repo was assembled from the two former repos:
- `mythbindr-back` → `apps/back` (package `@mythbindr/back`)
- `mythbindr-front` → `apps/front` (package `@mythbindr/front`)

plus a new `packages/shared` (`@mythbindr/shared`) holding the cross-cutting
contract.

## What changed in the code

- **npm workspaces.** Root `package.json` declares `packages/*` + `apps/*`. One
  `npm install` at the root links everything; the apps depend on
  `@mythbindr/shared` via the `"*"` workspace range.
- **`packages/shared`** now owns:
  - the zod schemas previously in `mythbindr-back/src/schemas/**`
    (`campaign`, `session`, `elements/*`) — these import only `zod`, so they
    moved verbatim and are exported from `@mythbindr/shared`;
  - the Socket.IO event contract (`ClientToServerEvents`,
    `ServerToClientEvents`, `Participant`, `PresencePayload`, `ElementBinary`,
    `YjsInitPayload`) plus the `toU8` binary helper.
- **`apps/back`**: the 6 `../schemas/...` imports now import from
  `@mythbindr/shared`; `src/schemas/` was removed. `realtime/io.ts` uses the
  shared `toU8` (its local copy was deleted) and types the Socket.IO `Server`
  with the shared `ClientToServerEvents` / `ServerToClientEvents`.
- **`apps/front`**: `realtime/usePresence.ts` imports `Participant` /
  `PresencePayload` from `@mythbindr/shared` (type-only — zero runtime added to
  the bundle) and re-exports `Participant` so existing imports keep working.
- **`overrides.mongodb` (root)**: workspace hoisting otherwise installed two
  `mongodb` copies (one for `mongoose`, one for `connect-mongo`), which made
  their `MongoClient` types incompatible in `apps/back/src/lib/session.ts`.
  Pinning a single `mongodb@6.20.0` collapses them.

The shared package is built (`tsc` → `dist/`, CommonJS + `.d.ts`); the API
consumes its `dist` at runtime, the SPA consumes only its types at build time.

## Remaining shared-type dedup (safe, incremental follow-ups)

The front still hand-declares several types that mirror the backend. They were
left as-is because the app already works and each is an independent change best
verified on its own. Migrate them to `@mythbindr/shared` (deriving from the zod
schemas with `z.infer<>`), highest-value first:

1. `apps/front/src/data/session.ts` — `Condition`, `Combatant`, `LogEntry`,
   `GameSessionT` are 1:1 mirrors of the internal objects in
   `packages/shared/src/schemas/session.ts`. Export those sub-schemas from
   shared and derive the front types. (Strongest duplication.)
2. `apps/front/src/data/elementTypes.ts` — the enum option lists (NPC status,
   location/encounter/item enums) are copied from
   `packages/shared/src/schemas/elements/*`. Export the per-type `*Data` schemas
   from shared and derive the option lists.
3. `apps/front/src/data/campaigns.ts` — `campaignFormSchema` / `Campaign` mirror
   `campaign.ts` (already drifting). Replace with the shared schema.
4. `apps/front/src/data/elements.ts` — `ElementT` / `ElementInput` mirror
   `baseElementCreate` + `soundtrackSchema`.
5. REST DTOs with no backend zod source yet (`Member`/`Role`/`Invite`,
   `DashboardData`, `ActivityItem`, `InvitePreview`) — author once in shared and
   have the API conform.

When deriving runtime values on the front (e.g. enum lists), import the shared
schema as a value; for pure types use `import type` to keep them out of the
bundle.

## Preserving git history (optional)

This monorepo was created as a fresh copy of the working trees. To instead graft
the two repos' histories under `apps/`, use `git subtree add` or
[`git-filter-repo`](https://github.com/newren/git-filter-repo) to rewrite each
source repo into its `apps/<name>` subdirectory before merging.
