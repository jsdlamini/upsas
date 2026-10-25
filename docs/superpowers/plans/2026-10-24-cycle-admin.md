# Academic cycle administration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans
> (no subagent tool in this harness). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the hard-coded cycle with per-tenant, admin-managed
`AcademicCycle` rows.

**Architecture:** New `src/lib/cycles.ts` is the single source of truth for
cycle reads/writes; `id == label` preserves the existing
`'2025/2026'`-as-`cycleId` semantics. Signup creates the first current cycle
and grants COORDINATOR against it; Settings manages cycles for admins;
auth/pages resolve the current cycle per tenant with the legacy constant as
fallback.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma/Postgres,
TypeScript, node:test.

**Spec:** `docs/superpowers/specs/2026-10-24-cycle-admin-design.md`

## Global Constraints

- `AcademicCycle.id` must equal `label` (label immutable after create).
- `startsOn`/`endsOn` are required; derive `1 Aug YYYY` → `31 Jul YYYY+1`
  from a `YYYY/YYYY` label when no dates are supplied.
- Cycle management is gated to ADMINISTRATOR/COORDINATOR in UI and server.
- Keep `CYCLE = '2025/2026'` in `src/lib/data/store.ts` as the fallback for
  the unconfigured/no-DB case.
- `npm run typecheck`, `npm test`, `npm run build` must pass.

## Review Focus

1. Signup with a blank cycle label must still produce a valid current cycle
   (fall back to `CYCLE`).
2. Two cycles with the same label in one institution must be rejected
   (unique constraint surfaced as a friendly error).
3. A non-admin calling the cycle server actions must be rejected even when
   the UI is hidden.
4. `getCurrentCycle`/`setCurrentCycle` must be tenant-scoped: tenant A's
   "current" must never leak to tenant B.
5. `startsOn >= endsOn` must be rejected with a clear error.

---

### Task 1: Cycle module (`src/lib/cycles.ts`)

**Files:**
- Create: `src/lib/cycles.ts`
- Test: `tests/cycles.test.ts`

**Interfaces:**
- Produces:
  - `currentCycleId(tenantId: string): Promise<string>`
  - `currentCycleLabel(tenantId: string): Promise<string>`
  - `listCycles(tenantId: string): Promise<AcademicCycleRow[]>`
  - `createCycle(tenantId, institutionId, { label, startsOn, endsOn, isCurrent }): Promise<{ok:true,id:string}|{ok:false,error:string}>`
  - `updateCycle(tenantId, id, { startsOn, endsOn }): Promise<{ok:true}|{ok:false,error:string}>`
  - `setCurrentCycle(tenantId, id): Promise<{ok:true}|{ok:false,error:string}>`
  - `canManageCycles(principal): boolean`
  - `deriveCycleDates(label): { startsOn: Date; endsOn: Date }`

- [ ] **Step 1: Write failing tests** in `tests/cycles.test.ts` covering:
  `createCycle` then `currentCycleId` returns the created id/label;
  `createCycle` rejects duplicate label for same institution;
  `createCycle` rejects `startsOn >= endsOn`;
  `deriveCycleDates('2025/2026')` → 2025-08-01 / 2026-07-31;
  `setCurrentCycle` flips `isCurrent` atomically (exactly one current);
  `listCycles` is tenant-scoped; `canManageCycles` true only for
  ADMINISTRATOR/COORDINATOR.
- [ ] **Step 2:** Run `npm test` — expected RED (module not found / missing exports).
- [ ] **Step 3:** Implement `src/lib/cycles.ts` against Prisma `academicCycle`.
- [ ] **Step 4:** Run `npm test` — expected GREEN.
- [ ] **Step 5:** Commit `feat: add academic cycle store module`.

### Task 2: Signup creates the initial current cycle

**Files:**
- Modify: `src/lib/tenant-provisioning.ts` (createTenant)
- Modify: `src/app/signup/page.tsx` (fields + pass-through)
- Test: extend `tests/tenant-signup.test.ts`

**Interfaces:**
- Consumes: `deriveCycleDates` from Task 1.
- Produces: `createTenant({ ..., cycleLabel?, cycleStartsOn?, cycleEndsOn? })`.

- [ ] **Step 1:** Extend `tenant-signup.test.ts` with a test asserting
  `createTenant` with `cycleLabel: '2025/2026'` creates an `AcademicCycle`
  (id `'2025/2026'`, `isCurrent: true`, correct tenant/institution) and the
  admin's COORDINATOR `RoleAssignment.cycleId === '2025/2026'`.
- [ ] **Step 2:** Run `npm test` — RED.
- [ ] **Step 3:** Implement in `createTenant` (cycle row inside the existing
  transaction; COORDINATOR grant uses the label) and wire the signup form.
- [ ] **Step 4:** Run `npm test` — GREEN.
- [ ] **Step 5:** Commit `feat: create initial current cycle at signup`.

### Task 3: Admin cycle management in Settings

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `listCycles`, `createCycle`, `updateCycle`, `setCurrentCycle`,
  `canManageCycles` from Task 1.

- [ ] **Step 1:** Add server actions (`createCycleAction`,
  `updateCycleAction`, `setCurrentCycleAction`) gated by
  `canManageCycles` + `currentPrincipal`, and an "Academic cycles" section
  (list, create form, edit dates, set-current button).
- [ ] **Step 2:** `npm run typecheck` — clean.
- [ ] **Step 3:** Commit `feat: admin cycle management in settings`.

### Task 4: Resolve the current cycle at runtime

**Files:**
- Modify: `src/lib/auth/current.ts`, `src/app/login/page.tsx`,
  `src/app/register/page.tsx`, `src/app/(app)/cohort/page.tsx`,
  `src/lib/data/store.ts` (deadline accessor defaults), and the
  `2025/2026` literal sites in `src/app/(app)/page.tsx`,
  `src/app/(app)/me/page.tsx`, `src/app/(app)/marks/[studentId]/page.tsx`,
  `src/app/(app)/publish/page.tsx`, `src/app/api/reports/[key]/route.ts`,
  `src/app/api/agreement/[projectId]/route.ts`.

**Interfaces:**
- Consumes: `currentCycleId` / `currentCycleLabel` from Task 1;
  `principal.cycleId` (already on `AuthenticatedPrincipal`).

- [ ] **Step 1:** Change `currentPrincipal()` to pass the resolved
  `currentCycleId(user.tenantId)` to `principalFromSession`.
- [ ] **Step 2:** Change login/register display to `currentCycleLabel('default')`
  (async server components) and login's `cycleId` to the user's resolved cycle.
- [ ] **Step 3:** Change cohort deadline actions to resolve the cycle;
  change the remaining `'2025/2026'` snapshot sites to `principal.cycleId`.
- [ ] **Step 4:** `npm run typecheck` and `npm test` — clean/green.
- [ ] **Step 5:** Commit `feat: resolve current cycle per tenant`.

### Task 5: Full verification

- [ ] **Step 1:** `npm run typecheck` — clean.
- [ ] **Step 2:** `npm test` — green.
- [ ] **Step 3:** `npm run build` — succeeds.
- [ ] **Step 4:** Final self-review against Review Focus; fix Critical/Important
  findings with TDD; ledger deferred minors.
- [ ] **Step 5:** Commit any fixes.
