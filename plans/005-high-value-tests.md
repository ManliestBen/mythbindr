# Plan 005: Characterize the dangerous untested logic — dice, combatants, share whitelist, import remap, schemas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4cea7..HEAD -- apps/front/src/components/session/DiceRoller.tsx apps/back/src/sessions/combatants.ts apps/back/src/share/serialize.ts apps/back/src/campaigns/routes.ts apps/front/src/lib/generators.ts apps/front/src/lib/quests.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans 003/004 intentionally touch
> neighboring code — RunSession.tsx, yElement.ts — that is NOT drift for this plan.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md (Vitest + `npm test` must exist)
- **Category**: tests
- **Planned at**: commit `8d4cea7`, 2026-07-14

## Why this matters

The repo's most bug-dense logic is pure functions with zero coverage: dice-formula parsing (rewritten twice in the last two commits), combatant-list parsing, the player-share serialization **whitelist** (a security boundary — any regression leaks GM secrets to players), and the export→import id-remap (a regression silently orphans every cross-element link on restore). All of it is cheap to characterize: table-driven unit tests over plain inputs. This plan locks in current behavior so plans 003/004/006 and future feature work can't silently break the table.

## Current state

- Test scaffold from plan 001: root `vitest.config.ts` includes `apps/{back,front}/src/**/*.test.ts` and `packages/shared/src/**/*.test.ts`; `npm test` runs `build:shared` then `vitest run`; exemplar test `apps/back/src/campaigns/access.test.ts`.

- `apps/front/src/components/session/DiceRoller.tsx` — dice logic is **module-private inside a .tsx component** and must be extracted to be testable:
  - `rollDie(sides)` (line 5): `Math.floor(Math.random() * sides) + 1`
  - `parseFormula(raw)` (lines 10–17): regex `/^(\d*)d(\d+)([+-]\d+)?$/` after stripping whitespace/lowercasing; count clamped 1–100; `sides < 2 || sides > 1000` → null; missing count defaults 1.
  - `rollWithEdge(kind, sides, count, m)` (lines 24–39): rolls each die twice, keeps max (adv) / min (dis). **House rule**: d20s report each pair as its own total (separate checks); other dice sum the picks (damage). Returns a formatted string like `` `2×d20 (adv) [4,18→18] [11,3→11]+2 = 20, 13` ``.
  - The component calls these in `rollFormula` (line 49) and `roll` (line 70).

- `apps/back/src/sessions/combatants.ts` — `parseCombatants(text)` (lines 37–60): line-per-combatant; syntaxes `2x Goblin` / `2 Goblin` / `Goblin x2` / bare name; count clamped 1–30; multi-count names get ` 1`, ` 2` suffixes; blank lines skipped. Pure except `crypto.randomBytes` for `cid`.

- `apps/back/src/share/serialize.ts` — the whole file (47 lines). `sanitizeBody(node)` rewrites `{type:'mention', attrs:{label}}` nodes to `{type:'text', text:'@label'}` (recursing into `content` only). `GM_ONLY_DATA = { quest: ['consequences'], encounter: ['combatants','outcome','trigger'] }`. `sharedElement(e)` returns **only** `{id, type, name, body, tags, data, soundtrack}` — never `secrets`, `links`, `playerVisible`, `updatedBy`.

- `apps/back/src/campaigns/routes.ts` — import handler (lines 154–244). The remap logic is an **inline closure** and must be extracted to be testable (lines 193–236): `idMap` (old id string → new ObjectId) built from `srcElements`; `remapIds(node)` walks any JSON and swaps string values found in `idMap`; `links` are filtered to targets present in `idMap` and rebuilt with `source: 'mention' | 'relationship'`; elements with unknown `type` are dropped by the pre-filter (lines 186–191).

- `apps/back/src/share/exportCampaign.ts` — `exportJson(campaign, elements)` builds the `mythbindr-campaign` v1 payload from `publicCampaign`/`publicElement` output.

- `apps/front/src/lib/generators.ts` — `generateParty(...)` (line ~127): random pregen characters; assert invariants (standard-array stats assigned per class priority, HP ≥ 1, AC in sane range), not exact values.

- `apps/front/src/lib/quests.ts` — `questProgress` (line 4): objective done/total counting.

- `packages/shared/src/schemas/**` — zod schemas for campaign/session/8 element types; `elementRegistry` maps type → `{create, update}` schemas; validate with fixtures via `safeParse`.

- Conventions: `import { describe, expect, it } from 'vitest'` (no globals); table-driven via `it.each` where natural.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test`          | all pass            |
| Build     | `npm run build`     | exit 0              |
| One file  | `npx vitest run apps/front/src/lib/dice.test.ts` | passes |

## Scope

**In scope** (the only files you should modify/create):
- `apps/front/src/lib/dice.ts` (create — extraction target)
- `apps/front/src/components/session/DiceRoller.tsx` (imports only — remove the private copies)
- `apps/front/src/lib/dice.test.ts`, `apps/front/src/lib/generators.test.ts`, `apps/front/src/lib/quests.test.ts` (create)
- `apps/back/src/sessions/combatants.test.ts`, `apps/back/src/share/serialize.test.ts` (create)
- `apps/back/src/share/importRemap.ts` (create — extraction target), `apps/back/src/share/importRemap.test.ts` (create)
- `apps/back/src/campaigns/routes.ts` (replace the inline remap closure with the extracted helper — no behavior change)
- `packages/shared/src/schemas/elements/schemas.test.ts` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- Any behavior change anywhere — this plan is characterization: tests assert what the code **does**, including oddities (document them with a comment, don't fix them). Exception: none.
- `RunSession.tsx`, `CombatantCard.tsx`, `yElement.ts` — owned by plans 003/004.
- supertest / mongodb-memory-server integration tests — **deliberately deferred** (heavy binary download, Pi-hostile); route-level coverage is a future plan.
- The Markdown exporter (`exportMarkdown`) — formatting-only, low risk.

## Git workflow

- One or two commits, e.g. `Extract dice helpers to lib/dice` then `Characterization tests: dice, combatants, share whitelist, import remap, schemas`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Extract dice logic to `apps/front/src/lib/dice.ts`

Move `rollDie`, `parseFormula`, `rollWithEdge` from `DiceRoller.tsx` verbatim into the new module and export them. Give the two rolling functions an **injectable RNG** with the current behavior as default so tests can seed it without changing the component:

```ts
export type Rng = () => number; // [0,1) like Math.random

export function rollDie(sides: number, rng: Rng = Math.random): number {
  return Math.floor(rng() * sides) + 1;
}
export function parseFormula(raw: string): { count: number; sides: number; mod: number } | null { /* moved verbatim */ }
export function rollWithEdge(kind: 'adv' | 'dis', sides: number, count: number, m: number, rng: Rng = Math.random): string { /* moved; pass rng through to rollDie */ }
```

Update `DiceRoller.tsx` to `import { parseFormula, rollDie, rollWithEdge } from '../../lib/dice';` and delete the private copies. No call-site signature changes (the default `rng` keeps them zero-arg-compatible).

**Verify**: `npm run typecheck` → exit 0; `grep -c "function parseFormula" apps/front/src/components/session/DiceRoller.tsx` → `0`.

### Step 2: Dice tests — `apps/front/src/lib/dice.test.ts`

Table-driven `parseFormula` cases (at minimum): `'8d6+3'`→`{8,6,3}`; `'d20-1'`→`{1,20,-1}`; `'3d8'`→`{3,8,0}`; `' 2D10 + 4 '`→`{2,10,4}` (whitespace/case); `'200d6'`→count clamped to 100; `'0d6'`→count clamped to 1; `'1d1'`→null; `'1d1001'`→null; `'d'`, `''`, `'2d6+2d4'`→null.

`rollWithEdge` with a deterministic rng (e.g. a closure yielding a scripted sequence): adv picks the max of each pair, dis the min; **d20 house rule**: output contains one total per pair (comma-separated), not a sum; non-d20 sums picks + mod; modifier renders as `+2`/`-1` and is omitted when 0.

`rollDie` bounds: with `rng: () => 0` → 1; with `rng: () => 0.9999` → `sides`.

**Verify**: `npx vitest run apps/front/src/lib/dice.test.ts` → all pass.

### Step 3: Combatant parsing tests — `apps/back/src/sessions/combatants.test.ts`

Cases: `'2x Goblin'` → `['Goblin 1','Goblin 2']`; `'2 Goblin'` same; `'Goblin x2'` same; `'Bugbear'` → `['Bugbear']` (no suffix); `'50x Rat'` → 30 entries (clamp); mixed multi-line input with blank lines; `undefined`/`''` → `[]`; every combatant has `initiative 0, maxHp 0, currentHp 0, tempHp 0, conditions [], deathSaves {0,0}, isPlayer false, sourceElementId null, notes ''` and a unique 16-hex `cid`.

**Verify**: `npx vitest run apps/back/src/sessions/combatants.test.ts` → all pass.

### Step 4: Share-whitelist tests — `apps/back/src/share/serialize.test.ts`

This is the security boundary; be exhaustive:

- Build a fixture object shaped like an `ElementDoc` (a plain object cast `as never`/`as ElementDoc` is fine — `sharedElement` only reads fields): include `secrets: 'HIDDEN'`, `links: [...]`, `playerVisible: true`, `updatedBy: 'u1'`, `version: 3`, plus a `body` containing a nested mention node `{type:'mention', attrs:{id:'65…', label:'Villain'}}` inside `content` arrays.
- Assert the output's **exact key set** is `['id','type','name','body','tags','data','soundtrack']` (e.g. `expect(Object.keys(out).sort()).toEqual([...])` — this is the future-proofing assertion: any newly added leak changes the key set).
- Assert the serialized body contains no `'mention'` type and no element id string anywhere (`JSON.stringify(out.body)` does not include the mention id), and does contain `'@Villain'`.
- `GM_ONLY_DATA`: a `quest` element with `data.consequences` → stripped, other data keys intact; an `encounter` with `data.combatants/outcome/trigger` → all three stripped; an `npc` keeps its full `data`.

**Verify**: `npx vitest run apps/back/src/share/serialize.test.ts` → all pass.

### Step 5: Extract and test the import remap

Create `apps/back/src/share/importRemap.ts` containing the logic currently inline in `campaigns/routes.ts:193-236`, as a pure function:

```ts
import mongoose from 'mongoose';

export interface ImportedElementSrc { id?: unknown; type?: unknown; name?: unknown; body?: unknown; tags?: unknown; links?: unknown; data?: unknown; playerVisible?: unknown; secrets?: unknown; }

/** Build the idMap + remapped element docs for a campaign import (pure aside from ObjectId minting). */
export function remapImportedElements(srcElements: ImportedElementSrc[]): {
  idMap: Map<string, mongoose.Types.ObjectId>;
  docs: Array</* the same doc shape the route builds today, minus campaignId/updatedBy */>;
}
```

Move the `idMap` construction, `remapIds` closure, the `links` filter/rebuild, and the per-element doc mapping (name slice(0,200), tags/data/playerVisible/secrets normalization) into it **verbatim in behavior**. The route then does: filter by `ELEMENT_TYPES` (stays in the route), call the helper, then spread `campaignId`/`updatedBy` onto each doc before `insertMany`. `deriveBodyText` moves with it or stays via the same dynamic import — keep whichever compiles cleanly, behavior identical.

Tests in `importRemap.test.ts` — the **round-trip property**: given two elements A→B (A's body contains a mention node with B's old id; A's links contain `{targetId: B.oldId, source:'mention'}`):
- both get fresh ObjectIds; no old id string appears anywhere in the output docs (`JSON.stringify` scan);
- A's body mention id === the new id assigned to B (as string);
- A's `links[0].targetId` equals B's new ObjectId;
- a link whose target id is **not** in the import is dropped;
- an element with no `id` field still gets a doc with a fresh `_id`;
- name longer than 200 chars is truncated.

**Verify**: `npm run typecheck` → exit 0; `npx vitest run apps/back/src/share/importRemap.test.ts` → all pass. Manual: export any campaign to JSON, re-import it, open an element with mentions → mention links resolve to the new copies (proves the route wiring didn't change behavior).

### Step 6: Schema fixtures — `packages/shared/src/schemas/elements/schemas.test.ts`

For each type in `elementRegistry` (iterate the registry — don't hand-list types): a minimal **valid** create payload passes `safeParse`, and an **invalid** one (missing `name`) fails. Add 2–3 targeted per-type checks where enums exist (e.g. an NPC with an out-of-enum `status` fails; a quest objective list roundtrips). Read the schema files first; do not guess field names.

**Verify**: `npx vitest run packages/shared/src/schemas/elements/schemas.test.ts` → all pass. Note: this file lives in `packages/shared/src`, and `packages/shared/tsconfig.json` `include: ["src"]` will try to **emit** it on build — add `"exclude": ["src/**/*.test.ts"]` to `packages/shared/tsconfig.json` (this mirrors plan 001's Step 5 note for the back).

### Step 7: Generator invariants — `generators.test.ts` and `quests.test.ts`

`generateParty`: for a party of 4–5 across multiple runs (loop ~20 iterations, default RNG is fine for invariants): each character has 6 ability scores that are a permutation of the standard array used in the file (read the file to confirm the array), HP ≥ 1, AC within [8, 20], and names/classes non-empty. `questProgress`: 0/0, some-done, all-done cases matching the current arithmetic.

**Verify**: `npx vitest run apps/front/src/lib/generators.test.ts apps/front/src/lib/quests.test.ts` → all pass.

## Test plan

This plan **is** a test plan; the steps above enumerate files and cases. Structural exemplar: `apps/back/src/campaigns/access.test.ts` (plan 001). Final verification: `npm test` → all suites pass, ≥ 6 new test files.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0; `find apps packages -name "*.test.ts" -not -path "*/node_modules/*" | wc -l` ≥ 7
- [ ] `npm run typecheck` and `npm run build` exit 0; no `*.test.js` under any `dist/`
- [ ] `grep -c "function parseFormula\|function rollWithEdge\|function rollDie" apps/front/src/components/session/DiceRoller.tsx` prints `0`
- [ ] `grep -n "const remapIds" apps/back/src/campaigns/routes.ts` → no matches (extracted)
- [ ] The key-set assertion exists: `grep -n "Object.keys" apps/back/src/share/serialize.test.ts` matches
- [ ] `git status --porcelain` shows changes only to in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any characterization test reveals behavior that looks like a *real bug* (not an oddity) — e.g. the import remap drops links it should keep. Record the failing case, mark the test `.todo` with a comment, and report; do NOT fix behavior in this plan.
- Extracting the remap closure requires changing what the route persists (field order/shape in Mongo) in any way you can't make byte-identical.
- Plans 003/004 landed changes to `DiceRoller.tsx`/`campaigns/routes.ts` that conflict with the extraction (drift check catches this).
- `packages/shared` test placement breaks the `build:shared` step even with the tsconfig exclude.

## Maintenance notes

- The serialize key-set test is the guardrail for the share security boundary — reviewers of any future `Element` field addition should expect that test to fail and be updated **consciously**.
- Deferred: route-level integration tests (supertest + in-memory Mongo) for authz gates and the full import HTTP path — revisit when CI hardware isn't a constraint.
- When plan 003's `applyHeal` and 004's race test exist, keep all pure-logic tests co-located with their modules (the repo's emerging convention from this plan).
