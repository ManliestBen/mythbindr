# Plan 001: Establish a verification baseline — Vitest test runner + GitHub Actions CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4cea7..HEAD -- package.json apps/back/package.json apps/front/package.json packages/shared/package.json apps/back/src/campaigns/access.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / dx
- **Planned at**: commit `8d4cea7`, 2026-07-14

## Why this matters

This repo has **zero test files, no test runner, and no CI** — the only verification that exists is `npm run typecheck` and `npm run build`, and nothing runs even those automatically. Every other plan in `plans/` needs a way to prove it didn't break anything. This plan installs Vitest, adds one real smoke test, wires a root `npm test`, and adds a GitHub Actions workflow that runs typecheck + tests + build on every push/PR. It is deliberately small: the goal is the *scaffold*, not coverage (coverage is plan 005).

## Current state

- Root `package.json` — npm workspaces (`packages/*`, `apps/*`). Scripts today:

  ```json
  "scripts": {
    "build:shared": "npm run build -w @mythbindr/shared",
    "build": "npm run build:shared && npm run build -w @mythbindr/back && npm run build -w @mythbindr/front",
    "typecheck": "npm run build:shared && npm run typecheck -w @mythbindr/back && npm run typecheck -w @mythbindr/front",
    "dev:back": "npm run dev -w @mythbindr/back",
    "dev:front": "npm run dev -w @mythbindr/front"
  }
  ```

- `apps/back/tsconfig.json` — `"module": "CommonJS"`, `"moduleResolution": "Node"`. This does **not** block Vitest: Vitest transforms TS with esbuild and ignores the emit settings.
- `apps/front/tsconfig.json` — `"moduleResolution": "bundler"`, `noEmit`. Front is Vite 6, so Vitest is native there.
- `packages/shared` — plain `tsc` build to `dist/`; the apps import the **built** `dist/`, so `npm run build:shared` must run before anything that imports `@mythbindr/shared`.
- `.github/workflows/` — does not exist.
- There are no test files anywhere: `find . -path ./node_modules -prune -o -name "*.test.*" -print` returns nothing.
- Smoke-test target: `apps/back/src/campaigns/access.ts:9` exports a pure function:

  ```ts
  const ROLE_RANK: Record<MembershipRole, number> = { viewer: 0, editor: 1, owner: 2 };
  export function roleAtLeast(role: MembershipRole, min: MembershipRole): boolean {
    return ROLE_RANK[role] >= ROLE_RANK[min];
  }
  ```

- Repo style: TypeScript strict, 2-space indent, single quotes, semicolons.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `npm install` (repo root) | exit 0 |
| Build shared | `npm run build:shared` | exit 0 |
| Typecheck | `npm run typecheck`      | exit 0, no errors   |
| Build     | `npm run build`          | exit 0              |
| Tests (new) | `npm test`             | all pass            |

## Scope

**In scope** (the only files you should modify/create):
- `package.json` (root — add `vitest` devDependency and `test` script)
- `vitest.config.ts` (root — create)
- `apps/back/src/campaigns/access.test.ts` (create)
- `.github/workflows/ci.yml` (create)
- `package-lock.json` (updated by npm install)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- Any source file other than the new test file — no refactors, no "while I'm here" fixes.
- Per-workspace `package.json` scripts — the `test` script lives at the root only.
- ESLint/Prettier — a separate concern, deliberately not in this plan.
- Writing more tests — that is plan 005.

## Git workflow

- Recent commit style is a short imperative summary on `main` (e.g. `Search type filters and a full activity page`). Match it: one commit, e.g. `Add Vitest baseline and CI workflow`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Install Vitest at the root

At the repo root: `npm install --save-dev vitest`. Vitest must land in the **root** `package.json` devDependencies (workspaces hoist it for all packages).

**Verify**: `npx vitest --version` → prints a version, exit 0.

### Step 2: Create `vitest.config.ts` at the root

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/back/src/**/*.test.ts',
      'apps/front/src/**/*.test.ts',
      'packages/shared/src/**/*.test.ts',
    ],
  },
});
```

Note: `environment: 'node'` is correct — planned tests target pure logic, not DOM components. If component tests are ever added, a `jsdom` project can be added then.

**Verify**: `npx vitest run` → exits 0 with "no test files found" (or similar) — config parses.

### Step 3: Add the smoke test

Create `apps/back/src/campaigns/access.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { roleAtLeast } from './access';

describe('roleAtLeast', () => {
  it('covers the full owner>editor>viewer matrix', () => {
    expect(roleAtLeast('owner', 'viewer')).toBe(true);
    expect(roleAtLeast('owner', 'editor')).toBe(true);
    expect(roleAtLeast('owner', 'owner')).toBe(true);
    expect(roleAtLeast('editor', 'viewer')).toBe(true);
    expect(roleAtLeast('editor', 'editor')).toBe(true);
    expect(roleAtLeast('editor', 'owner')).toBe(false);
    expect(roleAtLeast('viewer', 'viewer')).toBe(true);
    expect(roleAtLeast('viewer', 'editor')).toBe(false);
    expect(roleAtLeast('viewer', 'owner')).toBe(false);
  });
});
```

Heads-up: `access.ts` imports `../models/Campaign` and `../models/Membership` (mongoose models). Importing the module registers models but opens **no** connection, so this runs fine under plain Vitest. If the import chain fails at runtime, see STOP conditions.

**Verify**: `npm run build:shared && npx vitest run` → 1 file, 1 test passed.

### Step 4: Add the root `test` script

In root `package.json` scripts, add:

```json
"test": "npm run build:shared && vitest run"
```

(`build:shared` first because test files may transitively import `@mythbindr/shared`, which resolves to its built `dist/`.)

**Verify**: `npm test` → exit 0, 1 test passed.

### Step 5: Ensure the back typecheck ignores test-runner types cleanly

Run `npm run typecheck`. `apps/back/tsconfig.json` has `"include": ["src"]`, so the new `access.test.ts` is compiled by `tsc -p tsconfig.json --noEmit`. Vitest's `describe/expect/it` are **imported** (not globals), so no `types` entry is needed. If typecheck errors on the test file anyway, add `"exclude": ["src/**/*.test.ts"]` to `apps/back/tsconfig.json` — but note `build` (`tsc -p tsconfig.json`) would otherwise also try to **emit** the test file into `dist/`, so the exclude is the preferred fix if there is any friction.

**Verify**: `npm run typecheck` → exit 0. `npm run build` → exit 0, and `apps/back/dist/` contains no `*.test.js` (if it does, add the exclude above and rebuild).

### Step 6: Create the CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

(`npm run typecheck` already runs `build:shared` first, so ordering is safe.)

**Verify**: `npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || node -e "require('js-yaml')"` may not be available — instead verify with: `node -e "const fs=require('fs'); fs.readFileSync('.github/workflows/ci.yml','utf8')" && git add -n .github/workflows/ci.yml` → exit 0 (file exists and is staged-able). The real verification happens on the first push.

## Test plan

The smoke test in Step 3 **is** the test plan for this plan. Broader coverage is plan 005 (`plans/005-high-value-tests.md`), which depends on this scaffold.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0 and reports ≥1 passing test
- [ ] `npm run build` exits 0 and `ls apps/back/dist | grep -c test` prints `0`
- [ ] `.github/workflows/ci.yml` exists
- [ ] `git status --porcelain` shows changes only to in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Importing `./access` in the test fails at runtime because the mongoose model import chain requires a live DB connection — do not mock mongoose; report so the smoke target can be swapped to a dependency-free module.
- `npm install` at the root modifies workspace `node_modules` layout in a way that breaks `npm run dev:back`/`dev:front` (check both still start).
- The root `overrides.mongodb` pin in `package.json` conflicts with the vitest install (any npm `ERESOLVE` error mentioning `mongodb`).

## Maintenance notes

- Plan 005 adds the real test suite on top of this scaffold; keep `vitest.config.ts` include-globs in sync when tests appear in new directories.
- When ESLint lands (a rejected-for-now finding, see `plans/README.md`), add a `lint` step to `ci.yml`.
- CI installs with `npm ci` — commits must always include an up-to-date `package-lock.json`.
